import { and, asc, count, countDistinct, desc, eq, gte, or, sql } from "drizzle-orm";
import { analyticsEvents, analyticsSessions } from "@/lib/database/schema";
import { getDatabase } from "@/lib/database/client";
import { decodeTimeCursor, encodeTimeCursor } from "@/lib/pagination/cursor";

export type ReportPeriod = 7 | 30;
export type DeviceFilter = "all" | "mobile" | "desktop" | "tablet" | "unknown";
export type ReportFilters = { days: ReportPeriod; device: DeviceFilter; city: string; source: string; outcome: string };
export type JourneyPageQuery = { cursor?: string; direction?: "next" | "previous" };
type EventRecord = {
  id: string;
  name: string;
  sectionKey: string | null;
  elementKey: string | null;
  sequence: number;
  occurredAt: Date;
};
export type VisitorJourney = {
  id: string;
  deviceCategory: string;
  browserName: string | null;
  operatingSystem: string | null;
  cityName: string | null;
  sourceName: string;
  outcome: string;
  lastSectionKey: string | null;
  durationSeconds: number | null;
  createdAt: Date;
};
export type VisitorJourneyDetail = VisitorJourney & { events: EventRecord[] };
export type AnalyticsReport = {
  available: boolean;
  filters: ReportFilters;
  totals: { sessions: number; forms: number; ctaClicks: number; whatsappClicks: number };
  trend: Array<{ date: string; sessions: number; forms: number }>;
  devices: Array<{ key: string; label: string; total: number }>;
  cities: Array<{ key: string; total: number }>;
  funnel: Array<{ label: string; total: number }>;
  journeys: VisitorJourney[];
  citiesForFilter: string[];
  sourcesForFilter: string[];
  hasNext: boolean;
  hasPrevious: boolean;
  nextCursor: string | null;
  previousCursor: string | null;
};

const emptyReport = (filters: ReportFilters): AnalyticsReport => ({
  available: false,
  filters,
  totals: { sessions: 0, forms: 0, ctaClicks: 0, whatsappClicks: 0 },
  trend: [],
  devices: [],
  cities: [],
  funnel: [],
  journeys: [],
  citiesForFilter: [],
  sourcesForFilter: [],
  hasNext: false,
  hasPrevious: false,
  nextCursor: null,
  previousCursor: null,
});
function deviceLabel(key: string) {
  return key === "mobile" ? "Ponsel" : key === "desktop" ? "Komputer" : key === "tablet" ? "Tablet" : "Tidak diketahui";
}
function initialTrend(days: number) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (days - index - 1));
    return { date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(date), sessions: 0, forms: 0 };
  });
}
function sessionConditions(filters: ReportFilters, since: Date) {
  return and(
    gte(analyticsSessions.createdAt, since),
    eq(analyticsSessions.trafficClass, "public"),
    filters.device !== "all" ? eq(analyticsSessions.deviceCategory, filters.device) : undefined,
    filters.city ? eq(analyticsSessions.cityName, filters.city) : undefined,
    filters.source ? eq(analyticsSessions.sourceName, filters.source) : undefined,
    filters.outcome ? eq(analyticsSessions.outcome, filters.outcome) : undefined,
  );
}
async function eventSessions(filters: ReportFilters, since: Date, eventName: string) {
  const database = getDatabase();
  if (!database) return 0;
  const [row] = await database
    .select({ total: countDistinct(analyticsEvents.sessionId) })
    .from(analyticsEvents)
    .innerJoin(analyticsSessions, eq(analyticsEvents.sessionId, analyticsSessions.id))
    .where(and(sessionConditions(filters, since), eq(analyticsEvents.name, eventName)));
  return Number(row?.total ?? 0);
}

async function uniqueFormConversions(filters: ReportFilters, since: Date) {
  const database = getDatabase();
  if (!database) return 0;
  const [row] = await database
    .select({ total: countDistinct(analyticsEvents.conversionId) })
    .from(analyticsEvents)
    .innerJoin(analyticsSessions, eq(analyticsEvents.sessionId, analyticsSessions.id))
    .where(and(sessionConditions(filters, since), eq(analyticsEvents.name, "form_submit")));
  return Number(row?.total ?? 0);
}

