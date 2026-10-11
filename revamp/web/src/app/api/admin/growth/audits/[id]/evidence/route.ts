import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { growthSearchAudits } from "@/lib/database/schema";
import { privateFilePath } from "@/features/operations/private-storage";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user || user.role !== "admin") return new Response("Tidak diizinkan.", { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Tidak ditemukan.", { status: 404 });
  const database = getDatabase();
  if (!database) return new Response("Database belum terhubung.", { status: 503 });
  const [audit] = await database
    .select({ path: growthSearchAudits.evidencePath, checksum: growthSearchAudits.evidenceChecksum })
    .from(growthSearchAudits)
    .where(eq(growthSearchAudits.id, id));
  if (!audit?.path || !audit.checksum) return new Response("Tidak ditemukan.", { status: 404 });
  try {
    const file = await readFile(privateFilePath(audit.path));
    if (createHash("sha256").update(file).digest("hex") !== audit.checksum)
      return new Response("Berkas tidak cocok dengan arsip.", { status: 409 });
    return new Response(file, {
      headers: {
        "Content-Type": "image/webp",
        "Content-Disposition": `inline; filename="audit-${id}.webp"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Berkas tidak ditemukan.", { status: 404 });
  }
}
