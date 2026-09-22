"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { auditLogs, leadNotes, leads } from "@/lib/database/schema";

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

export async function assignProspect(formData: FormData) {
  const user = await requireWorkspaceUser();
  const parsed = z.object({ leadId: z.string().uuid(), assignedUserId: z.string().uuid().nullable() }).safeParse({
    leadId: formData.get("leadId"),
    assignedUserId: formData.get("assignedUserId") || null,
  });
  if (!parsed.success) return;
  const database = getDatabase();
  if (!database) return;
  await database.transaction(async (transaction) => {
    await transaction
      .update(leads)
      .set({ assignedUserId: parsed.data.assignedUserId })
      .where(eq(leads.id, parsed.data.leadId));
    await transaction.insert(auditLogs).values({
      actorId: user.id,
      action: "prospect.assigned",
      entityType: "lead",
      entityId: parsed.data.leadId,
      metadata: { assignedUserId: parsed.data.assignedUserId },
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
  await database.transaction(async (transaction) => {
    await transaction
      .insert(leadNotes)
      .values({ leadId: parsed.data.leadId, authorId: user.id, body: parsed.data.body });
    await transaction.insert(auditLogs).values({
      actorId: user.id,
      action: "prospect.note_added",
      entityType: "lead",
      entityId: parsed.data.leadId,
    });
  });
  refreshProspects(parsed.data.leadId);
}
