import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { analyticsEvents, analyticsSessions } from "@/lib/database/schema";
import { getDatabase } from "@/lib/database/client";
import { clientAddress, takeRateLimit } from "@/lib/security/rate-limit";
import { analyticsEventSchema } from "@/features/analytics/schema";
import { deviceContext, locationContext } from "@/features/analytics/request-context";

function referrerPath(value: string | null) {
  if (!value) return null;

  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`.slice(0, 1000);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const rate = takeRateLimit(`analytics:${clientAddress(request.headers)}`, 240, 15 * 60 * 1_000);
  if (!rate.allowed) return new NextResponse(null, { status: 429 });

  const body: unknown = await request.json().catch(() => null);
  const parsed = analyticsEventSchema.safeParse(body);
  if (!parsed.success) return new NextResponse(null, { status: 204 });

  const database = getDatabase();
  if (!database) return new NextResponse(null, { status: 204 });

  const event = parsed.data;
  try {
    let [session] = await database
      .select({ id: analyticsSessions.id, createdAt: analyticsSessions.createdAt })
      .from(analyticsSessions)
      .where(eq(analyticsSessions.anonymousId, event.anonymousId));

    if (!session) {
      const [device, location] = await Promise.all([
        Promise.resolve(deviceContext(request.headers.get("user-agent"))),
        locationContext(request.headers),
      ]);
      [session] = await database
        .insert(analyticsSessions)
        .values({
          anonymousId: event.anonymousId,
          landingPath: event.path,
          referrer: referrerPath(request.headers.get("referer")),
          deviceCategory: device.deviceCategory,
          browserName: device.browserName,
          operatingSystem: device.operatingSystem,
          countryName: location.countryName,
          regionName: location.regionName,
          cityName: location.cityName,
          consentVersion: event.consentVersion,
        })
        .returning({ id: analyticsSessions.id, createdAt: analyticsSessions.createdAt });
    }

    const [lastEvent] = await database
      .select({ sequence: sql<number>`coalesce(max(${analyticsEvents.sequence}), 0)` })
      .from(analyticsEvents)
      .where(eq(analyticsEvents.sessionId, session.id));
    const now = new Date();
    await database.insert(analyticsEvents).values({
      sessionId: session.id,
      name: event.name,
      path: event.path,
      sectionKey: event.sectionKey ?? null,
      elementKey: event.elementKey ?? null,
      metadata: event.metadata ?? null,
      sequence: Number(lastEvent?.sequence ?? 0) + 1,
    });
    await database
      .update(analyticsSessions)
      .set({
        lastSeenAt: now,
        lastEventAt: now,
        ...(event.sectionKey ? { lastSectionKey: event.sectionKey } : {}),
        ...(event.name === "page_leave"
          ? {
              endedAt: now,
              durationSeconds: Math.max(0, Math.round((now.getTime() - session.createdAt.getTime()) / 1_000)),
            }
          : {}),
      })
      .where(eq(analyticsSessions.id, session.id));
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  return new NextResponse(null, { status: 204 });
}
