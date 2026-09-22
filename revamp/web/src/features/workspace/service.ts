import { and, count, desc, eq, gte, isNull, lt } from "drizzle-orm";
import { analyticsEvents, analyticsSessions, auditLogs, leadNotes, leads, users } from "@/lib/database/schema";
import { getDatabase } from "@/lib/database/client";

export type WorkspacePeriod = "today" | "week" | "month";

export function workspaceRange(period: WorkspacePeriod) {
  const now = new Date();
  const start = new Date(now);
  if (period === "today") start.setHours(0, 0, 0, 0);
  if (period === "week") start.setDate(start.getDate() - 6);
  if (period === "month") start.setDate(start.getDate() - 29);
  start.setHours(0, 0, 0, 0);
  const prior = new Date(start);
  prior.setTime(prior.getTime() - (now.getTime() - start.getTime()));
  return { start, prior, now };
}

async function eventCount(name: string | null, start: Date, end?: Date) {
  const database = getDatabase();
  if (!database) return 0;
  const condition = name ? eq(analyticsEvents.name, name) : undefined;
  const range = end
    ? and(gte(analyticsEvents.occurredAt, start), lt(analyticsEvents.occurredAt, end))
    : gte(analyticsEvents.occurredAt, start);
  const rows = await database
    .select({ total: count() })
    .from(analyticsEvents)
    .where(condition ? and(condition, range) : range);
  return Number(rows[0]?.total ?? 0);
}

export async function getWorkspaceOverview(period: WorkspacePeriod) {
  const database = getDatabase();
  const { start, prior } = workspaceRange(period);
  if (!database) return null;

  const [sessions, formSubmits, ctaClicks, whatsappClicks, newLeads, unassigned, recentLeads, activity] =
    await Promise.all([
      database.select({ total: count() }).from(analyticsSessions).where(gte(analyticsSessions.createdAt, start)),
      eventCount("form_submit", start),
      eventCount("cta_click", start),
      eventCount("whatsapp_click", start),
      database.select({ total: count() }).from(leads).where(gte(leads.createdAt, start)),
      database.select({ total: count() }).from(leads).where(isNull(leads.assignedUserId)),
      database
        .select({
          id: leads.id,
          name: leads.name,
          message: leads.message,
          source: leads.source,
          createdAt: leads.createdAt,
          assignedName: users.name,
        })
        .from(leads)
        .leftJoin(users, eq(leads.assignedUserId, users.id))
        .orderBy(desc(leads.createdAt))
        .limit(5),
      database
        .select({
          action: auditLogs.action,
          entityType: auditLogs.entityType,
          createdAt: auditLogs.createdAt,
          actorName: users.name,
        })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.actorId, users.id))
        .orderBy(desc(auditLogs.createdAt))
        .limit(5),
    ]);

  const current = {
    sessions: Number(sessions[0]?.total ?? 0),
    formSubmits,
    ctaClicks,
    whatsappClicks,
    leads: Number(newLeads[0]?.total ?? 0),
    unassigned: Number(unassigned[0]?.total ?? 0),
  };
  const [priorSessions, priorForms] = await Promise.all([
    database
      .select({ total: count() })
      .from(analyticsSessions)
      .where(and(gte(analyticsSessions.createdAt, prior), eq(analyticsSessions.createdAt, start))),
    eventCount("form_submit", prior, start),
  ]);

  return {
    current,
    comparison: { sessions: Number(priorSessions[0]?.total ?? 0), forms: priorForms },
    recentLeads,
    activity,
  };
}

export async function getProspects(selectedId?: string) {
  const database = getDatabase();
  if (!database) return null;
  const [prospects, members] = await Promise.all([
    database
      .select({
        id: leads.id,
        name: leads.name,
        phone: leads.phone,
        message: leads.message,
        source: leads.source,
        status: leads.status,
        createdAt: leads.createdAt,
        assignedUserId: leads.assignedUserId,
        assignedName: users.name,
      })
      .from(leads)
      .leftJoin(users, eq(leads.assignedUserId, users.id))
      .orderBy(desc(leads.createdAt)),
    database.select({ id: users.id, name: users.name, role: users.role }).from(users).where(eq(users.isActive, true)),
  ]);
  const selected = prospects.find((prospect) => prospect.id === selectedId) ?? prospects[0] ?? null;
  const notes = selected
    ? await database
        .select({ id: leadNotes.id, body: leadNotes.body, createdAt: leadNotes.createdAt, authorName: users.name })
        .from(leadNotes)
        .innerJoin(users, eq(leadNotes.authorId, users.id))
        .where(eq(leadNotes.leadId, selected.id))
        .orderBy(desc(leadNotes.createdAt))
    : [];
  return { prospects, selected, notes, members };
}
