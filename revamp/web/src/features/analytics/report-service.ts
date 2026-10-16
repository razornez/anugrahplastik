import { and, asc, count, countDistinct, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { analyticsEvents, analyticsSessions } from "@/lib/database/schema";
import { getDatabase } from "@/lib/database/client";
import { decodeTimeCursor, encodeTimeCursor } from "@/lib/pagination/cursor";
import { jakartaReportStart } from "./report-period";
import { locationAliases, type GeographyRow } from "./visitor-report-model";

export type ReportPeriod = 1 | 7 | 30;
export type ReportTrafficClass = "public" | "demo" | "internal";
export type DeviceFilter = "all" | "mobile" | "desktop" | "tablet" | "unknown";
export type ReportFilters = {
  days: ReportPeriod;
  device: DeviceFilter;
  city: string;
  source: string;
  outcome: string;
  country?: string;
  region?: string;
};
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
  durationQuality: string;
  formStatus: string | null;
  createdAt: Date;
};
export type VisitorJourneyDetail = VisitorJourney & { events: EventRecord[] };
export type AnalyticsReport = {
  available: boolean;
  filters: ReportFilters;
  totals: { sessions: number; forms: number; formEvents: number; ctaClicks: number; whatsappClicks: number };
  trend: Array<{ date: string; sessions: number; forms: number }>;
  devices: Array<{ key: string; label: string; total: number }>;
  cities: Array<{ key: string; total: number }>;
  funnel: Array<{ label: string; total: number }>;
  journeys: VisitorJourney[];
  citiesForFilter: string[];
  sourcesForFilter: string[];
  geography: GeographyRow[];
  sources: Array<{ key: string; total: number }>;
  countriesForFilter: string[];
  regionsForFilter: string[];
  hasNext: boolean;
  hasPrevious: boolean;
  nextCursor: string | null;
  previousCursor: string | null;
};

const emptyReport = (filters: ReportFilters): AnalyticsReport => ({
  available: false,
  filters,
  totals: { sessions: 0, forms: 0, formEvents: 0, ctaClicks: 0, whatsappClicks: 0 },
  trend: [],
  devices: [],
  cities: [],
  funnel: [],
  journeys: [],
  citiesForFilter: [],
  sourcesForFilter: [],
  geography: [],
  sources: [],
  countriesForFilter: [],
  regionsForFilter: [],
  hasNext: false,
  hasPrevious: false,
  nextCursor: null,
  previousCursor: null,
});
export function createEmptyAnalyticsReport(filters: ReportFilters, now = new Date()): AnalyticsReport {
  return { ...emptyReport(filters), available: true, trend: initialTrend(filters.days, now) };
}
function deviceLabel(key: string) {
  return key === "mobile" ? "Ponsel" : key === "desktop" ? "Komputer" : key === "tablet" ? "Tablet" : "Tidak diketahui";
}
function initialTrend(days: number, now: Date) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - (days - index - 1));
    return { date: date.toISOString().slice(0, 10), sessions: 0, forms: 0 };
  });
}
function sessionConditions(filters: ReportFilters, since: Date, trafficClass: ReportTrafficClass, now: Date) {
  return and(
    gte(analyticsSessions.createdAt, since),
    lte(analyticsSessions.createdAt, now),
    eq(analyticsSessions.trafficClass, trafficClass),
    filters.device !== "all" ? eq(analyticsSessions.deviceCategory, filters.device) : undefined,
    filters.city ? eq(analyticsSessions.cityName, filters.city) : undefined,
    filters.source ? eq(analyticsSessions.sourceName, filters.source) : undefined,
    filters.outcome ? eq(analyticsSessions.outcome, filters.outcome) : undefined,
    filters.country
      ? inArray(sql`lower(btrim(${analyticsSessions.countryName}))`, locationAliases(filters.country, "country"))
      : undefined,
    filters.region
      ? inArray(sql`lower(btrim(${analyticsSessions.regionName}))`, locationAliases(filters.region, "region"))
      : undefined,
  );
}
async function eventSessions(
  filters: ReportFilters,
  since: Date,
  eventName: string,
  trafficClass: ReportTrafficClass,
  now: Date,
) {
  const database = getDatabase();
  if (!database) return 0;
  const [row] = await database
    .select({ total: countDistinct(analyticsEvents.sessionId) })
    .from(analyticsEvents)
    .innerJoin(analyticsSessions, eq(analyticsEvents.sessionId, analyticsSessions.id))
    .where(
      and(
        sessionConditions(filters, since, trafficClass, now),
        lte(analyticsEvents.occurredAt, now),
        eq(analyticsEvents.name, eventName),
      ),
    );
  return Number(row?.total ?? 0);
}

