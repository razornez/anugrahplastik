import { NextResponse } from "next/server";
import { retainAnonymousJourneys } from "@/features/analytics/maintenance-service";

export async function POST(request: Request) {
  const token = process.env.ANALYTICS_CRON_TOKEN;
  if (!token || request.headers.get("authorization") !== `Bearer ${token}`) {
    return new NextResponse(null, { status: 401 });
  }

  const result = await retainAnonymousJourneys();
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
