"use server";

import { eq } from "drizzle-orm";
import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { auditLogs, users } from "@/lib/database/schema";

async function requireOwner() {
  const user = await getSession();
  if (user?.role !== "admin") redirect("/admin/login");
  return user;
}

export async function createTeamMember(formData: FormData) {
  const owner = await requireOwner();
  const parsed = z
    .object({
      name: z.string().trim().min(2).max(120),
      email: z.string().trim().email().max(255),
      role: z.enum(["admin", "sales", "content"]),
      password: z.string().min(12).max(128),
      pin: z.string().regex(/^\d{6}$/),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/team?error=member");
  const database = getDatabase();
  if (!database) redirect("/admin/team?error=database");
  try {
    const [member] = await database
      .insert(users)
      .values({
        name: parsed.data.name,
        email: parsed.data.email,
        role: parsed.data.role,
        passwordHash: await hash(parsed.data.password, 12),
        pinHash: await hash(parsed.data.pin, 12),
      })
      .returning();
    await database.insert(auditLogs).values({
      actorId: owner.id,
      action: "team.member_created",
      entityType: "user",
      entityId: member.id,
      metadata: { role: member.role },
    });
  } catch {
    redirect("/admin/team?error=member");
  }
  revalidatePath("/admin/team");
  redirect("/admin/team?status=created");
}

export async function toggleTeamMember(formData: FormData) {
  const owner = await requireOwner();
  const parsed = z
    .object({ id: z.string().uuid(), isActive: z.enum(["true", "false"]) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success || parsed.data.id === owner.id) return;
  const database = getDatabase();
  if (!database) return;
  const isActive = parsed.data.isActive === "true";
  await database.transaction(async (transaction) => {
    await transaction.update(users).set({ isActive, updatedAt: new Date() }).where(eq(users.id, parsed.data.id));
    await transaction.insert(auditLogs).values({
      actorId: owner.id,
      action: isActive ? "team.member_activated" : "team.member_deactivated",
      entityType: "user",
      entityId: parsed.data.id,
    });
  });
  revalidatePath("/admin/team");
}
