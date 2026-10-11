import { NextResponse } from "next/server";
import { uploadDraftFile, readDraft, downloadDraftFile } from "@/features/integrations/email-drafts";
import { maxUploadBytes } from "@/features/integrations/email-workspace-model";
import { getSession } from "@/lib/auth/session";
import { isRequestOriginAllowed } from "@/lib/security/request-origin";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user || !["admin", "sales"].includes(user.role))
    return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  const { id } = await params;
  const url = new URL(request.url);
  if (!isRequestOriginAllowed(request, { environment: process.env.NODE_ENV, appOrigin: process.env.APP_ORIGIN }))
    return NextResponse.json(
      { error: "Asal permintaan ditolak. Muat ulang halaman dari alamat aplikasi yang benar, lalu coba lagi." },
      { status: 403 },
    );
  const revision = Number(url.searchParams.get("revision"));
  if (!Number.isInteger(revision) || revision < 1)
    return NextResponse.json({ error: "Revisi draf tidak valid." }, { status: 400 });
  const reader = request.body?.getReader();
  if (!reader) return NextResponse.json({ error: "Berkas kosong." }, { status: 400 });
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    await readDraft(id);
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxUploadBytes) {
        await reader.cancel();
        return NextResponse.json({ error: "Berkas melebihi 10 MB." }, { status: 413 });
      }
      chunks.push(Buffer.from(value));
    }
    const draft = await uploadDraftFile(
      id,
      revision,
      url.searchParams.get("filename") ?? "lampiran",
      Buffer.concat(chunks),
    );
    return NextResponse.json(
      { revision: draft.revision, files: draft.files },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unggah gagal." }, { status: 400 });
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const file = await downloadDraftFile(id, new URL(request.url).searchParams.get("file") ?? "");
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch {
    return NextResponse.json({ error: "Lampiran tidak tersedia atau akses ditolak." }, { status: 404 });
  }
}
