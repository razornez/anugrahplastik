"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { userNotifications } from "@/lib/database/schema";

export async function markNotificationRead(formData: FormData) {
  const user = await getSession();
  const id = z.string().uuid().safeParse(formData.get("id"));
  const database = getDatabase();
  if (!user || !id.success || !database) return;
  await database
    .update(userNotifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(userNotifications.id, id.data), eq(userNotifications.userId, user.id), isNull(userNotifications.readAt)),
    );
  revalidatePath("/admin", "layout");
}
