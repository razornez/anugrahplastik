import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { transactionDocuments } from "@/lib/database/schema";
import { privateFilePath } from "@/features/operations/private-storage";

export async function GET(_request: Request, context: { params: Promise<{ id: string; documentId: string }> }) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
  };
  const user = await getSession();
  if (!user || !["admin", "sales"].includes(user.role)) return new Response("Akses ditolak.", { status: 403, headers });
  const params = z.object({ id: z.string().uuid(), documentId: z.string().uuid() }).safeParse(await context.params);
  if (!params.success) return new Response("Foto tidak ditemukan.", { status: 404, headers });
  const database = getDatabase();
  if (!database) return new Response("Database belum terhubung.", { status: 503, headers });
  try {
    const [document] = await database
      .select({
        storagePath: transactionDocuments.storagePath,
        originalName: transactionDocuments.originalName,
        checksum: transactionDocuments.checksum,
      })
      .from(transactionDocuments)
      .where(
        and(
          eq(transactionDocuments.id, params.data.documentId),
          eq(transactionDocuments.transactionId, params.data.id),
          eq(transactionDocuments.type, "quotation_attachment"),
        ),
      )
      .limit(1);
    if (!document?.storagePath || !/\.(png|jpe?g|webp)$/i.test(document.originalName ?? ""))
      throw new Error("Not an image");
    const path = privateFilePath(document.storagePath);
    const info = await stat(path);
    if (!info.isFile() || info.size > 10 * 1024 * 1024) throw new Error("Image too large");
    const file = await readFile(path);
    if (document.checksum && createHash("sha256").update(file).digest("hex") !== document.checksum)
      throw new Error("Checksum mismatch");
    const image = sharp(file, { limitInputPixels: 40_000_000, animated: false });
    const metadata = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format ?? "")) throw new Error("Unsupported image");
    const preview = await image
      .rotate()
      .resize(160, 160, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
    return new Response(new Uint8Array(preview), { headers: { ...headers, "Content-Type": "image/webp" } });
  } catch {
    return new Response("Foto belum tersedia.", { status: 404, headers });
  }
}