export async function getAnalyticsReport(
  filters: ReportFilters,
  page: JourneyPageQuery = {},
): Promise<AnalyticsReport> {
  const database = getDatabase();
  if (!database) return emptyReport(filters);
  const since = new Date(Date.now() - filters.days * 24 * 60 * 60 * 1_000);
  const conditions = sessionConditions(filters, since);
  const cursor = decodeTimeCursor(page.cursor);
  const cursorDate = cursor ? new Date(cursor.createdAt) : null;
  const cursorId = cursor?.id ?? "";
  const backwards = page.direction === "previous";
  const cursorCondition = cursorDate
    ? backwards
      ? or(
          sql`${analyticsSessions.createdAt} > ${cursorDate}`,
          and(eq(analyticsSessions.createdAt, cursorDate), sql`${analyticsSessions.id} > ${cursorId}`),
        )
      : or(
          sql`${analyticsSessions.createdAt} < ${cursorDate}`,
          and(eq(analyticsSessions.createdAt, cursorDate), sql`${analyticsSessions.id} < ${cursorId}`),
        )
    : undefined;
  const order = backwards
    ? [asc(analyticsSessions.createdAt), asc(analyticsSessions.id)]
    : [desc(analyticsSessions.createdAt), desc(analyticsSessions.id)];
  const [
    totalRows,
    deviceRows,
    cityRows,
    sourceRows,
    trendRows,
    sessionsPage,
    forms,
    ctaClicks,
    whatsappClicks,
    engaged,
    started,
  ] = await Promise.all([
    database.select({ total: count() }).from(analyticsSessions).where(conditions),
    database
      .select({ key: analyticsSessions.deviceCategory, total: count() })
      .from(analyticsSessions)
      .where(conditions)
      .groupBy(analyticsSessions.deviceCategory),
    database
      .select({ key: sql<string>`coalesce(${analyticsSessions.cityName}, 'Tidak diketahui')`, total: count() })
      .from(analyticsSessions)
      .where(conditions)
      .groupBy(sql`coalesce(${analyticsSessions.cityName}, 'Tidak diketahui')`)
      .orderBy(desc(count()))
      .limit(5),
    database
      .selectDistinct({ sourceName: analyticsSessions.sourceName })
      .from(analyticsSessions)
      .where(and(gte(analyticsSessions.createdAt, since), eq(analyticsSessions.trafficClass, "public")))
      .orderBy(analyticsSessions.sourceName)
      .limit(60),
    database
      .select({
        date: sql<string>`to_char(${analyticsSessions.createdAt} AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD')`,
        sessions: count(),
        forms: sql<number>`count(*) filter (where ${analyticsSessions.outcome} = 'Form terkirim')`,
      })
      .from(analyticsSessions)
      .where(conditions)
      .groupBy(sql`to_char(${analyticsSessions.createdAt} AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD')`),
    database
      .select({
        id: analyticsSessions.id,
        deviceCategory: analyticsSessions.deviceCategory,
        browserName: analyticsSessions.browserName,
        operatingSystem: analyticsSessions.operatingSystem,
        cityName: analyticsSessions.cityName,
        sourceName: analyticsSessions.sourceName,
        outcome: analyticsSessions.outcome,
        lastSectionKey: analyticsSessions.lastSectionKey,
        durationSeconds: analyticsSessions.durationSeconds,
        createdAt: analyticsSessions.createdAt,
      })
      .from(analyticsSessions)
      .where(and(conditions, cursorCondition))
      .orderBy(...order)
      .limit(26),
    uniqueFormConversions(filters, since),
    eventSessions(filters, since, "cta_click"),
    eventSessions(filters, since, "whatsapp_click"),
    eventSessions(filters, since, "section_engaged"),
    eventSessions(filters, since, "form_start"),
  ]);
  const citiesForFilter = await database
    .selectDistinct({ cityName: analyticsSessions.cityName })
    .from(analyticsSessions)
    .where(
      and(
        gte(analyticsSessions.createdAt, since),
        eq(analyticsSessions.trafficClass, "public"),
        sql`${analyticsSessions.cityName} is not null`,
      ),
    )
    .orderBy(analyticsSessions.cityName)
    .limit(60);
  const hasAdjacent = sessionsPage.length > 25;
  const shown = backwards ? sessionsPage.slice(0, 25).reverse() : sessionsPage.slice(0, 25);
  const trend = initialTrend(filters.days);
  const pointByDate = new Map(trend.map((point) => [point.date, point]));
  trendRows.forEach((row) => {
    const point = pointByDate.get(row.date);
    if (point) {
      point.sessions = Number(row.sessions);
      point.forms = Number(row.forms);
    }
  });
  return {
    available: true,
    filters,
    totals: { sessions: Number(totalRows[0]?.total ?? 0), forms, ctaClicks, whatsappClicks },
    trend,
    devices: deviceRows
      .map((row) => ({ key: row.key, label: deviceLabel(row.key), total: Number(row.total) }))
      .sort((a, b) => b.total - a.total),
    cities: cityRows.map((row) => ({ key: row.key, total: Number(row.total) })),
    funnel: [
      { label: "Pengunjung", total: Number(totalRows[0]?.total ?? 0) },
      { label: "Melihat bagian halaman", total: engaged },
      { label: "Menekan tombol minat", total: ctaClicks },
      { label: "Mulai isi formulir", total: started },
      { label: "Form terkirim", total: forms },
    ],
    journeys: shown,
    citiesForFilter: citiesForFilter.flatMap((row) => (row.cityName ? [row.cityName] : [])),
    sourcesForFilter: sourceRows.map((row) => row.sourceName),
    hasNext: backwards ? Boolean(page.cursor) : hasAdjacent,
    hasPrevious: backwards ? hasAdjacent : Boolean(page.cursor),
    nextCursor: shown.length ? encodeTimeCursor(shown.at(-1)!) : null,
    previousCursor: shown.length ? encodeTimeCursor(shown[0]) : null,
  };
}

export async function getAnalyticsJourney(id: string): Promise<VisitorJourneyDetail | null> {
  const database = getDatabase();
  if (!database) return null;
  const [session] = await database
    .select({
      id: analyticsSessions.id,
      deviceCategory: analyticsSessions.deviceCategory,
      browserName: analyticsSessions.browserName,
      operatingSystem: analyticsSessions.operatingSystem,
      cityName: analyticsSessions.cityName,
      sourceName: analyticsSessions.sourceName,
      outcome: analyticsSessions.outcome,
      lastSectionKey: analyticsSessions.lastSectionKey,
      durationSeconds: analyticsSessions.durationSeconds,
      createdAt: analyticsSessions.createdAt,
    })
    .from(analyticsSessions)
    .where(eq(analyticsSessions.id, id));
  if (!session) return null;
  const events = await database
    .select({
      id: analyticsEvents.id,
      name: analyticsEvents.name,
      sectionKey: analyticsEvents.sectionKey,
      elementKey: analyticsEvents.elementKey,
      sequence: analyticsEvents.sequence,
      occurredAt: analyticsEvents.occurredAt,
    })
    .from(analyticsEvents)
    .where(eq(analyticsEvents.sessionId, id))
    .orderBy(analyticsEvents.sequence);
  return { ...session, events };
}
