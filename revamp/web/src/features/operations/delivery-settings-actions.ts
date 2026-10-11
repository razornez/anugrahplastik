"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { auditLogs, deliveryNumberCounters } from "@/lib/database/schema";

export async function initializeDeliveryCounter(formData: FormData) {
  const user = await getSession();
  if (!user || user.role !== "admin") throw new Error("Hanya administrator yang dapat menetapkan nomor surat jalan.");
  const year = z.coerce.number().int().min(2020).max(2100).parse(formData.get("year"));
  const lastValue = z.coerce.number().int().min(0).max(999999).parse(formData.get("lastValue"));
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  await database.transaction(async (tx) => {
    const [created] = await tx
      .insert(deliveryNumberCounters)
      .values({ referenceYear: year, lastValue, initializedBy: user.id })
      .onConflictDoNothing()
      .returning({ referenceYear: deliveryNumberCounters.referenceYear });
    if (!created) throw new Error("Urutan tahun ini sudah ditetapkan dan tidak dapat direset dari halaman ini.");
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "delivery.counter_initialized",
      entityType: "delivery_counter",
      entityId: String(year),
      metadata: { lastValue },
    });
  });
  revalidatePath("/admin/settings/delivery");
  redirect("/admin/settings/delivery?saved=1");
}
