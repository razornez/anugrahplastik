import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { readLandingMedia } from "@/features/content/landing-media";
import { LANDING_CONTENT_KEY } from "@/features/content/landing-content";
import { getDatabase } from "@/lib/database/client";
import { contentBlocks } from "@/lib/database/schema";
import { getSession } from "@/lib/auth/session";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSession();
  const database = getDatabase();
  const [block] = database
    ? await database
        .select({ published: contentBlocks.publishedContent })
        .from(contentBlocks)
        .where(eq(contentBlocks.key, LANDING_CONTENT_KEY))
    : [];
  const canPreview = user?.role === "admin" || user?.role === "content";
  if (!canPreview && (!block || !JSON.stringify(block.published ?? {}).includes(`/api/media/${id}`)))
    return new NextResponse(null, { status: 404 });
  const preview = new URL(request.url).searchParams.get("size") === "small";
  const asset = await readLandingMedia(id, preview);
  if (!asset) return new NextResponse(null, { status: 404 });
  return new NextResponse(asset.bytes, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
