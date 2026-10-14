import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { resolvePrivateDocumentLink } from "@/features/integrations/private-download-links";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const link = await resolvePrivateDocumentLink((await params).token);
    if (!link) return NextResponse.json({ error: "Tautan tidak tersedia atau sudah kedaluwarsa." }, { status: 404 });
    const info = await stat(link.path);
    if (!info.isFile()) throw new Error("not_file");
    return new Response(Readable.toWeb(createReadStream(link.path)) as ReadableStream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(info.size),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(link.filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch {
    return NextResponse.json({ error: "File tidak tersedia." }, { status: 404 });
  }
}
