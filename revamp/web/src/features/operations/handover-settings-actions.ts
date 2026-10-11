"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { auditLogs, handoverNumberCounters } from "@/lib/database/schema";

export async function initializeHandoverCounter(formData: FormData) {
  const user = await getSession();
  if (!user || user.role !== "admin") throw new Error("Hanya administrator yang dapat menetapkan nomor STB.");
  const year = z.coerce.number().int().min(2020).max(2100).parse(formData.get("year"));
  const lastValue = z.coerce.number().int().min(0).max(999999).parse(formData.get("lastValue"));
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  await database.transaction(async (tx) => {
    const [created] = await tx
      .insert(handoverNumberCounters)
      .values({ referenceYear: year, lastValue, initializedBy: user.id })
      .onConflictDoNothing()
      .returning({ referenceYear: handoverNumberCounters.referenceYear });
    if (!created) throw new Error("Urutan tahun ini sudah ditetapkan dan tidak dapat direset.");
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "handover.counter_initialized",
      entityType: "handover_counter",
      entityId: String(year),
      metadata: { lastValue },
    });
  });
  revalidatePath("/admin/settings/handover");
  redirect("/admin/settings/handover?saved=1");
}
