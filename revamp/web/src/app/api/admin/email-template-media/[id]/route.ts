import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { emailTemplateMedia } from "@/lib/database/schema";
import { privateFilePath } from "@/features/operations/private-storage";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user || !["admin", "sales"].includes(user.role)) return new Response(null, { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response(null, { status: 404 });
  const database = getDatabase();
  const [media] = database
    ? await database.select().from(emailTemplateMedia).where(eq(emailTemplateMedia.id, id)).limit(1)
    : [];
  if (!media) return new Response(null, { status: 404 });
  try {
    const buffer = await readFile(privateFilePath(media.storagePath));
    return new Response(buffer, {
      headers: {
        "Content-Type": media.mimeType,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
