import { NextResponse } from "next/server";
import { runSeoAudit } from "@/features/analytics/seo-audit-service";
import { runMarketSignals } from "@/features/analytics/market-signals";
import { runSearchDiscovery } from "@/features/analytics/search-discovery";

export async function POST(request: Request) {
  const token = process.env.GROWTH_AUDIT_CRON_TOKEN;
  if (!token || request.headers.get("authorization") !== `Bearer ${token}`)
    return new NextResponse(null, { status: 401 });
  try {
    const result = await runSeoAudit();
    const discovery = result.status === "running" ? "deferred" : await runSearchDiscovery();
    const market = result.status === "running" ? "deferred" : await runMarketSignals();
    return NextResponse.json({ ...result, discovery, market }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "failed" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
