import Busboy from "busboy";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { auditLogs, productDesignFiles } from "@/lib/database/schema";
import {
  createFileDigest,
  designFormat,
  isPreviewable,
  preparePrivateDestination,
  previewFileLimit,
  removePrivateFile,
  safeOriginalName,
  sourceFileLimit,
  storageBlockAt,
  storageName,
  storageWarningAt,
  writePrivateFile,
} from "@/features/operations/private-storage";

type UploadedDesign = {
  originalName: string;
  format: NonNullable<ReturnType<typeof designFormat>>;
  mimeType: string;
  byteSize: number;
  checksum: string;
  storagePath: string;
};

function operationsUser(role: string) {
  return role === "admin" || role === "sales";
}

function allowedMime(format: UploadedDesign["format"], mimeType: string) {
  if (mimeType === "application/octet-stream" || mimeType === "binary/octet-stream") return true;
  const expected: Partial<Record<UploadedDesign["format"], string[]>> = {
    stl: ["model/stl", "application/sla"],
    obj: ["text/plain", "model/obj"],
    glb: ["model/gltf-binary"],
    dxf: ["image/vnd.dxf", "application/dxf"],
    dwg: ["image/vnd.dwg", "application/acad"],
  };
  return (expected[format] ?? []).includes(mimeType);
}

async function usedStorageBytes() {
  const database = getDatabase();
  if (!database) return 0;
  const [row] = await database
    .select({ total: sql<string>`coalesce(sum(${productDesignFiles.byteSize}), 0)` })
    .from(productDesignFiles);
  return Number(row?.total ?? 0);
}

async function readDesign(request: Request): Promise<{ fields: Record<string, string>; file: UploadedDesign }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data")) throw new Error("Gunakan formulir upload.");
  const busboy = Busboy({
    headers: { "content-type": contentType },
    limits: { files: 1, fields: 12, fileSize: sourceFileLimit },
  });
  const fields: Record<string, string> = {};
  let written: UploadedDesign | null = null;
  let writeError: Error | null = null;
  const fileWrites: Promise<void>[] = [];
  const completion = new Promise<void>((resolve, reject) => {
    busboy.on("field", (name, value) => {
      fields[name] = value.slice(0, 500);
    });
    busboy.on("file", (_name, stream, info) => {
      if (written || writeError) {
        stream.resume();
        writeError = new Error("Hanya satu file dapat diunggah sekali.");
        return;
      }
      const originalName = safeOriginalName(info.filename);
      const format = designFormat(originalName);
      if (!format || !allowedMime(format, info.mimeType)) {
        stream.resume();
        writeError = new Error("Format file tidak diizinkan.");
        return;
      }
      const relativePath = storageName(format);
      let byteSize = 0;
      const digest = createFileDigest();
      const saveFile = preparePrivateDestination(relativePath)
        .then((absolutePath) => {
          const output = writePrivateFile(absolutePath);
          stream.on("data", (chunk: Buffer) => {
            byteSize += chunk.length;
            digest.update(chunk);
          });
          stream.on("limit", () => {
            writeError = new Error("Ukuran file sumber maksimal 100 MB.");
            output.destroy(writeError);
          });
          return new Promise<void>((resolve, reject) => {
            output.on("error", reject);
            output.on("finish", () => {
              if (writeError) {
                reject(writeError);
                return;
              }
              if (isPreviewable(format) && byteSize > previewFileLimit) {
                reject(new Error("File preview STL, OBJ, atau GLB maksimal 25 MB."));
                return;
              }
              written = {
                originalName,
                format,
                mimeType: info.mimeType,
                byteSize,
                checksum: digest.digest("hex"),
                storagePath: relativePath,
              };
              resolve();
            });
            stream.pipe(output);
          });
        })
        .catch((error: unknown) => {
          writeError = error instanceof Error ? error : new Error("File tidak dapat disimpan.");
          throw writeError;
        });
      fileWrites.push(saveFile);
    });
    busboy.on("error", reject);
    busboy.on("finish", () => resolve());
  });
  if (!request.body) throw new Error("File belum dipilih.");
  Readable.fromWeb(request.body as never).pipe(busboy);
  await completion;
  await Promise.all(fileWrites);
  if (writeError) throw writeError;
  if (!written) throw new Error("File belum diterima.");
  return { fields, file: written };
}

export async function POST(request: Request) {
  const user = await getSession();
  if (!user || !operationsUser(user.role)) return NextResponse.json({ message: "Akses ditolak." }, { status: 403 });
  const database = getDatabase();
  if (!database) return NextResponse.json({ message: "Database belum terhubung." }, { status: 503 });
  let uploaded: UploadedDesign | null = null;
  try {
    const currentUsage = await usedStorageBytes();
    if (currentUsage >= storageBlockAt)
      return NextResponse.json({ message: "Kapasitas file hampir penuh. Hubungi administrator." }, { status: 507 });
    const { fields, file } = await readDesign(request);
    uploaded = file;
    if (currentUsage + file.byteSize > storageBlockAt) {
      await removePrivateFile(file.storagePath);
      return NextResponse.json({ message: "Upload dibatalkan agar kapasitas file tetap aman." }, { status: 507 });
    }
    const origin = fields.origin === "customer" ? "customer" : "internal";
    const fileKind =
      fields.fileKind === "preview" ? "preview" : fields.fileKind === "reference" ? "reference" : "source";
    const links = [fields.productId, fields.mouldId, fields.customerId, fields.transactionId].filter(Boolean);
    if (!links.length) throw new Error("Tautkan file ke barang, mould, customer, atau transaksi.");
    const [record] = await database
      .insert(productDesignFiles)
      .values({
        productId: fields.productId || null,
        mouldId: fields.mouldId || null,
        customerId: fields.customerId || null,
        transactionId: fields.transactionId || null,
        origin,
        fileKind,
        format: file.format,
        storagePath: file.storagePath,
        originalName: file.originalName,
        mimeType: file.mimeType,
        byteSize: file.byteSize,
        checksum: file.checksum,
        createdBy: user.id,
      })
      .returning({ id: productDesignFiles.id });
    await database.insert(auditLogs).values({
      actorId: user.id,
      action: "design.uploaded",
      entityType: "design_file",
      entityId: record.id,
      metadata: {
        format: file.format,
        byteSize: file.byteSize,
        origin,
        capacityWarning: currentUsage + file.byteSize >= storageWarningAt,
      },
    });
    return NextResponse.json(
      { id: record.id, capacityWarning: currentUsage + file.byteSize >= storageWarningAt },
      { status: 201 },
    );
  } catch (error) {
    if (uploaded) await removePrivateFile(uploaded.storagePath).catch(() => undefined);
    return NextResponse.json({ message: error instanceof Error ? error.message : "Upload gagal." }, { status: 400 });
  }
}
