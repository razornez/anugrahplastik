import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { designStorageUsage } from "@/features/operations/design-file-input";
import {
  derivedPreviewStorageName,
  isCadPreviewable,
  preparePrivateDestination,
  previewFileLimit,
  privateFileExists,
  privateFilePath,
  removePrivateFile,
  storageBlockAt,
  type DesignFormat,
} from "@/features/operations/private-storage";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { auditLogs, productDesignFiles } from "@/lib/database/schema";

function operationsUser(role: string) {
  return role === "admin" || role === "sales";
}

function isValidGlb(buffer: Buffer) {
  return (
    buffer.byteLength >= 20 &&
    buffer.readUInt32LE(0) === 0x46546c67 &&
    buffer.readUInt32LE(4) === 2 &&
    buffer.readUInt32LE(8) === buffer.byteLength
  );
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user || !operationsUser(user.role)) return new NextResponse("Akses ditolak.", { status: 403 });
  const database = getDatabase();
  if (!database) return new NextResponse("Database belum terhubung.", { status: 503 });
  const { id } = await context.params;
  const [file] = await database
    .select({
      checksum: productDesignFiles.checksum,
      storagePath: productDesignFiles.derivedPreviewStoragePath,
      sourceChecksum: productDesignFiles.derivedPreviewSourceChecksum,
    })
    .from(productDesignFiles)
    .where(eq(productDesignFiles.id, id))
    .limit(1);
  if (!file?.storagePath || file.sourceChecksum !== file.checksum || !(await privateFileExists(file.storagePath)))
    return new NextResponse("Preview belum tersedia.", { status: 404 });
  const absolutePath = privateFilePath(file.storagePath);
  const details = await stat(absolutePath);
  const stream = Readable.toWeb(createReadStream(absolutePath)) as ReadableStream;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "model/gltf-binary",
      "Content-Length": String(details.size),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user || !operationsUser(user.role)) return NextResponse.json({ message: "Akses ditolak." }, { status: 403 });
  const database = getDatabase();
  if (!database) return NextResponse.json({ message: "Database belum terhubung." }, { status: 503 });
  const { id } = await context.params;
  let storedPath: string | null = null;
  try {
    const form = await request.formData();
    const preview = form.get("preview");
    const sourceChecksum = String(form.get("sourceChecksum") ?? "");
    if (!(preview instanceof File)) throw new Error("Preview GLB belum diterima.");
    if (preview.size <= 0 || preview.size > previewFileLimit) throw new Error("Preview GLB maksimal 25 MB.");
    if (!["model/gltf-binary", "application/octet-stream", ""].includes(preview.type))
      throw new Error("Format preview tidak valid.");
    const [current] = await database.select().from(productDesignFiles).where(eq(productDesignFiles.id, id)).limit(1);
    if (!current) return NextResponse.json({ message: "File tidak ditemukan." }, { status: 404 });
    if (!isCadPreviewable(current.format as DesignFormat)) throw new Error("File ini tidak memerlukan cache CAD.");
    if (!sourceChecksum || current.checksum !== sourceChecksum)
      return NextResponse.json({ message: "Sumber file telah berubah. Preview dibatalkan." }, { status: 409 });
    if (
      current.derivedPreviewStoragePath &&
      current.derivedPreviewSourceChecksum === current.checksum &&
      (await privateFileExists(current.derivedPreviewStoragePath))
    )
      return NextResponse.json({ created: false, cached: true });
    const usage = await designStorageUsage(database);
    if (usage + preview.size > storageBlockAt)
      return NextResponse.json(
        { message: "Kapasitas hampir penuh. Model tetap dapat dilihat, tetapi preview belum disimpan." },
        { status: 507 },
      );
    const buffer = Buffer.from(await preview.arrayBuffer());
    if (!isValidGlb(buffer)) throw new Error("File preview GLB tidak valid.");
    storedPath = derivedPreviewStorageName();
    const absolutePath = await preparePrivateDestination(storedPath);
    await writeFile(absolutePath, buffer, { flag: "wx", mode: 0o600 });
    const checksum = createHash("sha256").update(buffer).digest("hex");
    const [saved] = await database
      .update(productDesignFiles)
      .set({
        derivedPreviewStoragePath: storedPath,
        derivedPreviewChecksum: checksum,
        derivedPreviewByteSize: buffer.byteLength,
        derivedPreviewSourceChecksum: sourceChecksum,
        derivedPreviewCreatedAt: new Date(),
      })
      .where(
        and(
          eq(productDesignFiles.id, id),
          eq(productDesignFiles.checksum, sourceChecksum),
          isNull(productDesignFiles.derivedPreviewStoragePath),
        ),
      )
      .returning({ id: productDesignFiles.id });
    if (!saved) {
      await removePrivateFile(storedPath);
      storedPath = null;
      return NextResponse.json({ created: false, cached: true });
    }
    await database.insert(auditLogs).values({
      actorId: user.id,
      action: "design.preview_cached",
      entityType: "design_file",
      entityId: id,
      metadata: { sourceChecksum, checksum, byteSize: buffer.byteLength },
    });
    storedPath = null;
    return NextResponse.json({ created: true, checksum }, { status: 201 });
  } catch (error) {
    if (storedPath) await removePrivateFile(storedPath).catch(() => undefined);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Preview belum dapat disimpan." },
      { status: 400 },
    );
  }
}
