import { readFile, stat } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { transactionDocuments } from "@/lib/database/schema";
import { privateFilePath } from "@/features/operations/private-storage";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const user = await getSession();
  if (!user || (user.role !== "admin" && user.role !== "sales")) return new Response("Akses ditolak.", { status: 403 });
  const { id, documentId } = await params;
  const database = getDatabase();
  if (!database) return new Response("Data belum tersedia.", { status: 503 });
  const [document] = await database
    .select({ storagePath: transactionDocuments.storagePath, originalName: transactionDocuments.originalName })
    .from(transactionDocuments)
    .where(and(eq(transactionDocuments.id, documentId), eq(transactionDocuments.transactionId, id)))
    .limit(1);
  if (!document?.storagePath) return new Response("Dokumen belum siap.", { status: 404 });
  try {
    const path = privateFilePath(document.storagePath);
    const info = await stat(path);
    if (!info.isFile() || info.size > 15 * 1024 * 1024) return new Response("Dokumen tidak tersedia.", { status: 404 });
    const file = await readFile(path);
    const name = (document.originalName ?? "dokumen.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
    const contentType = /\.png$/i.test(name) ? "image/png" : /\.jpe?g$/i.test(name) ? "image/jpeg" : "application/pdf";
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${name}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch {
    return new Response("Dokumen tidak tersedia.", { status: 404 });
  }
}
