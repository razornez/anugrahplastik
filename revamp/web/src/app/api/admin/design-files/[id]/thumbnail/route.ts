import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { auditLogs, productDesignFiles } from "@/lib/database/schema";
import {
  isPreviewable,
  preparePrivateDestination,
  privateFileExists,
  privateFilePath,
  thumbnailStorageName,
} from "@/features/operations/private-storage";

const thumbnailLimit = 750 * 1024;

function operationsUser(role: string) {
  return role === "admin" || role === "sales";
}

async function findFile(id: string) {
  const database = getDatabase();
  if (!database) return { database: null, file: null };
  const [file] = await database.select().from(productDesignFiles).where(eq(productDesignFiles.id, id)).limit(1);
  return { database, file: file ?? null };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user || !operationsUser(user.role)) return new NextResponse("Akses ditolak.", { status: 403 });
  const { id } = await context.params;
  const { file } = await findFile(id);
  if (!file?.thumbnailStoragePath || !(await privateFileExists(file.thumbnailStoragePath)))
    return new NextResponse("Thumbnail belum tersedia.", { status: 404 });
  const absolutePath = privateFilePath(file.thumbnailStoragePath);
  const details = await stat(absolutePath);
  const stream = Readable.toWeb(createReadStream(absolutePath)) as ReadableStream;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(details.size),
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user || !operationsUser(user.role)) return NextResponse.json({ message: "Akses ditolak." }, { status: 403 });
  const { id } = await context.params;
  const { database, file } = await findFile(id);
  if (!database) return NextResponse.json({ message: "Database belum terhubung." }, { status: 503 });
  if (!file || !isPreviewable(file.format as Parameters<typeof isPreviewable>[0]))
    return NextResponse.json({ message: "Thumbnail hanya tersedia untuk file STL, OBJ, atau GLB." }, { status: 400 });
  if (file.thumbnailStoragePath) return NextResponse.json({ created: false });
  try {
    const formData = await request.formData();
    const uploaded = formData.get("thumbnail");
    if (!(uploaded instanceof File) || uploaded.type !== "image/webp" || uploaded.size > thumbnailLimit)
      throw new Error("Preview gambar harus berupa WebP maksimal 750 KB.");
    const normalized = await sharp(Buffer.from(await uploaded.arrayBuffer()), { limitInputPixels: 2_000_000 })
      .resize(360, 270, { fit: "contain", background: { r: 244, g: 248, b: 252, alpha: 1 } })
      .webp({ quality: 82 })
      .toBuffer();
    if (!normalized.length || normalized.length > thumbnailLimit) throw new Error("Preview gambar terlalu besar.");
    const storagePath = thumbnailStorageName();
    const absolutePath = await preparePrivateDestination(storagePath);
    await writeFile(absolutePath, normalized, { flag: "wx", mode: 0o600 });
    const checksum = createHash("sha256").update(normalized).digest("hex");
    const updated = await database
      .update(productDesignFiles)
      .set({
        thumbnailStoragePath: storagePath,
        thumbnailChecksum: checksum,
        thumbnailByteSize: normalized.length,
        thumbnailCreatedAt: new Date(),
      })
      .where(and(eq(productDesignFiles.id, id), isNull(productDesignFiles.thumbnailStoragePath)))
      .returning({ id: productDesignFiles.id });
    if (!updated.length) {
      await import("@/features/operations/private-storage").then(({ removePrivateFile }) =>
        removePrivateFile(storagePath),
      );
      return NextResponse.json({ created: false });
    }
    await database.insert(auditLogs).values({
      actorId: user.id,
      action: "design.thumbnail_created",
      entityType: "design_file",
      entityId: id,
      metadata: { byteSize: normalized.length, checksum },
    });
    return NextResponse.json({ created: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Thumbnail gagal disimpan." },
      { status: 400 },
    );
  }
}
