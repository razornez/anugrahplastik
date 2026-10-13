import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { auditLogs } from "@/lib/database/schema";
import { getDatabase } from "@/lib/database/client";
import { listLandingMedia, uploadLandingMedia } from "@/features/content/landing-media";

function canManage(role?: string) {
  return role === "admin" || role === "content";
}

export async function GET(request: Request) {
  const user = await getSession();
  if (!canManage(user?.role)) return NextResponse.json({ error: "Tidak diizinkan." }, { status: 403 });
  const url = new URL(request.url);
  const parsedLimit = Number(url.searchParams.get("limit") ?? "24");
  return NextResponse.json(
    await listLandingMedia({
      q: url.searchParams.get("q") ?? "",
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : 24,
    }),
  );
}

export async function POST(request: Request) {
  const user = await getSession();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Tidak diizinkan." }, { status: 403 });
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("Pilih gambar untuk diunggah.");
    const asset = await uploadLandingMedia(
      file,
      String(formData.get("altText") ?? ""),
      String(formData.get("caption") ?? "") || null,
      user.id,
    );
    const database = getDatabase();
    await database?.insert(auditLogs).values({
      actorId: user.id,
      action: "landing_media.uploaded",
      entityType: "media_asset",
      entityId: asset.id,
      metadata: { byteSize: asset.byteSize, width: asset.width, height: asset.height },
    });
    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gambar belum dapat diunggah." },
      { status: 400 },
    );
  }
}
