"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { auditLogs, leadNotes, leads, users } from "@/lib/database/schema";
import { businessSource } from "@/features/analytics/business-discovery-model";
import { isProspectStatus } from "./prospect-status";

async function requireWorkspaceUser() {
  const user = await getSession();
  if (!user) redirect("/admin/login");
  return user;
}

function refreshProspects(id?: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/prospects");
  if (id) redirect(`/admin/prospects?selected=${id}`);
}

async function prospectDataClass(id: string) {
  const database = getDatabase();
  if (!database) return null;
  const [lead] = await database
    .select({ dataClass: leads.dataClass, source: leads.source })
    .from(leads)
    .where(eq(leads.id, id))
    .limit(1);
  const user = await getSession();
  if (lead?.source === businessSource && (!user || !["admin", "sales"].includes(user.role))) return null;
  if (!lead || lead.dataClass !== "production") return null;
  return true;
}

export async function assignProspect(formData: FormData) {
  const user = await requireWorkspaceUser();
  const parsed = z.object({ leadId: z.string().uuid(), assignedUserId: z.string().uuid().nullable() }).safeParse({
    leadId: formData.get("leadId"),
    assignedUserId: formData.get("assignedUserId") || null,
  });
  if (!parsed.success) return;
  const database = getDatabase();
  if (!database) return;
  if (!(await prospectDataClass(parsed.data.leadId))) return;
  await database.transaction(async (transaction) => {
    const [lead] = await transaction
      .select({ source: leads.source })
      .from(leads)
      .where(eq(leads.id, parsed.data.leadId));
    if (lead?.source === businessSource && parsed.data.assignedUserId) {
      const [member] = await transaction
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.id, parsed.data.assignedUserId),
            eq(users.isActive, true),
            inArray(users.role, ["admin", "sales"]),
          ),
        );
      if (!member) return;
    }
    await transaction
      .update(leads)
      .set({ assignedUserId: parsed.data.assignedUserId })
      .where(eq(leads.id, parsed.data.leadId));
    await transaction.insert(auditLogs).values({
      actorId: user.id,
      action: "prospect.assigned",
      entityType: "lead",
      entityId: parsed.data.leadId,
      metadata: { assignedUserId: parsed.data.assignedUserId, source: "workspace" },
    });
  });
  refreshProspects(parsed.data.leadId);
}

export async function addProspectNote(formData: FormData) {
  const user = await requireWorkspaceUser();
  const parsed = z.object({ leadId: z.string().uuid(), body: z.string().trim().min(2).max(2000) }).safeParse({
    leadId: formData.get("leadId"),
    body: formData.get("body"),
  });
  if (!parsed.success) return;
  const database = getDatabase();
  if (!database) return;
  if (!(await prospectDataClass(parsed.data.leadId))) return;
  await database.transaction(async (transaction) => {
    await transaction
      .insert(leadNotes)
      .values({ leadId: parsed.data.leadId, authorId: user.id, body: parsed.data.body });
    await transaction.insert(auditLogs).values({
      actorId: user.id,
      action: "prospect.note_added",
      entityType: "lead",
      entityId: parsed.data.leadId,
      metadata: { source: "workspace" },
    });
  });
  refreshProspects(parsed.data.leadId);
}

export async function updateProspectStatus(formData: FormData) {
  const user = await requireWorkspaceUser();
  if (!["admin", "sales"].includes(user.role)) return;
  const parsed = z.object({ leadId: z.string().uuid(), status: z.string().trim() }).safeParse({
    leadId: formData.get("leadId"),
    status: formData.get("status"),
  });
  if (!parsed.success || !isProspectStatus(parsed.data.status)) return;
  const database = getDatabase();
  if (!database || !(await prospectDataClass(parsed.data.leadId))) return;
  await database.transaction(async (transaction) => {
    await transaction.update(leads).set({ status: parsed.data.status }).where(eq(leads.id, parsed.data.leadId));
    await transaction.insert(auditLogs).values({
      actorId: user.id,
      action: "prospect.status_changed",
      entityType: "lead",
      entityId: parsed.data.leadId,
      metadata: { status: parsed.data.status, source: "workspace" },
    });
  });
  refreshProspects(parsed.data.leadId);
}
