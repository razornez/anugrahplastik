import { NextResponse } from "next/server";
import { getPublishedLandingContent } from "@/features/content/landing-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const content = await getPublishedLandingContent();

  return NextResponse.json(content, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
