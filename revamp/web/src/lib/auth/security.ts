import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { getDatabase } from "@/lib/database/client";
import { authRateLimits, authTokens } from "@/lib/database/schema";

const LOGIN_WINDOW_MS = 15 * 60 * 1_000;
const LOGIN_LOCK_MS = 30 * 60 * 1_000;
const MAX_LOGIN_ATTEMPTS = 5;

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function validUsername(value: string) {
  return /^[a-z0-9](?:[a-z0-9.]{1,22}[a-z0-9])?$/.test(value) && !value.includes("..");
}

export function weakPinReason(pin: string) {
  if (/^(\d)\1{5}$/.test(pin)) return "PIN menggunakan angka yang sama berulang kali.";
  if (["012345", "123456", "234567", "345678", "456789", "987654", "876543", "765432", "654321"].includes(pin))
    return "PIN menggunakan urutan angka yang mudah ditebak.";
  return null;
}

export function opaqueHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function newAuthToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: opaqueHash(token) };
}

export async function issueAuthToken(userId: string, purpose: "activate" | "reset") {
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  const created = newAuthToken();
  const now = new Date();
  await database.transaction(async (tx) => {
    await tx
      .update(authTokens)
      .set({ usedAt: now })
      .where(and(eq(authTokens.userId, userId), eq(authTokens.purpose, purpose), isNull(authTokens.usedAt)));
    await tx.insert(authTokens).values({
      userId,
      purpose,
      tokenHash: created.tokenHash,
      expiresAt: new Date(now.getTime() + 30 * 60 * 1_000),
    });
  });
  return created.token;
}

export function authRateKey(username: string, address: string) {
  return opaqueHash(`${normalizeUsername(username)}\0${address}\0${process.env.AUTH_SECRET ?? "local"}`);
}

export async function loginRateStatus(keyHash: string) {
  const database = getDatabase();
  if (!database) return { allowed: false, retryAfterSeconds: 60 };
  const [entry] = await database.select().from(authRateLimits).where(eq(authRateLimits.keyHash, keyHash)).limit(1);
  const now = Date.now();
  if (!entry) return { allowed: true, retryAfterSeconds: 0 };
  if (entry.lockedUntil && entry.lockedUntil.getTime() > now)
    return { allowed: false, retryAfterSeconds: Math.ceil((entry.lockedUntil.getTime() - now) / 1_000) };
  if (entry.windowStartedAt.getTime() + LOGIN_WINDOW_MS <= now) {
    await database.delete(authRateLimits).where(eq(authRateLimits.keyHash, keyHash));
    return { allowed: true, retryAfterSeconds: 0 };
  }
  return { allowed: entry.attempts < MAX_LOGIN_ATTEMPTS, retryAfterSeconds: 0 };
}

export async function recordFailedLogin(keyHash: string, userId?: string) {
  const database = getDatabase();
  if (!database) return;
  const now = new Date();
  const windowCutoff = new Date(now.getTime() - LOGIN_WINDOW_MS);
  await database
    .insert(authRateLimits)
    .values({ keyHash, userId, attempts: 1, windowStartedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: authRateLimits.keyHash,
      set: {
        userId: sql`coalesce(${authRateLimits.userId}, ${userId ?? null})`,
        attempts: sql`case when ${authRateLimits.windowStartedAt} < ${windowCutoff} then 1 else ${authRateLimits.attempts} + 1 end`,
        windowStartedAt: sql`case when ${authRateLimits.windowStartedAt} < ${windowCutoff} then ${now} else ${authRateLimits.windowStartedAt} end`,
        lockedUntil: sql`case when (case when ${authRateLimits.windowStartedAt} < ${windowCutoff} then 1 else ${authRateLimits.attempts} + 1 end) >= ${MAX_LOGIN_ATTEMPTS} then ${new Date(now.getTime() + LOGIN_LOCK_MS)}::timestamptz else null::timestamptz end`,
        updatedAt: now,
      },
    });
}

export async function clearFailedLogin(keyHash: string) {
  const database = getDatabase();
  if (!database) return;
  await database.delete(authRateLimits).where(eq(authRateLimits.keyHash, keyHash));
}

export async function consumeAuthToken(rawToken: string, purpose: "activate" | "reset") {
  const database = getDatabase();
  if (!database) return null;
  const now = new Date();
  return database.transaction(async (tx) => {
    const [record] = await tx
      .select({ id: authTokens.id, userId: authTokens.userId })
      .from(authTokens)
      .where(
        and(
          eq(authTokens.tokenHash, opaqueHash(rawToken)),
          eq(authTokens.purpose, purpose),
          gt(authTokens.expiresAt, now),
          isNull(authTokens.usedAt),
        ),
      )
      .limit(1)
      .for("update");
    if (!record) return null;
    await tx.update(authTokens).set({ usedAt: now }).where(eq(authTokens.id, record.id));
    return record;
  });
}

export async function removeExpiredAuthState() {
  const database = getDatabase();
  if (!database) return;
  const now = new Date();
  await Promise.all([
    database.delete(authTokens).where(lt(authTokens.expiresAt, now)),
    database
      .delete(authRateLimits)
      .where(
        and(
          lt(authRateLimits.updatedAt, new Date(now.getTime() - 24 * 60 * 60 * 1_000)),
          or(isNull(authRateLimits.lockedUntil), lt(authRateLimits.lockedUntil, now)),
        ),
      ),
  ]);
}
