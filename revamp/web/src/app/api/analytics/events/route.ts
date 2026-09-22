import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { analyticsEvents, analyticsSessions } from "@/lib/database/schema";
import { getDatabase } from "@/lib/database/client";
import { clientAddress, takeRateLimit } from "@/lib/security/rate-limit";
import { analyticsEventSchema } from "@/features/analytics/schema";

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
      .select({ id: analyticsSessions.id })
      .from(analyticsSessions)
      .where(eq(analyticsSessions.anonymousId, event.anonymousId));

    if (!session) {
      [session] = await database
        .insert(analyticsSessions)
        .values({
          anonymousId: event.anonymousId,
          landingPath: event.path,
          referrer: referrerPath(request.headers.get("referer")),
        })
        .returning({ id: analyticsSessions.id });
    } else {
      await database
        .update(analyticsSessions)
        .set({ lastSeenAt: new Date() })
        .where(eq(analyticsSessions.id, session.id));
    }

    await database.insert(analyticsEvents).values({
      sessionId: session.id,
      name: event.name,
      path: event.path,
      sectionKey: event.sectionKey ?? null,
      elementKey: event.elementKey ?? null,
      metadata: event.metadata ?? null,
    });
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  return new NextResponse(null, { status: 204 });
}
