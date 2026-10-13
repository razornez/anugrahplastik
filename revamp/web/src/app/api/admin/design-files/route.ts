import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { auditLogs, productDesignFiles } from "@/lib/database/schema";
import {
  designStorageUsage,
  normalizedDesignFields,
  readDesignMultipart,
  validateDesignLinks,
  type UploadedDesign,
} from "@/features/operations/design-file-input";
import { removePrivateFile, storageBlockAt, storageWarningAt } from "@/features/operations/private-storage";

function operationsUser(role: string) {
  return role === "admin" || role === "sales";
}

export async function POST(request: Request) {
  const user = await getSession();
  if (!user || !operationsUser(user.role)) return NextResponse.json({ message: "Akses ditolak." }, { status: 403 });
  const database = getDatabase();
  if (!database) return NextResponse.json({ message: "Database belum terhubung." }, { status: 503 });
  let uploaded: UploadedDesign | null = null;
  try {
    const currentUsage = await designStorageUsage(database);
    if (currentUsage >= storageBlockAt)
      return NextResponse.json({ message: "Kapasitas file hampir penuh. Hubungi administrator." }, { status: 507 });
    const { fields, file } = await readDesignMultipart(request, { requireFile: true });
    if (!file) throw new Error("File belum diterima.");
    uploaded = file;
    if (currentUsage + file.byteSize > storageBlockAt) {
      await removePrivateFile(file.storagePath);
      return NextResponse.json({ message: "Upload dibatalkan agar kapasitas file tetap aman." }, { status: 507 });
    }
    const normalized = normalizedDesignFields(fields);
    await validateDesignLinks(database, fields);
    const [record] = await database
      .insert(productDesignFiles)
      .values({
        ...normalized,
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
        origin: normalized.origin,
        materialId: fields.materialId || null,
        hasDescription: Boolean(fields.description?.trim()),
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
