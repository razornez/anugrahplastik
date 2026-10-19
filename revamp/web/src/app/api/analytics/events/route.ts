import { NextResponse } from "next/server";
import { analyticsIngestBatches } from "@/lib/database/schema";
import { getDatabase } from "@/lib/database/client";
import { clientAddress, takeRateLimit } from "@/lib/security/rate-limit";
import { analyticsBatchSchema } from "@/features/analytics/schema";
import { deviceContext, locationContext } from "@/features/analytics/request-context";
import { trafficSource } from "@/features/analytics/source";

function referrerPath(value: string | null, currentHost: string) {
  if (!value) return null;

  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.host.toLowerCase() === currentHost) return null;
    return `${parsed.origin}${parsed.pathname}`.slice(0, 1000);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const rate = takeRateLimit(`analytics:${clientAddress(request.headers)}`, 120, 15 * 60 * 1_000);
  if (!rate.allowed) return new NextResponse(null, { status: 429 });

  const body: unknown = await request.json().catch(() => null);
  const parsed = analyticsBatchSchema.safeParse(body);
  if (!parsed.success) return new NextResponse(null, { status: 204 });

  const database = getDatabase();
  if (!database) return new NextResponse(null, { status: 204 });

  try {
    const [device, location] = await Promise.all([
      Promise.resolve(deviceContext(request.headers.get("user-agent"))),
      locationContext(request.headers),
    ]);
    const batch = parsed.data;
    const host = request.headers.get("host")?.toLowerCase() ?? "";
    const entry = batch.entry;
    const referrer = referrerPath(entry?.referrer ?? null, host);
    const attribution = entry?.attribution ?? {};
    const trafficClass = host.startsWith("127.0.0.1") || host.startsWith("localhost") ? "internal" : "public";
    const priority = batch.events.some((event) => ["form_submit", "whatsapp_click", "cta_click"].includes(event.name))
      ? 1
      : 0;
    await database.insert(analyticsIngestBatches).values({
      anonymousId: batch.anonymousId,
      payload: {
        ...batch,
        request: {
          landingPath: entry?.landingPath ?? batch.events[0].path,
          referrer,
          sourceName: trafficSource(referrer, attribution),
          attribution: { ...attribution, landing_variant: entry?.landingVariant ?? "control" },
          entryAnchor: entry?.entryAnchor ?? null,
          trafficClass,
          device,
          location,
        },
      },
      eventCount: batch.events.length,
      priority,
    });
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  return new NextResponse(null, { status: 204 });
}
