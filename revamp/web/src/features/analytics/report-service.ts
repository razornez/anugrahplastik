import { desc, gte, inArray } from "drizzle-orm";
import { analyticsEvents, analyticsSessions } from "@/lib/database/schema";
import { getDatabase } from "@/lib/database/client";
import { trafficSource } from "./source";

export type ReportPeriod = 7 | 30;
export type DeviceFilter = "all" | "mobile" | "desktop" | "tablet" | "unknown";

export type ReportFilters = { days: ReportPeriod; device: DeviceFilter; city: string; source: string; outcome: string };

type SessionRecord = {
  id: string;
  landingPath: string;
  referrer: string | null;
  deviceCategory: string;
  browserName: string | null;
  operatingSystem: string | null;
  cityName: string | null;
  regionName: string | null;
  lastSectionKey: string | null;
  createdAt: Date;
  lastEventAt: Date | null;
  endedAt: Date | null;
  durationSeconds: number | null;
};

type EventRecord = {
  id: string;
  sessionId: string;
  name: string;
  sectionKey: string | null;
  elementKey: string | null;
  metadata: Record<string, string | number | boolean> | null;
  sequence: number;
  occurredAt: Date;
};

export type VisitorJourney = SessionRecord & { sourceName: string; outcome: string; events: EventRecord[] };

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
});

function reportDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(date);
}

function deviceLabel(key: string) {
  return key === "mobile" ? "Ponsel" : key === "desktop" ? "Komputer" : key === "tablet" ? "Tablet" : "Tidak diketahui";
}

function outcomeFor(events: EventRecord[]) {
  if (events.some((event) => event.name === "form_submit")) return "Form terkirim";
  if (events.some((event) => event.name === "whatsapp_click")) return "Klik WhatsApp";
  if (events.some((event) => event.name === "form_start")) return "Form mulai diisi";
  if (events.some((event) => event.name === "cta_click")) return "Tombol minat diklik";
  return "Melihat halaman";
}

function initialTrend(days: number) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (days - index - 1));
    return { date: reportDate(date), sessions: 0, forms: 0 };
  });
}

export async function getAnalyticsReport(filters: ReportFilters): Promise<AnalyticsReport> {
  const database = getDatabase();
  if (!database) return emptyReport(filters);
  const since = new Date(Date.now() - filters.days * 24 * 60 * 60 * 1_000);
  const rawSessions = (await database
    .select({
      id: analyticsSessions.id,
      landingPath: analyticsSessions.landingPath,
      referrer: analyticsSessions.referrer,
      deviceCategory: analyticsSessions.deviceCategory,
      browserName: analyticsSessions.browserName,
      operatingSystem: analyticsSessions.operatingSystem,
      cityName: analyticsSessions.cityName,
      regionName: analyticsSessions.regionName,
      lastSectionKey: analyticsSessions.lastSectionKey,
      createdAt: analyticsSessions.createdAt,
      lastEventAt: analyticsSessions.lastEventAt,
      endedAt: analyticsSessions.endedAt,
      durationSeconds: analyticsSessions.durationSeconds,
    })
    .from(analyticsSessions)
    .where(gte(analyticsSessions.createdAt, since))
    .orderBy(desc(analyticsSessions.createdAt))) as SessionRecord[];
  const sourceOptions = Array.from(new Set(rawSessions.map((session) => trafficSource(session.referrer)))).sort();
  const cityOptions = Array.from(
    new Set(rawSessions.map((session) => session.cityName).filter((city): city is string => Boolean(city))),
  ).sort();
  const filteredSessions = rawSessions.filter((session) => {
    if (filters.device !== "all" && session.deviceCategory !== filters.device) return false;
    if (filters.city && session.cityName !== filters.city) return false;
    if (filters.source && trafficSource(session.referrer) !== filters.source) return false;
    return true;
  });
  const sessionIds = filteredSessions.map((session) => session.id);
  const rawEvents = sessionIds.length
    ? ((await database
        .select({
          id: analyticsEvents.id,
          sessionId: analyticsEvents.sessionId,
          name: analyticsEvents.name,
          sectionKey: analyticsEvents.sectionKey,
          elementKey: analyticsEvents.elementKey,
          metadata: analyticsEvents.metadata,
          sequence: analyticsEvents.sequence,
          occurredAt: analyticsEvents.occurredAt,
        })
        .from(analyticsEvents)
        .where(inArray(analyticsEvents.sessionId, sessionIds))
        .orderBy(analyticsEvents.sessionId, analyticsEvents.sequence)) as EventRecord[])
    : [];
  const eventsBySession = new Map<string, EventRecord[]>();
  rawEvents.forEach((event) =>
    eventsBySession.set(event.sessionId, [...(eventsBySession.get(event.sessionId) ?? []), event]),
  );
  const allJourneys = filteredSessions.map((session) => {
    const events = eventsBySession.get(session.id) ?? [];
    return { ...session, sourceName: trafficSource(session.referrer), outcome: outcomeFor(events), events };
  });
  const journeys = filters.outcome ? allJourneys.filter((journey) => journey.outcome === filters.outcome) : allJourneys;
  const trend = initialTrend(filters.days);
  const trendIndex = new Map(trend.map((point) => [point.date, point]));
  journeys.forEach((session) => {
    const point = trendIndex.get(reportDate(session.createdAt));
    if (!point) return;
    point.sessions += 1;
    if (session.events.some((event) => event.name === "form_submit")) point.forms += 1;
  });
  const deviceTotals = new Map<string, number>();
  const cityTotals = new Map<string, number>();
  journeys.forEach((session) => {
    deviceTotals.set(session.deviceCategory, (deviceTotals.get(session.deviceCategory) ?? 0) + 1);
    const city = session.cityName ?? "Tidak diketahui";
    cityTotals.set(city, (cityTotals.get(city) ?? 0) + 1);
  });
  const uniqueSessionsFor = (eventName: string) =>
    new Set(
      journeys
        .filter((journey) => journey.events.some((event) => event.name === eventName))
        .map((journey) => journey.id),
    ).size;
  const forms = uniqueSessionsFor("form_submit");
  const ctaClicks = rawEvents.filter((event) => event.name === "cta_click").length;
  const whatsappClicks = rawEvents.filter((event) => event.name === "whatsapp_click").length;
  return {
    available: true,
    filters,
    totals: { sessions: journeys.length, forms, ctaClicks, whatsappClicks },
    trend,
    devices: Array.from(deviceTotals, ([key, total]) => ({ key, label: deviceLabel(key), total })).sort(
      (a, b) => b.total - a.total,
    ),
    cities: Array.from(cityTotals, ([key, total]) => ({ key, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5),
    funnel: [
      { label: "Pengunjung", total: journeys.length },
      { label: "Melihat bagian halaman", total: uniqueSessionsFor("section_engaged") },
      { label: "Menekan tombol minat", total: uniqueSessionsFor("cta_click") },
      { label: "Mulai isi formulir", total: uniqueSessionsFor("form_start") },
      { label: "Form terkirim", total: forms },
    ],
    journeys: journeys.slice(0, 30),
    citiesForFilter: cityOptions,
    sourcesForFilter: sourceOptions,
  };
}
