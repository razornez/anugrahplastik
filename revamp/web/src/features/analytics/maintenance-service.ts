import { and, eq, inArray, lt } from "drizzle-orm";
import { analyticsDailyMetrics, analyticsEvents, analyticsSessions } from "@/lib/database/schema";
import { getDatabase } from "@/lib/database/client";
import { trafficSource } from "./source";

type Metric = { sessions: number; formSubmits: number; ctaClicks: number; whatsappClicks: number };

function jakartaDate(value: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(value);
}

function dimensionKey(session: {
  createdAt: Date;
  deviceCategory: string;
  cityName: string | null;
  referrer: string | null;
}) {
  return [
    jakartaDate(session.createdAt),
    session.deviceCategory,
    session.cityName ?? "Tidak diketahui",
    trafficSource(session.referrer),
  ].join("|");
}

export async function retainAnonymousJourneys() {
  const database = getDatabase();
  if (!database) return { archived: 0, skipped: true };

  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1_000);
  const sessions = await database
    .select({
      id: analyticsSessions.id,
      createdAt: analyticsSessions.createdAt,
      deviceCategory: analyticsSessions.deviceCategory,
      cityName: analyticsSessions.cityName,
      referrer: analyticsSessions.referrer,
    })
    .from(analyticsSessions)
    .where(lt(analyticsSessions.createdAt, cutoff))
    .limit(1_000);
  if (!sessions.length) return { archived: 0, skipped: false };

  const sessionIds = sessions.map((session) => session.id);
  const events = await database
    .select({ sessionId: analyticsEvents.sessionId, name: analyticsEvents.name })
    .from(analyticsEvents)
    .where(inArray(analyticsEvents.sessionId, sessionIds));
  const metrics = new Map<string, Metric>();
  sessions.forEach((session) => {
    const key = dimensionKey(session);
    const metric = metrics.get(key);
    if (metric) metric.sessions += 1;
    else metrics.set(key, { sessions: 1, formSubmits: 0, ctaClicks: 0, whatsappClicks: 0 });
  });
  const dimensions = new Map(sessions.map((session) => [session.id, dimensionKey(session)]));
  events.forEach((event) => {
    const key = dimensions.get(event.sessionId);
    const metric = key ? metrics.get(key) : undefined;
    if (!metric) return;
    if (event.name === "form_submit") metric.formSubmits += 1;
    if (event.name === "cta_click") metric.ctaClicks += 1;
    if (event.name === "whatsapp_click") metric.whatsappClicks += 1;
  });

  await database.transaction(async (transaction) => {
    for (const [key, metric] of metrics) {
      const [reportDate, deviceCategory, cityName, sourceName] = key.split("|");
      const [existing] = await transaction
        .select()
        .from(analyticsDailyMetrics)
        .where(
          and(
            eq(analyticsDailyMetrics.reportDate, reportDate),
            eq(analyticsDailyMetrics.deviceCategory, deviceCategory),
            eq(analyticsDailyMetrics.cityName, cityName),
            eq(analyticsDailyMetrics.sourceName, sourceName),
          ),
        );
      if (existing) {
        await transaction
          .update(analyticsDailyMetrics)
          .set({
            sessions: existing.sessions + metric.sessions,
            formSubmits: existing.formSubmits + metric.formSubmits,
            ctaClicks: existing.ctaClicks + metric.ctaClicks,
            whatsappClicks: existing.whatsappClicks + metric.whatsappClicks,
            updatedAt: new Date(),
          })
          .where(eq(analyticsDailyMetrics.id, existing.id));
      } else {
        await transaction
          .insert(analyticsDailyMetrics)
          .values({ reportDate, deviceCategory, cityName, sourceName, ...metric });
      }
    }
    await transaction.delete(analyticsSessions).where(inArray(analyticsSessions.id, sessionIds));
  });
  return { archived: sessions.length, skipped: false };
}