async function uniqueFormConversions(filters: ReportFilters, since: Date, trafficClass: ReportTrafficClass, now: Date) {
  const database = getDatabase();
  if (!database) return { events: 0, leads: 0 };
  const [row] = await database
    .select({
      events: countDistinct(analyticsSessions.id),
      leads: sql<number>`count(distinct ${analyticsSessions.id}) filter (where ${analyticsSessions.formStatus} = 'valid')`,
    })
    .from(analyticsSessions)
    .where(and(sessionConditions(filters, since, trafficClass, now), eq(analyticsSessions.outcome, "Form terkirim")));
  return { events: Number(row?.events ?? 0), leads: Number(row?.leads ?? 0) };
}

export async function getAnalyticsReport(
  filters: ReportFilters,
  page: JourneyPageQuery = {},
  trafficClass: ReportTrafficClass = "public",
  now = new Date(),
): Promise<AnalyticsReport> {
  const database = getDatabase();
  if (!database) return emptyReport(filters);
  const since = jakartaReportStart(filters.days, now);
  const conditions = sessionConditions(filters, since, trafficClass, now);
  const periodConditions = sessionConditions(
    { days: filters.days, device: "all", city: "", source: "", outcome: "" },
    since,
    trafficClass,
    now,
  );
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
    leadTrendRows,
    sessionsPage,
    formMetrics,
    ctaClicks,
    whatsappClicks,
    engaged,
    started,
    geographyRows,
    sourceTotals,
    locationOptions,
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
      .where(periodConditions)
      .orderBy(analyticsSessions.sourceName)
      .limit(60),
    database
      .select({
        date: sql<string>`to_char(${analyticsSessions.createdAt} AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD')`,
        sessions: count(),
      })
      .from(analyticsSessions)
      .where(conditions)
      .groupBy(sql`to_char(${analyticsSessions.createdAt} AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD')`),
    database
      .select({
        date: sql<string>`to_char(${analyticsSessions.createdAt} AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD')`,
        forms: count(),
      })
      .from(analyticsSessions)
      .where(and(conditions, eq(analyticsSessions.formStatus, "valid"), eq(analyticsSessions.outcome, "Form terkirim")))
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
        formStatus: analyticsSessions.formStatus,
        lastSectionKey: analyticsSessions.lastSectionKey,
        durationSeconds: analyticsSessions.durationSeconds,
        durationQuality: analyticsSessions.durationQuality,
        createdAt: analyticsSessions.createdAt,
      })
      .from(analyticsSessions)
      .where(and(conditions, cursorCondition))
      .orderBy(...order)
      .limit(26),
    uniqueFormConversions(filters, since, trafficClass, now),
    eventSessions(filters, since, "cta_click", trafficClass, now),
    eventSessions(filters, since, "whatsapp_click", trafficClass, now),
    eventSessions(filters, since, "section_engaged", trafficClass, now),
    eventSessions(filters, since, "form_start", trafficClass, now),
    database
      .select({
        country: analyticsSessions.countryName,
        region: analyticsSessions.regionName,
        city: analyticsSessions.cityName,
        total: count(),
        forms: sql<number>`count(*) filter (where ${analyticsSessions.formStatus} = 'valid' and ${analyticsSessions.outcome} = 'Form terkirim')`,
      })
      .from(analyticsSessions)
      .where(conditions)
      .groupBy(analyticsSessions.countryName, analyticsSessions.regionName, analyticsSessions.cityName),
    database
      .select({ key: analyticsSessions.sourceName, total: count() })
      .from(analyticsSessions)
      .where(conditions)
      .groupBy(analyticsSessions.sourceName)
      .orderBy(desc(count())),
    database
      .selectDistinct({ country: analyticsSessions.countryName, region: analyticsSessions.regionName })
      .from(analyticsSessions)
      .where(periodConditions),
  ]);
  const citiesForFilter = await database
    .selectDistinct({ cityName: analyticsSessions.cityName })
    .from(analyticsSessions)
    .where(and(periodConditions, sql`${analyticsSessions.cityName} is not null`))
    .orderBy(analyticsSessions.cityName)
    .limit(60);
  const hasAdjacent = sessionsPage.length > 25;
  const shown = backwards ? sessionsPage.slice(0, 25).reverse() : sessionsPage.slice(0, 25);
  const trend = initialTrend(filters.days, now);
  const pointByDate = new Map(trend.map((point) => [point.date, point]));
  trendRows.forEach((row) => {
    const point = pointByDate.get(row.date);
    if (point) point.sessions = Number(row.sessions);
  });
  leadTrendRows.forEach((row) => {
    const point = pointByDate.get(row.date);
    if (point) point.forms = Number(row.forms);
  });
  return {
    available: true,
    filters,
    totals: {
      sessions: Number(totalRows[0]?.total ?? 0),
      forms: formMetrics.leads,
      formEvents: formMetrics.events,
      ctaClicks,
      whatsappClicks,
    },
    trend,
    devices: deviceRows
      .map((row) => ({ key: row.key, label: deviceLabel(row.key), total: Number(row.total) }))
      .sort((a, b) => b.total - a.total),
    cities: cityRows.map((row) => ({ key: row.key, total: Number(row.total) })),
    funnel: [
      { label: "Sesi kunjungan", total: Number(totalRows[0]?.total ?? 0) },
      { label: "Melihat bagian halaman", total: engaged },
      { label: "Klik tombol tindakan", total: ctaClicks },
      { label: "Mulai mengisi formulir", total: started },
      { label: "Mengirim formulir", total: formMetrics.events },
      { label: "Permintaan valid tercatat", total: formMetrics.leads },
    ],
    journeys: shown.map((journey) => ({
      ...journey,
      formStatus: journey.outcome === "Form terkirim" ? formStatusLabel(journey.formStatus) : null,
    })),
    citiesForFilter: citiesForFilter.flatMap((row) => (row.cityName ? [row.cityName] : [])),
    sourcesForFilter: sourceRows.map((row) => row.sourceName),
    geography: geographyRows.map((row) => ({ ...row, total: Number(row.total), forms: Number(row.forms) })),
    sources: sourceTotals.map((row) => ({ key: row.key, total: Number(row.total) })),
    countriesForFilter: [...new Set(locationOptions.flatMap((row) => (row.country ? [row.country] : [])))].sort(),
    regionsForFilter: [...new Set(locationOptions.flatMap((row) => (row.region ? [row.region] : [])))].sort(),
    hasNext: backwards ? Boolean(page.cursor) : hasAdjacent,
    hasPrevious: backwards ? hasAdjacent : Boolean(page.cursor),
    nextCursor: shown.length ? encodeTimeCursor(shown.at(-1)!) : null,
    previousCursor: shown.length ? encodeTimeCursor(shown[0]) : null,
  };
}

