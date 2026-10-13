import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  designStorageUsage,
  normalizedDesignFields,
  readDesignMultipart,
  validateDesignLinks,
  type UploadedDesign,
} from "@/features/operations/design-file-input";
import {
  designFormat,
  isBrowserPreviewable,
  privateFileExists,
  privateFilePath,
  removePrivateFile,
  safeOriginalName,
  storageBlockAt,
} from "@/features/operations/private-storage";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { auditLogs, productDesignFiles } from "@/lib/database/schema";

function operationsUser(role: string) {
  return role === "admin" || role === "sales";
}

function downloadName(value: string) {
  return value.replace(/[\\/"\r\n]/g, "_");
}

function refreshDesigns(id: string) {
  revalidatePath("/admin/masters/designs");
  revalidatePath(`/admin/masters/designs/${id}`);
}

async function removeStoredFiles(paths: Array<string | null | undefined>) {
  await Promise.all(paths.filter((path): path is string => Boolean(path)).map((path) => removePrivateFile(path)));
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user || !operationsUser(user.role)) return new NextResponse("Akses ditolak.", { status: 403 });
  const database = getDatabase();
  if (!database) return new NextResponse("Database belum terhubung.", { status: 503 });
  const { id } = await context.params;
  const [file] = await database.select().from(productDesignFiles).where(eq(productDesignFiles.id, id)).limit(1);
  if (!file || !(await privateFileExists(file.storagePath)))
    return new NextResponse("File tidak ditemukan.", { status: 404 });
  const canPreview = isBrowserPreviewable(file.format as Parameters<typeof isBrowserPreviewable>[0]);
  const disposition =
    new URL(request.url).searchParams.get("download") === "1" || !canPreview ? "attachment" : "inline";
  const absolutePath = privateFilePath(file.storagePath);
  const details = await stat(absolutePath);
  const stream = Readable.toWeb(createReadStream(absolutePath)) as ReadableStream;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": file.mimeType || "application/octet-stream",
      "Content-Length": String(details.size),
      "Content-Disposition": `${disposition}; filename="${downloadName(file.originalName)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user || !operationsUser(user.role)) return NextResponse.json({ message: "Akses ditolak." }, { status: 403 });
  const database = getDatabase();
  if (!database) return NextResponse.json({ message: "Database belum terhubung." }, { status: 503 });
  const { id } = await context.params;
  let replacement: UploadedDesign | null = null;
  try {
    const parsed = await readDesignMultipart(request, { requireFile: false });
    replacement = parsed.file;
    const fields = parsed.fields;
    await validateDesignLinks(database, fields);
    const [current] = await database.select().from(productDesignFiles).where(eq(productDesignFiles.id, id)).limit(1);
    if (!current) {
      if (replacement) await removePrivateFile(replacement.storagePath);
      return NextResponse.json({ message: "File tidak ditemukan." }, { status: 404 });
    }
    const expectedUpdatedAt = fields.expectedUpdatedAt ? new Date(fields.expectedUpdatedAt) : null;
    if (!expectedUpdatedAt || Number.isNaN(expectedUpdatedAt.getTime()))
      throw new Error("Versi data tidak valid. Muat ulang halaman lalu coba lagi.");
    if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
      if (replacement) await removePrivateFile(replacement.storagePath);
      return NextResponse.json(
        { message: "File telah diubah oleh pengguna lain. Muat ulang halaman sebelum menyimpan." },
        { status: 409 },
      );
    }
    const nextName = safeOriginalName(fields.originalName || replacement?.originalName || current.originalName);
    const nextFormat = designFormat(nextName);
    const actualFormat = replacement?.format ?? current.format;
    if (!nextFormat || nextFormat !== actualFormat)
      throw new Error(`Nama file harus tetap memakai ekstensi .${actualFormat}.`);
    if (replacement) {
      const usage = await designStorageUsage(database);
      const reclaimed = current.byteSize + (current.thumbnailByteSize ?? 0) + (current.derivedPreviewByteSize ?? 0);
      if (usage - reclaimed + replacement.byteSize > storageBlockAt)
        throw new Error("Penggantian dibatalkan agar kapasitas file tetap aman.");
    }
    const normalized = normalizedDesignFields(fields);
    const now = new Date();
    const updated = await database.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(productDesignFiles)
        .where(eq(productDesignFiles.id, id))
        .for("update")
        .limit(1);
      if (!locked || locked.updatedAt.getTime() !== expectedUpdatedAt.getTime()) return null;
      const [saved] = await tx
        .update(productDesignFiles)
        .set({
          ...normalized,
          originalName: nextName,
          ...(replacement
            ? {
                format: replacement.format,
                storagePath: replacement.storagePath,
                mimeType: replacement.mimeType,
                byteSize: replacement.byteSize,
                checksum: replacement.checksum,
                version: sql`${productDesignFiles.version} + 1`,
                thumbnailStoragePath: null,
                thumbnailChecksum: null,
                thumbnailByteSize: null,
                derivedPreviewStoragePath: null,
                derivedPreviewChecksum: null,
                derivedPreviewByteSize: null,
                derivedPreviewSourceChecksum: null,
                derivedPreviewCreatedAt: null,
              }
            : {}),
          updatedAt: now,
        })
        .where(and(eq(productDesignFiles.id, id), eq(productDesignFiles.updatedAt, expectedUpdatedAt)))
        .returning({ updatedAt: productDesignFiles.updatedAt, version: productDesignFiles.version });
      if (!saved) return null;
      await tx.insert(auditLogs).values({
        actorId: user.id,
        action: replacement ? "design.source_replaced" : "design.metadata_updated",
        entityType: "design_file",
        entityId: id,
        metadata: {
          originalName: nextName,
          format: actualFormat,
          version: saved.version,
          checksum: replacement?.checksum ?? current.checksum,
          byteSize: replacement?.byteSize ?? current.byteSize,
        },
      });
      return saved;
    });
    if (!updated) {
      if (replacement) await removePrivateFile(replacement.storagePath);
      return NextResponse.json(
        { message: "File telah diubah oleh pengguna lain. Muat ulang halaman sebelum menyimpan." },
        { status: 409 },
      );
    }
    if (replacement) {
      await removeStoredFiles([
        current.storagePath,
        current.thumbnailStoragePath,
        current.derivedPreviewStoragePath,
      ]).catch(() => undefined);
    }
    refreshDesigns(id);
    return NextResponse.json({ id, updatedAt: updated.updatedAt.toISOString(), version: updated.version });
  } catch (error) {
    if (replacement) await removePrivateFile(replacement.storagePath).catch(() => undefined);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Perubahan belum dapat disimpan." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user || user.role !== "admin") return NextResponse.json({ message: "Akses ditolak." }, { status: 403 });
  const database = getDatabase();
  if (!database) return NextResponse.json({ message: "Database belum terhubung." }, { status: 503 });
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { confirmation?: string } | null;
  const [current] = await database.select().from(productDesignFiles).where(eq(productDesignFiles.id, id)).limit(1);
  if (!current) return NextResponse.json({ message: "File tidak ditemukan." }, { status: 404 });
  if (body?.confirmation !== current.originalName)
    return NextResponse.json({ message: "Ketik nama file dengan tepat untuk menghapusnya." }, { status: 400 });
  await database.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(productDesignFiles)
      .where(eq(productDesignFiles.id, id))
      .for("update")
      .limit(1);
    if (!locked) throw new Error("File tidak ditemukan.");
    await tx.delete(productDesignFiles).where(eq(productDesignFiles.id, id));
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "design.deleted",
      entityType: "design_file",
      entityId: id,
      metadata: {
        originalName: locked.originalName,
        format: locked.format,
        version: locked.version,
        checksum: locked.checksum,
        byteSize: locked.byteSize,
      },
    });
  });
  await removeStoredFiles([current.storagePath, current.thumbnailStoragePath, current.derivedPreviewStoragePath]).catch(
    () => undefined,
  );
  refreshDesigns(id);
  return NextResponse.json({ deleted: true });
}
