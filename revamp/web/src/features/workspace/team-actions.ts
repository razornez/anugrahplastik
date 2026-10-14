"use server";

import { randomInt } from "node:crypto";
import { hash } from "bcryptjs";
import { and, count, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { sendSecurityEmail } from "@/features/integrations/security-mail";
import { getSession } from "@/lib/auth/session";
import { issueAuthToken, normalizeUsername, validUsername } from "@/lib/auth/security";
import { getDatabase } from "@/lib/database/client";
import { auditLogs, authRateLimits, authTokens, sessions, users } from "@/lib/database/schema";

async function requireOwner() {
  const user = await getSession();
  if (user?.role !== "admin") redirect("/admin/login");
  return user;
}

async function activationUrl(token: string) {
  const requestHeaders = await headers();
  const base =
    process.env.NODE_ENV === "production"
      ? "https://anugrahplastik.com"
      : `http://${requestHeaders.get("host") || "127.0.0.1:3100"}`;
  return `${base}/admin/reset-pin?purpose=activate&token=${encodeURIComponent(token)}`;
}

export async function createTeamMember(formData: FormData) {
  const owner = await requireOwner();
  const submitted = Object.fromEntries(formData);
  const username = normalizeUsername(String(submitted.username ?? ""));
  const parsed = z
    .object({
      name: z.string().trim().min(2).max(120),
      email: z
        .string()
        .trim()
        .email()
        .max(255)
        .transform((value) => value.toLowerCase()),
      role: z.enum(["admin", "sales", "content"]),
    })
    .safeParse(submitted);
  if (!parsed.success || !validUsername(username)) redirect("/admin/team?error=member");
  const database = getDatabase();
  if (!database) redirect("/admin/team?error=database");
  try {
    const [member] = await database
      .insert(users)
      .values({
        username,
        name: parsed.data.name,
        email: parsed.data.email,
        role: parsed.data.role,
        passwordHash: null,
        pinHash: null,
      })
      .returning();
    const token = await issueAuthToken(member.id, "activate");
    let mailSent = true;
    try {
      const result = await sendSecurityEmail({
        to: member.email,
        name: member.name,
        username: member.username,
        purpose: "activate",
        url: await activationUrl(token),
      });
      mailSent = result.sent;
    } catch {
      mailSent = false;
    }
    await database.insert(auditLogs).values({
      actorId: owner.id,
      action: "team.member_created",
      entityType: "user",
      entityId: member.id,
      metadata: { role: member.role, activationMailSent: mailSent },
    });
    revalidatePath("/admin/team");
    redirect(`/admin/team?status=${mailSent ? "created" : "created-mail-failed"}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect("/admin/team?error=member");
  }
}

export async function toggleTeamMember(formData: FormData) {
  const owner = await requireOwner();
  const parsed = z
    .object({ id: z.string().uuid(), isActive: z.enum(["true", "false"]) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success || parsed.data.id === owner.id) return;
  const database = getDatabase();
  if (!database) return;
  const [target] = await database
    .select({ role: users.role, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, parsed.data.id));
  if (!target) return;
  const isActive = parsed.data.isActive === "true";
  if (!isActive && target.role === "admin" && target.isActive) {
    const [remaining] = await database
      .select({ value: count() })
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.isActive, true)));
    if ((remaining?.value ?? 0) <= 1) redirect("/admin/team?error=last-admin");
  }
  await database.transaction(async (transaction) => {
    await transaction.update(users).set({ isActive, updatedAt: new Date() }).where(eq(users.id, parsed.data.id));
    if (!isActive)
      await transaction
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, parsed.data.id), isNull(sessions.revokedAt)));
    await transaction.insert(auditLogs).values({
      actorId: owner.id,
      action: isActive ? "team.member_activated" : "team.member_deactivated",
      entityType: "user",
      entityId: parsed.data.id,
    });
  });
  revalidatePath("/admin/team");
}

export async function unlockTeamMember(formData: FormData) {
  const owner = await requireOwner();
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const database = getDatabase();
  if (!database) return;
  await database.transaction(async (transaction) => {
    await transaction
      .update(users)
      .set({ lockedUntil: null, failedLoginCount: 0, failedLoginWindowStartedAt: null })
      .where(eq(users.id, id.data));
    await transaction.delete(authRateLimits).where(eq(authRateLimits.userId, id.data));
    await transaction
      .insert(auditLogs)
      .values({ actorId: owner.id, action: "auth.account_unlocked", entityType: "user", entityId: id.data });
  });
  revalidatePath("/admin/team");
}

export type EmergencyPinState = { pin?: string; error?: string };

export async function createEmergencyPin(_state: EmergencyPinState, formData: FormData): Promise<EmergencyPinState> {
  const owner = await requireOwner();
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Akun tidak valid." };
  const database = getDatabase();
  if (!database) return { error: "Database belum tersedia." };
  const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const now = new Date();
  await database.transaction(async (transaction) => {
    await transaction
      .update(users)
      .set({ pinHash: await hash(pin, 12), temporaryPin: true, pinChangedAt: now, lockedUntil: null, updatedAt: now })
      .where(eq(users.id, id.data));
    await transaction
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.userId, id.data), isNull(sessions.revokedAt)));
    await transaction.delete(authRateLimits).where(eq(authRateLimits.userId, id.data));
    await transaction.delete(authTokens).where(eq(authTokens.userId, id.data));
    await transaction
      .insert(auditLogs)
      .values({ actorId: owner.id, action: "auth.emergency_pin_created", entityType: "user", entityId: id.data });
  });
  revalidatePath("/admin/team");
  return { pin };
}
