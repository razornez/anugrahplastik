"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { auditLogs, growthOpportunityReviews } from "@/lib/database/schema";
import { getSearchOpportunities } from "./opportunity-service";

export async function reviewSearchOpportunity(formData: FormData) {
  const user = await getSession();
  if (!user || user.role !== "admin") throw new Error("Hanya administrator yang dapat meninjau peluang.");
  const key = String(formData.get("key") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!/^[a-f0-9]{64}$/.test(key) || !["reviewing", "relevant", "dismissed"].includes(status))
    throw new Error("Tindakan peninjauan tidak valid.");
  const { items } = await getSearchOpportunities();
  const opportunity = items.find((item) => item.key === key);
  if (!opportunity) throw new Error("Peluang tidak lagi tersedia pada audit terakhir.");
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  await database.transaction(async (tx) => {
    await tx
      .insert(growthOpportunityReviews)
      .values({ key, status, updatedBy: user.id })
      .onConflictDoUpdate({
        target: growthOpportunityReviews.key,
        set: { status, updatedBy: user.id, updatedAt: new Date() },
      });
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "growth.opportunity_reviewed",
      entityType: "growth_opportunity",
      entityId: key,
      metadata: { status, kind: opportunity.kind, title: opportunity.title },
    });
  });
  revalidatePath("/admin/growth");
}
