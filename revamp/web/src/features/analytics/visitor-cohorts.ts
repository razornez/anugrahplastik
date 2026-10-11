import { and, eq, gte, lt, sql } from "drizzle-orm";
import { analyticsSessions } from "@/lib/database/schema";
import { getDatabase } from "@/lib/database/client";
import { jakartaReportStart } from "./report-period";

export type VisitorCohortDay = { date: string; newVisitors: number; returningVisitors: number };
export type VisitorCohorts = {
  available: boolean;
  days: 7 | 30;
  newVisitors: number;
  returningVisitors: number;
  trend: VisitorCohortDay[];
};

function jakartaDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(date);
}

export function classifyVisitorSessions(
  sessions: Array<{ anonymousId: string; createdAt: Date }>,
  days: 7 | 30,
  now = new Date(),
): VisitorCohorts {
  const start = jakartaReportStart(days, now);
  const end = jakartaReportStart(1, now);
  end.setUTCDate(end.getUTCDate() + 1);
  const firstSeen = new Map<string, Date>();
  for (const session of sessions) {
    if (session.createdAt >= end) continue;
    const previous = firstSeen.get(session.anonymousId);
    if (!previous || session.createdAt < previous) firstSeen.set(session.anonymousId, session.createdAt);
  }
  const trend = Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + index);
    return { date: jakartaDate(date), newVisitors: 0, returningVisitors: 0 };
  });
  const daily = new Set<string>();
  const period = new Set<string>();
  let newVisitors = 0;
  let returningVisitors = 0;
  for (const session of sessions) {
    if (session.createdAt < start || session.createdAt >= end) continue;
    const day = jakartaDate(session.createdAt);
    const first = firstSeen.get(session.anonymousId)!;
    const isNew = first >= start;
    if (!period.has(session.anonymousId)) {
      period.add(session.anonymousId);
      if (isNew) newVisitors += 1;
      else returningVisitors += 1;
    }
    const key = `${day}|${session.anonymousId}`;
    if (daily.has(key)) continue;
    daily.add(key);
    const point = trend.find((item) => item.date === day);
    if (!point) continue;
    if (jakartaDate(first) === day) point.newVisitors += 1;
    else point.returningVisitors += 1;
  }
  return { available: true, days, newVisitors, returningVisitors, trend };
}

export async function getVisitorCohorts(days: 7 | 30): Promise<VisitorCohorts> {
  const database = getDatabase();
  if (!database) return { available: false, days, newVisitors: 0, returningVisitors: 0, trend: [] };
  const now = new Date();
  const start = jakartaReportStart(days, now);
  const end = jakartaReportStart(1, now);
  end.setUTCDate(end.getUTCDate() + 1);
  const firstSeen = database.$with("first_seen").as(
    database
      .select({
        anonymousId: analyticsSessions.anonymousId,
        firstAt: sql<Date>`min(${analyticsSessions.createdAt})`.as("first_at"),
      })
      .from(analyticsSessions)
      .where(and(eq(analyticsSessions.trafficClass, "public"), lt(analyticsSessions.createdAt, end)))
      .groupBy(analyticsSessions.anonymousId),
  );
  const dayExpression = sql<string>`to_char(${analyticsSessions.createdAt} AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD')`;
  const rows = await database
    .with(firstSeen)
    .select({
      date: dayExpression,
      anonymousId: analyticsSessions.anonymousId,
      firstAt: firstSeen.firstAt,
    })
    .from(analyticsSessions)
    .innerJoin(firstSeen, eq(analyticsSessions.anonymousId, firstSeen.anonymousId))
    .where(
      and(
        eq(analyticsSessions.trafficClass, "public"),
        gte(analyticsSessions.createdAt, start),
        lt(analyticsSessions.createdAt, end),
      ),
    )
    .groupBy(dayExpression, analyticsSessions.anonymousId, firstSeen.firstAt);

  const trend = Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + index);
    return { date: jakartaDate(date), newVisitors: 0, returningVisitors: 0 };
  });
  const daily = new Set<string>();
  const period = new Map<string, Date>();
  for (const row of rows) {
    const first = new Date(row.firstAt);
    period.set(row.anonymousId, first);
    const key = `${row.date}|${row.anonymousId}`;
    if (daily.has(key)) continue;
    daily.add(key);
    const point = trend.find((item) => item.date === row.date);
    if (!point) continue;
    if (jakartaDate(first) === row.date) point.newVisitors += 1;
    else point.returningVisitors += 1;
  }
  const newVisitors = [...period.values()].filter((date) => date >= start).length;
  return { available: true, days, newVisitors, returningVisitors: period.size - newVisitors, trend };
}
