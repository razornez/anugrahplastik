import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { auditLogs } from "@/lib/database/schema";
import { getDatabase } from "@/lib/database/client";
import { readLandingMedia, removeLandingMedia } from "@/features/content/landing-media";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user || (user.role !== "admin" && user.role !== "content")) return new NextResponse(null, { status: 403 });
  const { id } = await params;
  const asset = await readLandingMedia(id, new URL(request.url).searchParams.get("size") === "small");
  if (!asset) return new NextResponse(null, { status: 404 });
  return new NextResponse(asset.bytes, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user || (user.role !== "admin" && user.role !== "content"))
    return NextResponse.json({ error: "Tidak diizinkan." }, { status: 403 });
  try {
    const { id } = await params;
    await removeLandingMedia(id);
    await getDatabase()?.insert(auditLogs).values({
      actorId: user.id,
      action: "landing_media.deleted",
      entityType: "media_asset",
      entityId: id,
      metadata: {},
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Aset belum dapat dihapus." },
      { status: 400 },
    );
  }
}
