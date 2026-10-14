"use server";

import { compare, hash } from "bcryptjs";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  clearSession,
  createSession,
  extendCurrentSession,
  getSession,
  revokeOtherSessions,
  type SessionUser,
} from "@/lib/auth/session";
import {
  authRateKey,
  clearFailedLogin,
  issueAuthToken,
  loginRateStatus,
  normalizeUsername,
  opaqueHash,
  recordFailedLogin,
  validUsername,
} from "@/lib/auth/security";
import { getDatabase } from "@/lib/database/client";
import { auditLogs, authTokens, sessions, users } from "@/lib/database/schema";
import { clientAddress } from "@/lib/security/rate-limit";
import { sendSecurityEmail } from "@/features/integrations/security-mail";

const pinSchema = z.string().regex(/^\d{6}$/);

function deviceLabel(userAgent: string) {
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Chrome\//.test(userAgent)
      ? "Chrome"
      : /Safari\//.test(userAgent)
        ? "Safari"
        : /Firefox\//.test(userAgent)
          ? "Firefox"
          : "Browser";
  const system = /Windows/.test(userAgent)
    ? "Windows"
    : /Android/.test(userAgent)
      ? "Android"
      : /iPhone|iPad/.test(userAgent)
        ? "iOS"
        : /Mac OS/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "Perangkat";
  return `${browser} · ${system}`;
}

function baseUrl(requestHeaders: Headers) {
  if (process.env.NODE_ENV === "production") return "https://anugrahplastik.com";
  const host = requestHeaders.get("host") || "127.0.0.1:3100";
  return `http://${host}`;
}

function redirectLoginDatabaseFailure(stage: string): never {
  console.error(`[auth] Login database operation failed at ${stage}.`);
  redirect("/admin/login?error=database");
}

export async function login(formData: FormData) {
  const username = normalizeUsername(String(formData.get("username") ?? ""));
  const pin = String(formData.get("pin") ?? "");
  const remembered = formData.get("privateDevice") === "yes";
  if (!validUsername(username) || !pinSchema.safeParse(pin).success) redirect("/admin/login?error=credentials");

  const requestHeaders = await headers();
  const address = clientAddress(requestHeaders);
  const keyHash = authRateKey(username, address);
  let rate: Awaited<ReturnType<typeof loginRateStatus>>;
  try {
    rate = await loginRateStatus(keyHash);
  } catch {
    redirectLoginDatabaseFailure("rate-status");
  }
  if (!rate.allowed) redirect(`/admin/login?error=rate-limit&retry=${Math.max(1, rate.retryAfterSeconds)}`);
  const database = getDatabase();
  if (!database) redirect("/admin/login?error=database");
  let user: typeof users.$inferSelect | undefined;
  try {
    [user] = await database.select().from(users).where(eq(users.username, username)).limit(1);
  } catch {
    redirectLoginDatabaseFailure("user-lookup");
  }
  const authenticated = Boolean(user?.pinHash) && (await compare(pin, user.pinHash!));
  if (!user || !user.isActive || !authenticated) {
    try {
      await recordFailedLogin(keyHash, user?.id);
    } catch {
      redirectLoginDatabaseFailure("failed-attempt");
    }
    redirect("/admin/login?error=credentials");
  }
  try {
    await clearFailedLogin(keyHash);
  } catch {
    redirectLoginDatabaseFailure("rate-clear");
  }
  const location = requestHeaders.get("cf-ipcity") || requestHeaders.get("x-vercel-ip-city") || null;
  try {
    await createSession(
      {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role as SessionUser["role"],
        temporaryPin: user.temporaryPin,
      },
      {
        remembered,
        deviceLabel: deviceLabel(requestHeaders.get("user-agent") || ""),
        locationLabel: location ? decodeURIComponent(location) : undefined,
        ipHash: opaqueHash(`${address}\0${process.env.AUTH_SECRET ?? "local"}`),
      },
    );
  } catch {
    redirectLoginDatabaseFailure("session-create");
  }
  const store = await cookies();
  if (remembered)
    store.set("ap_admin_username", username, {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/admin/login",
      maxAge: 30 * 24 * 60 * 60,
    });
  else store.delete("ap_admin_username");
  redirect("/admin");
}

export async function logout() {
  await clearSession();
  redirect("/admin/login");
}

export async function requestAccessHelp(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const parsed = z.email().max(255).safeParse(email);
  const database = getDatabase();
  const requestHeaders = await headers();
  if (database && parsed.success) {
    try {
      const key = authRateKey(`help:${email}`, clientAddress(requestHeaders));
      const rate = await loginRateStatus(key);
      if (rate.allowed) {
        await recordFailedLogin(key);
        const [user] = await database.select().from(users).where(eq(users.email, email)).limit(1);
        if (user?.isActive) {
          const token = await issueAuthToken(user.id, "reset");
          await sendSecurityEmail({
            to: user.email,
            name: user.name,
            username: user.username,
            purpose: "reset",
            url: `${baseUrl(requestHeaders)}/admin/reset-pin?purpose=reset&token=${encodeURIComponent(token)}`,
          });
        }
      }
    } catch {
      // The public result is intentionally identical for registered addresses,
      // unknown addresses, unavailable mail, and unavailable databases.
    }
  }
  redirect("/admin/forgot-pin?sent=1");
}

