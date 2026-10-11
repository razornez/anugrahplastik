import { and, count, countDistinct, desc, eq, gte, isNotNull } from "drizzle-orm";
import { analyticsEvents, analyticsSessions } from "@/lib/database/schema";
import { getDatabase } from "@/lib/database/client";
import { actionLabel, sectionLabel } from "./display-labels";
import { jakartaReportStart } from "./report-period";

export type InsightRow = { key: string; total: number };

export type AnalyticsInsight = {
  available: boolean;
  days: number;
  sessions: number;
  events: number;
  formStarts: number;
  formEvents: number;
  validLeads: number;
  whatsappClicks: number;
  topSections: InsightRow[];
  topCtas: InsightRow[];
  exitSections: InsightRow[];
};

const emptyInsight = (days: number): AnalyticsInsight => ({
  available: false,
  days,
  sessions: 0,
  events: 0,
  formStarts: 0,
  formEvents: 0,
  validLeads: 0,
  whatsappClicks: 0,
  topSections: [],
  topCtas: [],
  exitSections: [],
});

function toRows(rows: Array<{ key: string | null; total: number }>): InsightRow[] {
  return rows.filter((row): row is { key: string; total: number } => Boolean(row.key)).map((row) => ({ ...row }));
}

export async function getAnalyticsInsight(
  days = 7,
  trafficClass: "public" | "demo" = "public",
): Promise<AnalyticsInsight> {
  const database = getDatabase();
  if (!database) return emptyInsight(days);

  const since = jakartaReportStart(days);
  const [summaryRows, topSections, topCtas, exitSections] = await Promise.all([
    database
      .select({ sessions: countDistinct(analyticsSessions.id), events: count(analyticsEvents.id) })
      .from(analyticsSessions)
      .leftJoin(analyticsEvents, eq(analyticsEvents.sessionId, analyticsSessions.id))
      .where(and(gte(analyticsSessions.createdAt, since), eq(analyticsSessions.trafficClass, trafficClass))),
    database
      .select({ key: analyticsEvents.sectionKey, total: count() })
      .from(analyticsEvents)
      .innerJoin(analyticsSessions, eq(analyticsEvents.sessionId, analyticsSessions.id))
      .where(
        and(
          eq(analyticsEvents.name, "section_engaged"),
          gte(analyticsEvents.occurredAt, since),
          eq(analyticsSessions.trafficClass, trafficClass),
          isNotNull(analyticsEvents.sectionKey),
        ),
      )
      .groupBy(analyticsEvents.sectionKey)
      .orderBy(desc(count()))
      .limit(5),
    database
      .select({ key: analyticsEvents.elementKey, total: count() })
      .from(analyticsEvents)
      .innerJoin(analyticsSessions, eq(analyticsEvents.sessionId, analyticsSessions.id))
      .where(
        and(
          eq(analyticsEvents.name, "cta_click"),
          gte(analyticsEvents.occurredAt, since),
          eq(analyticsSessions.trafficClass, trafficClass),
          isNotNull(analyticsEvents.elementKey),
        ),
      )
      .groupBy(analyticsEvents.elementKey)
      .orderBy(desc(count()))
      .limit(5),
    database
      .select({ key: analyticsEvents.sectionKey, total: countDistinct(analyticsEvents.sessionId) })
      .from(analyticsEvents)
      .innerJoin(analyticsSessions, eq(analyticsEvents.sessionId, analyticsSessions.id))
      .where(
        and(
          eq(analyticsEvents.name, "page_leave"),
          gte(analyticsEvents.occurredAt, since),
          gte(analyticsSessions.createdAt, since),
          eq(analyticsSessions.trafficClass, trafficClass),
          isNotNull(analyticsEvents.sectionKey),
        ),
      )
      .groupBy(analyticsEvents.sectionKey)
      .orderBy(desc(countDistinct(analyticsEvents.sessionId)))
      .limit(5),
  ]);
  const summary = summaryRows[0];

  const countFor = (name: string) =>
    database
      .select({ total: countDistinct(analyticsEvents.sessionId) })
      .from(analyticsEvents)
      .innerJoin(analyticsSessions, eq(analyticsEvents.sessionId, analyticsSessions.id))
      .where(
        and(
          eq(analyticsEvents.name, name),
          gte(analyticsEvents.occurredAt, since),
          eq(analyticsSessions.trafficClass, trafficClass),
        ),
      );

  const [formStarts, formEvents, validLeads, whatsappClicks] = await Promise.all([
    countFor("form_start"),
    database
      .select({ total: countDistinct(analyticsSessions.id) })
      .from(analyticsSessions)
      .where(
        and(
          eq(analyticsSessions.outcome, "Form terkirim"),
          gte(analyticsSessions.createdAt, since),
          eq(analyticsSessions.trafficClass, trafficClass),
        ),
      ),
    database
      .select({ total: countDistinct(analyticsSessions.id) })
      .from(analyticsSessions)
      .where(
        and(
          eq(analyticsSessions.formStatus, "valid"),
          gte(analyticsSessions.createdAt, since),
          eq(analyticsSessions.trafficClass, trafficClass),
        ),
      ),
    countFor("whatsapp_click"),
  ]);

  return {
    available: true,
    days,
    sessions: Number(summary?.sessions ?? 0),
    events: Number(summary?.events ?? 0),
    formStarts: Number(formStarts[0]?.total ?? 0),
    formEvents: Number(formEvents[0]?.total ?? 0),
    validLeads: Number(validLeads[0]?.total ?? 0),
    whatsappClicks: Number(whatsappClicks[0]?.total ?? 0),
    topSections: toRows(topSections.map((row) => ({ key: row.key, total: Number(row.total) }))),
    topCtas: toRows(topCtas.map((row) => ({ key: row.key, total: Number(row.total) }))),
    exitSections: toRows(exitSections.map((row) => ({ key: row.key, total: Number(row.total) }))),
  };
}

export function analyticsWhatsappReport(insight: AnalyticsInsight) {
  const list = (items: InsightRow[], label: (key: string) => string) =>
    items.length ? items.map((item) => `${label(item.key)} (${item.total})`).join(", ") : "belum ada data";
  return [
    `Ringkasan pengunjung website · ${insight.days} hari terakhir`,
    "",
    `Kunjungan tercatat: ${insight.sessions}`,
    `Interaksi di halaman: ${insight.events}`,
    `Form mulai diisi: ${insight.formStarts}`,
    `Event kirim form / lead valid tersimpan: ${insight.formEvents} / ${insight.validLeads}`,
    `Klik WhatsApp: ${insight.whatsappClicks}`,
    "",
    `Bagian yang paling diperhatikan: ${list(insight.topSections, sectionLabel)}`,
    `Tombol yang paling sering diklik: ${list(insight.topCtas, actionLabel)}`,
    `Bagian yang sering ditinggalkan: ${list(insight.exitSections, sectionLabel)}`,
  ].join("\n");
}
