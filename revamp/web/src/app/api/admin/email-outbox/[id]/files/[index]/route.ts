import { NextResponse } from "next/server";
import { downloadOutboxFile } from "@/features/integrations/email-drafts";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; index: string }> }) {
  try {
    const { id, index } = await params;
    const file = await downloadOutboxFile(id, Number(index));
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Lampiran tidak tersedia atau akses ditolak." },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
