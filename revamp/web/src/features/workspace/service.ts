import { and, asc, count, countDistinct, desc, eq, gte, ilike, isNull, lt, or, sql } from "drizzle-orm";
import {
  analyticsEvents,
  analyticsSessions,
  auditLogs,
  businessTransactions,
  leadNotes,
  leads,
  users,
} from "@/lib/database/schema";
import { getDatabase } from "@/lib/database/client";
import { decodeTimeCursor, encodeTimeCursor } from "@/lib/pagination/cursor";

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
    .select({
      total:
        name === "form_submit" ? countDistinct(analyticsEvents.conversionId) : countDistinct(analyticsEvents.sessionId),
    })
    .from(analyticsEvents)
    .innerJoin(analyticsSessions, eq(analyticsEvents.sessionId, analyticsSessions.id))
    .where(and(condition, range, eq(analyticsSessions.trafficClass, "public")));
  return Number(rows[0]?.total ?? 0);
}

export async function getWorkspaceOverview(period: WorkspacePeriod) {
  const database = getDatabase();
  const { start, prior } = workspaceRange(period);
  if (!database) return null;

  const [
    sessions,
    formSubmits,
    ctaClicks,
    whatsappClicks,
    newLeads,
    unassigned,
    recentLeads,
    activity,
    openOrders,
    paymentAttention,
  ] = await Promise.all([
    database
      .select({ total: count() })
      .from(analyticsSessions)
      .where(and(gte(analyticsSessions.createdAt, start), eq(analyticsSessions.trafficClass, "public"))),
    eventCount("form_submit", start),
    eventCount("cta_click", start),
    eventCount("whatsapp_click", start),
    database
      .select({ total: count() })
      .from(leads)
      .where(and(gte(leads.createdAt, start), eq(leads.dataClass, "production"))),
    database
      .select({ total: count() })
      .from(leads)
      .where(and(isNull(leads.assignedUserId), eq(leads.dataClass, "production"))),
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
      .where(eq(leads.dataClass, "production"))
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
    database
      .select({ total: count() })
      .from(businessTransactions)
      .where(
        and(
          eq(businessTransactions.dataClass, "production"),
          isNull(businessTransactions.cancelledAt),
          sql`${businessTransactions.commercialStatus} <> 'completed'`,
        ),
      ),
    database
      .select({ total: count() })
      .from(businessTransactions)
      .where(
        and(
          eq(businessTransactions.dataClass, "production"),
          isNull(businessTransactions.cancelledAt),
          sql`${businessTransactions.paymentStatus} <> 'verified'`,
        ),
      ),
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
      .where(
        and(
          gte(analyticsSessions.createdAt, prior),
          lt(analyticsSessions.createdAt, start),
          eq(analyticsSessions.trafficClass, "public"),
        ),
      ),
    eventCount("form_submit", prior, start),
  ]);

  return {
    current,
    comparison: { sessions: Number(priorSessions[0]?.total ?? 0), forms: priorForms },
    operations: {
      openOrders: Number(openOrders[0]?.total ?? 0),
      paymentAttention: Number(paymentAttention[0]?.total ?? 0),
    },
    recentLeads,
    activity,
  };
}

export async function getProspects(
  query: {
    selectedId?: string;
    search?: string;
    status?: string;
    cursor?: string;
    direction?: "next" | "previous";
  } = {},
) {
  const database = getDatabase();
  if (!database) return null;
  const cursor = decodeTimeCursor(query.cursor);
  const cursorDate = cursor ? new Date(cursor.createdAt) : null;
  const cursorId = cursor?.id ?? "";
  const backwards = query.direction === "previous";
  const filters = and(
    eq(leads.dataClass, "production"),
    query.status ? eq(leads.status, query.status) : undefined,
    query.search
      ? or(ilike(leads.name, `%${query.search.slice(0, 120)}%`), ilike(leads.phone, `%${query.search.slice(0, 120)}%`))
      : undefined,
    cursorDate
      ? backwards
        ? or(
            sql`${leads.createdAt} > ${cursorDate}`,
            and(eq(leads.createdAt, cursorDate), sql`${leads.id} > ${cursorId}`),
          )
        : or(
            sql`${leads.createdAt} < ${cursorDate}`,
            and(eq(leads.createdAt, cursorDate), sql`${leads.id} < ${cursorId}`),
          )
      : undefined,
  );
  const [loadedProspects, members] = await Promise.all([
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
      .where(filters)
      .orderBy(...(backwards ? [asc(leads.createdAt), asc(leads.id)] : [desc(leads.createdAt), desc(leads.id)]))
      .limit(26),
    database.select({ id: users.id, name: users.name, role: users.role }).from(users).where(eq(users.isActive, true)),
  ]);
  const hasAdjacent = loadedProspects.length > 25;
  const prospects = backwards ? loadedProspects.slice(0, 25).reverse() : loadedProspects.slice(0, 25);
  const selected = prospects.find((prospect) => prospect.id === query.selectedId) ?? prospects[0] ?? null;
  const notes = selected
    ? await database
        .select({ id: leadNotes.id, body: leadNotes.body, createdAt: leadNotes.createdAt, authorName: users.name })
        .from(leadNotes)
        .innerJoin(users, eq(leadNotes.authorId, users.id))
        .where(eq(leadNotes.leadId, selected.id))
        .orderBy(desc(leadNotes.createdAt))
    : [];
  return {
    prospects,
    selected,
    notes,
    members,
    hasNext: backwards ? Boolean(query.cursor) : hasAdjacent,
    hasPrevious: backwards ? hasAdjacent : Boolean(query.cursor),
    nextCursor: prospects.length ? encodeTimeCursor(prospects.at(-1)!) : null,
    previousCursor: prospects.length ? encodeTimeCursor(prospects[0]) : null,
  };
}
