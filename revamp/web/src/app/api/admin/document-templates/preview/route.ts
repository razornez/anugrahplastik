import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { renderAnonymousDocumentPreview } from "@/features/operations/document-templates";
import { documentTemplateKinds } from "@/features/operations/document-template-shared";

const requestSchema = z.object({
  kind: z.enum(documentTemplateKinds),
  config: z.record(z.string(), z.union([z.string(), z.number()])),
});

export async function POST(request: Request) {
  const user = await getSession();
  if (!user || user.role !== "admin") return Response.json({ message: "Tidak diizinkan." }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "Konfigurasi pratinjau belum valid." }, { status: 400 });
  try {
    const html = await renderAnonymousDocumentPreview(parsed.data.kind, parsed.data.config);
    return new Response(html, {
      headers: {
        "cache-control": "no-store",
        "content-security-policy":
          "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
        "content-type": "text/html; charset=utf-8",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Pratinjau belum dapat dibuat." },
      { status: 422, headers: { "cache-control": "no-store" } },
    );
  }
}
