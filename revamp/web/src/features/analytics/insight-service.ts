import { and, count, countDistinct, desc, eq, gte, isNotNull } from "drizzle-orm";
import { analyticsEvents, analyticsSessions } from "@/lib/database/schema";
import { getDatabase } from "@/lib/database/client";

export type InsightRow = { key: string; total: number };

export type AnalyticsInsight = {
  available: boolean;
  days: number;
  sessions: number;
  events: number;
  formStarts: number;
  formSubmits: number;
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
  formSubmits: 0,
  whatsappClicks: 0,
  topSections: [],
  topCtas: [],
  exitSections: [],
});

function toRows(rows: Array<{ key: string | null; total: number }>): InsightRow[] {
  return rows.filter((row): row is { key: string; total: number } => Boolean(row.key)).map((row) => ({ ...row }));
}

export async function getAnalyticsInsight(days = 7): Promise<AnalyticsInsight> {
  const database = getDatabase();
  if (!database) return emptyInsight(days);

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1_000);
  const [summaryRows, topSections, topCtas, exitSections] = await Promise.all([
    database
      .select({ sessions: countDistinct(analyticsSessions.id), events: count(analyticsEvents.id) })
      .from(analyticsSessions)
      .leftJoin(analyticsEvents, eq(analyticsEvents.sessionId, analyticsSessions.id))
      .where(gte(analyticsSessions.createdAt, since)),
    database
      .select({ key: analyticsEvents.sectionKey, total: count() })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.name, "section_engaged"),
          gte(analyticsEvents.occurredAt, since),
          isNotNull(analyticsEvents.sectionKey),
        ),
      )
      .groupBy(analyticsEvents.sectionKey)
      .orderBy(desc(count()))
      .limit(5),
    database
      .select({ key: analyticsEvents.elementKey, total: count() })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.name, "cta_click"),
          gte(analyticsEvents.occurredAt, since),
          isNotNull(analyticsEvents.elementKey),
        ),
      )
      .groupBy(analyticsEvents.elementKey)
      .orderBy(desc(count()))
      .limit(5),
    database
      .select({ key: analyticsEvents.sectionKey, total: count() })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.name, "page_leave"),
          gte(analyticsEvents.occurredAt, since),
          isNotNull(analyticsEvents.sectionKey),
        ),
      )
      .groupBy(analyticsEvents.sectionKey)
      .orderBy(desc(count()))
      .limit(5),
  ]);
  const summary = summaryRows[0];

  const countFor = (name: string) =>
    database
      .select({ total: count() })
      .from(analyticsEvents)
      .where(and(eq(analyticsEvents.name, name), gte(analyticsEvents.occurredAt, since)));

  const [formStarts, formSubmits, whatsappClicks] = await Promise.all([
    countFor("form_start"),
    countFor("form_submit"),
    countFor("whatsapp_click"),
  ]);

  return {
    available: true,
    days,
    sessions: Number(summary?.sessions ?? 0),
    events: Number(summary?.events ?? 0),
    formStarts: Number(formStarts[0]?.total ?? 0),
    formSubmits: Number(formSubmits[0]?.total ?? 0),
    whatsappClicks: Number(whatsappClicks[0]?.total ?? 0),
    topSections: toRows(topSections.map((row) => ({ key: row.key, total: Number(row.total) }))),
    topCtas: toRows(topCtas.map((row) => ({ key: row.key, total: Number(row.total) }))),
    exitSections: toRows(exitSections.map((row) => ({ key: row.key, total: Number(row.total) }))),
  };
}

export function analyticsWhatsappReport(insight: AnalyticsInsight) {
  const list = (items: InsightRow[]) =>
    items.length ? items.map((item) => `${item.key} (${item.total})`).join(", ") : "belum ada data";
  return [
    `Ringkasan website Anugrah Plastik · ${insight.days} hari terakhir`,
    "",
    `Sesi anonim: ${insight.sessions}`,
    `Interaksi tercatat: ${insight.events}`,
    `Form dimulai / terkirim: ${insight.formStarts} / ${insight.formSubmits}`,
    `Klik WhatsApp: ${insight.whatsappClicks}`,
    "",
    `Section paling banyak dibaca: ${list(insight.topSections)}`,
    `CTA paling banyak diklik: ${list(insight.topCtas)}`,
    `Titik keluar terbanyak: ${list(insight.exitSections)}`,
  ].join("\n");
}
