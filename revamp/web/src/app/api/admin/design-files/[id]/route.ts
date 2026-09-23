import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { productDesignFiles } from "@/lib/database/schema";
import { isPreviewable, privateFileExists, storageRoot } from "@/features/operations/private-storage";
import { resolve } from "node:path";

function operationsUser(role: string) {
  return role === "admin" || role === "sales";
}

function downloadName(value: string) {
  return value.replace(/[\\/"\r\n]/g, "_");
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
  const canPreview = isPreviewable(file.format as Parameters<typeof isPreviewable>[0]);
  const disposition =
    new URL(request.url).searchParams.get("download") === "1" || !canPreview ? "attachment" : "inline";
  const absolutePath = resolve(storageRoot(), file.storagePath);
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
