import Busboy from "busboy";
import { open } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { eq, sql } from "drizzle-orm";
import { getDatabase } from "@/lib/database/client";
import {
  businessTransactions,
  customers,
  materials,
  moulds,
  productDesignFiles,
  products,
} from "@/lib/database/schema";
import {
  createFileDigest,
  designFormat,
  isPreviewable,
  preparePrivateDestination,
  previewFileLimit,
  privateFilePath,
  removePrivateFile,
  safeOriginalName,
  sourceFileLimit,
  storageName,
  writePrivateFile,
} from "./private-storage";

export type UploadedDesign = {
  originalName: string;
  format: NonNullable<ReturnType<typeof designFormat>>;
  mimeType: string;
  byteSize: number;
  checksum: string;
  storagePath: string;
};

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

async function storedFileMatchesFormat(file: {
  format: UploadedDesign["format"];
  storagePath: string;
  byteSize: number;
}) {
  if (file.format === "prt") return true;
  const handle = await open(privateFilePath(file.storagePath), "r");
  try {
    const header = Buffer.alloc(Math.min(file.byteSize, 8192));
    await handle.read(header, 0, header.length, 0);
    const text = header.toString("utf8");
    if (file.format === "glb")
      return (
        header.length >= 12 &&
        header.readUInt32LE(0) === 0x46546c67 &&
        header.readUInt32LE(4) === 2 &&
        header.readUInt32LE(8) === file.byteSize
      );
    if (file.format === "step" || file.format === "stp") return /^\s*ISO-10303-21\s*;/i.test(text);
    if (file.format === "iges" || file.format === "igs")
      return text.split(/\r?\n/).some((line) => line.length >= 73 && line[72] === "S");
    if (file.format === "obj") return /(^|\r?\n)\s*(v|o|g)\s+/m.test(text);
    if (file.format === "dxf") return /(^|\r?\n)\s*SECTION\s*(\r?\n|$)/i.test(text);
    if (file.format === "dwg") return /^AC10\d{2}/.test(text);
    if (file.format === "stl") {
      if (/^\s*solid(?:\s|$)/i.test(text)) return true;
      if (header.length < 84) return false;
      return 84 + header.readUInt32LE(80) * 50 === file.byteSize;
    }
    return true;
  } finally {
    await handle.close();
  }
}

export async function designStorageUsage(database: NonNullable<ReturnType<typeof getDatabase>>) {
  const [row] = await database
    .select({
      total: sql<string>`coalesce(sum(${productDesignFiles.byteSize} + coalesce(${productDesignFiles.thumbnailByteSize}, 0) + coalesce(${productDesignFiles.derivedPreviewByteSize}, 0)), 0)`,
    })
    .from(productDesignFiles);
  return Number(row?.total ?? 0);
}

export function normalizedDesignFields(fields: Record<string, string>) {
  return {
    productId: fields.productId || null,
    mouldId: fields.mouldId || null,
    customerId: fields.customerId || null,
    transactionId: fields.transactionId || null,
    materialId: fields.materialId || null,
    description: fields.description?.trim().slice(0, 1000) || null,
    origin: fields.origin === "customer" ? "customer" : "internal",
    fileKind: fields.fileKind === "preview" ? "preview" : fields.fileKind === "reference" ? "reference" : "source",
  } as const;
}

export async function validateDesignLinks(
  database: NonNullable<ReturnType<typeof getDatabase>>,
  fields: Record<string, string>,
) {
  const checks = await Promise.all([
    fields.productId
      ? database.select({ id: products.id }).from(products).where(eq(products.id, fields.productId)).limit(1)
      : Promise.resolve([]),
    fields.mouldId
      ? database.select({ id: moulds.id }).from(moulds).where(eq(moulds.id, fields.mouldId)).limit(1)
      : Promise.resolve([]),
    fields.customerId
      ? database.select({ id: customers.id }).from(customers).where(eq(customers.id, fields.customerId)).limit(1)
      : Promise.resolve([]),
    fields.transactionId
      ? database
          .select({ id: businessTransactions.id })
          .from(businessTransactions)
          .where(eq(businessTransactions.id, fields.transactionId))
          .limit(1)
      : Promise.resolve([]),
    fields.materialId
      ? database.select({ id: materials.id }).from(materials).where(eq(materials.id, fields.materialId)).limit(1)
      : Promise.resolve([]),
  ]);
  if (
    checks.some(
      (rows, index) =>
        [fields.productId, fields.mouldId, fields.customerId, fields.transactionId, fields.materialId][index] &&
        !rows.length,
    )
  ) {
    throw new Error("Data yang dipilih sudah tidak tersedia. Muat ulang halaman lalu pilih kembali.");
  }
}

export async function readDesignMultipart(
  request: Request,
  { requireFile }: { requireFile: boolean },
): Promise<{ fields: Record<string, string>; file: UploadedDesign | null }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data")) throw new Error("Gunakan formulir upload.");
  const busboy = Busboy({
    headers: { "content-type": contentType },
    limits: { files: 1, fields: 16, fileSize: sourceFileLimit },
  });
  const fields: Record<string, string> = {};
  let written: UploadedDesign | null = null;
  let writeError: Error | null = null;
  const fileWrites: Promise<void>[] = [];
  const pendingPaths = new Set<string>();
  busboy.on("field", (name, value) => {
    fields[name] = value.slice(0, name === "description" ? 1000 : 500);
  });
  busboy.on("file", (_name, stream, info) => {
    if (!info.filename) {
      stream.resume();
      return;
    }
    if (written || fileWrites.length || writeError) {
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
    pendingPaths.add(relativePath);
    let byteSize = 0;
    const digest = createFileDigest();
    const saveFile = (async () => {
      try {
        const absolutePath = await preparePrivateDestination(relativePath);
        const output = writePrivateFile(absolutePath);
        stream.on("data", (chunk: Buffer) => {
          byteSize += chunk.length;
          digest.update(chunk);
        });
        stream.on("limit", () => {
          writeError = new Error("Ukuran file sumber maksimal 100 MB.");
          output.destroy(writeError);
        });
        await pipeline(stream, output);
        if (writeError) return;
        if (isPreviewable(format) && byteSize > previewFileLimit) {
          writeError = new Error("File preview STL, OBJ, atau GLB maksimal 25 MB.");
          return;
        }
        if (!(await storedFileMatchesFormat({ format, storagePath: relativePath, byteSize }))) {
          writeError = new Error("Isi file tidak sesuai dengan format pada nama file.");
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
      } catch (error) {
        writeError = error instanceof Error ? error : new Error("File tidak dapat disimpan.");
      }
    })();
    fileWrites.push(saveFile);
  });
  if (!request.body) throw new Error(requireFile ? "File belum dipilih." : "Formulir belum diterima.");
  let parseError: Error | null = null;
  try {
    await pipeline(Readable.fromWeb(request.body as never), busboy);
  } catch (error) {
    parseError = error instanceof Error ? error : new Error("Upload terputus.");
  }
  await Promise.all(fileWrites);
  if (parseError || writeError || (requireFile && !written)) {
    await Promise.all([...pendingPaths].map((path) => removePrivateFile(path).catch(() => undefined)));
    const error = parseError ?? writeError ?? new Error("File belum diterima.");
    if (/unexpected end of form|aborted|premature close|terminated/i.test(error.message)) {
      throw new Error("Upload terputus sebelum file selesai diterima. Silakan coba lagi.");
    }
    throw error;
  }
  return { fields, file: written };
}
