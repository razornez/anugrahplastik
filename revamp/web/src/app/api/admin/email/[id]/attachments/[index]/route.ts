import { simpleParser } from "mailparser";
import { NextResponse } from "next/server";
import { getEmailRecord, fetchEmailBody } from "@/features/integrations/mail-service";
import { getSession } from "@/lib/auth/session";

const maxEmailBytes = 25 * 1024 * 1024;
const maxAttachmentBytes = 15 * 1024 * 1024;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; index: string }> }) {
  const user = await getSession();
  const { id, index: rawIndex } = await params;
  if (!user || !["admin", "sales"].includes(user.role))
    return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  const index = Number(rawIndex);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ||
    !Number.isInteger(index) ||
    index < 0 ||
    index > 30
  )
    return NextResponse.json({ error: "Lampiran tidak ditemukan." }, { status: 404 });
  const record = await getEmailRecord(id);
  if (!record || record.size > maxEmailBytes || record.folder !== "inbox")
    return NextResponse.json(
      { error: "Lampiran tidak tersedia atau terlalu besar untuk ditampilkan." },
      { status: 404 },
    );
  try {
    const source = await fetchEmailBody(record.folder, record.uid, record.uidValidity);
    if (!source) return NextResponse.json({ error: "Email tidak lagi tersedia." }, { status: 404 });
    const rawMessage = source;
    if (rawMessage.byteLength > maxEmailBytes)
      return NextResponse.json({ error: "Email melebihi batas 25 MB." }, { status: 413 });
    const parsed = await simpleParser(rawMessage);
    const attachment = parsed.attachments[index];
    if (!attachment || attachment.size > maxAttachmentBytes)
      return NextResponse.json({ error: "Lampiran tidak ditemukan atau melebihi batas 15 MB." }, { status: 404 });
    const filename = (attachment.filename || `lampiran-${index + 1}`).replace(/[\r\n"\\]/g, "_").slice(0, 160);
    return new Response(new Uint8Array(attachment.content), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="lampiran-${index + 1}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Content-Length": String(attachment.content.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Lampiran belum dapat diambil dari mailbox." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