export async function setPinFromToken(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const purpose = formData.get("purpose") === "activate" ? "activate" : "reset";
  const pin = String(formData.get("pin") ?? "");
  const confirmation = String(formData.get("pinConfirmation") ?? "");
  if (!pinSchema.safeParse(pin).success || pin !== confirmation)
    redirect(`/admin/reset-pin?purpose=${purpose}&token=${encodeURIComponent(token)}&error=pin`);
  const database = getDatabase();
  if (!database) redirect(`/admin/reset-pin?purpose=${purpose}&token=${encodeURIComponent(token)}&error=database`);
  const now = new Date();
  const tokenHash = opaqueHash(token);
  let success = false;
  try {
    success = await database.transaction(async (tx) => {
      const [record] = await tx
        .select({ id: authTokens.id, userId: authTokens.userId })
        .from(authTokens)
        .where(
          and(
            eq(authTokens.tokenHash, tokenHash),
            eq(authTokens.purpose, purpose),
            gt(authTokens.expiresAt, now),
            isNull(authTokens.usedAt),
          ),
        )
        .limit(1)
        .for("update");
      if (!record) return false;
      await tx
        .update(users)
        .set({ pinHash: await hash(pin, 12), temporaryPin: false, pinChangedAt: now, updatedAt: now })
        .where(eq(users.id, record.userId));
      await tx
        .update(authTokens)
        .set({ usedAt: now })
        .where(and(eq(authTokens.userId, record.userId), isNull(authTokens.usedAt)));
      await tx
        .update(sessions)
        .set({ revokedAt: now })
        .where(and(eq(sessions.userId, record.userId), isNull(sessions.revokedAt)));
      await tx.insert(auditLogs).values({
        actorId: record.userId,
        action: purpose === "activate" ? "auth.pin_activated" : "auth.pin_reset",
        entityType: "user",
        entityId: record.userId,
      });
      return true;
    });
  } catch {
    redirect(`/admin/reset-pin?purpose=${purpose}&token=${encodeURIComponent(token)}&error=database`);
  }
  if (!success) redirect("/admin/reset-pin?error=expired");
  redirect("/admin/login?status=pin-updated");
}

export async function changeOwnPin(formData: FormData) {
  const user = await getSession();
  if (!user) redirect("/admin/login");
  const currentPin = String(formData.get("currentPin") ?? "");
  const pin = String(formData.get("pin") ?? "");
  const confirmation = String(formData.get("pinConfirmation") ?? "");
  if (!pinSchema.safeParse(pin).success || pin !== confirmation) redirect("/admin/profile?error=pin");
  const database = getDatabase();
  if (!database) redirect("/admin/profile?error=database");
  let record: { pinHash: string | null } | undefined;
  try {
    [record] = await database.select({ pinHash: users.pinHash }).from(users).where(eq(users.id, user.id)).limit(1);
  } catch {
    redirect("/admin/profile?error=database");
  }
  if (!record?.pinHash || !(await compare(currentPin, record.pinHash))) redirect("/admin/profile?error=current-pin");
  const now = new Date();
  try {
    await database.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ pinHash: await hash(pin, 12), temporaryPin: false, pinChangedAt: now, updatedAt: now })
        .where(eq(users.id, user.id));
      await tx
        .update(sessions)
        .set({ revokedAt: now })
        .where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt), sql`${sessions.id} <> ${user.sessionId}`));
      await tx.insert(auditLogs).values({
        actorId: user.id,
        action: "auth.pin_changed",
        entityType: "user",
        entityId: user.id,
      });
    });
  } catch {
    redirect("/admin/profile?error=database");
  }
  redirect("/admin/profile?status=pin-updated");
}

export async function revokeOwnSession(formData: FormData) {
  const user = await getSession();
  if (!user) redirect("/admin/login");
  const sessionId = z.uuid().safeParse(String(formData.get("sessionId") ?? ""));
  if (!sessionId.success) return;
  const database = getDatabase();
  if (!database) return;
  await database
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, sessionId.data), eq(sessions.userId, user.id)));
  if (sessionId.data === user.sessionId) {
    await clearSession();
    redirect("/admin/login");
  }
  redirect("/admin/profile?status=session-revoked");
}

export async function revokeAllOtherSessions() {
  const user = await getSession();
  if (!user) redirect("/admin/login");
  await revokeOtherSessions(user.id, user.sessionId);
  redirect("/admin/profile?status=sessions-revoked");
}

export async function revokeEverySession() {
  const user = await getSession();
  if (!user) redirect("/admin/login");
  await revokeOtherSessions(user.id);
  await clearSession();
  redirect("/admin/login");
}

export async function continueCurrentSession() {
  return extendCurrentSession();
}