function formStatusLabel(value: string | null) {
  if (value === "valid") return "Permintaan berhasil tersimpan";
  if (value === "duplicate") return "Pengiriman berulang, tidak dihitung lagi";
  if (value === "test") return "Data uji tidak dihitung";
  if (value === "not_found") return "Permintaan belum ditemukan";
  return "Pengiriman belum terverifikasi";
}

export async function getAnalyticsJourney(
  id: string,
  trafficClass: ReportTrafficClass = "public",
  filters?: ReportFilters,
  now = new Date(),
): Promise<VisitorJourneyDetail | null> {
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
      formStatus: analyticsSessions.formStatus,
      lastSectionKey: analyticsSessions.lastSectionKey,
      durationSeconds: analyticsSessions.durationSeconds,
      durationQuality: analyticsSessions.durationQuality,
      createdAt: analyticsSessions.createdAt,
    })
    .from(analyticsSessions)
    .where(
      and(
        eq(analyticsSessions.id, id),
        eq(analyticsSessions.trafficClass, trafficClass),
        filters ? sessionConditions(filters, jakartaReportStart(filters.days, now), trafficClass, now) : undefined,
      ),
    );
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
    .where(and(eq(analyticsEvents.sessionId, id), lte(analyticsEvents.occurredAt, now)))
    .orderBy(analyticsEvents.sequence);
  return {
    ...session,
    events,
    formStatus: session.outcome === "Form terkirim" ? formStatusLabel(session.formStatus) : null,
  };
}

export async function hasRealAnalyticsSessions(days: ReportPeriod, now = new Date()) {
  const database = getDatabase();
  if (!database) return false;
  const rows = await database
    .select({ id: analyticsSessions.id })
    .from(analyticsSessions)
    .where(
      and(
        eq(analyticsSessions.trafficClass, "public"),
        gte(analyticsSessions.createdAt, jakartaReportStart(days, now)),
        lte(analyticsSessions.createdAt, now),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
