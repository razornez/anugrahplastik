import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getDatabase } from "@/lib/database/client";
import { sessions, users } from "@/lib/database/schema";

const cookieName = "anugrahplastik_session";
const encoder = new TextEncoder();
const idleLifetimeSeconds = 8 * 60 * 60;
const standardAbsoluteSeconds = 24 * 60 * 60;
const rememberedLifetimeSeconds = 30 * 24 * 60 * 60;

export type Role = "admin" | "content" | "sales";
export type SessionUser = {
  id: string;
  sessionId: string;
  username: string;
  name: string;
  email: string;
  role: Role;
  temporaryPin: boolean;
  sessionExpiresAt: Date;
  absoluteExpiresAt: Date;
  remembered: boolean;
};

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  return secret ? encoder.encode(secret) : null;
}

async function readToken() {
  const secret = getSecret();
  const token = (await cookies()).get(cookieName)?.value;
  if (!secret || !token) return null;

  try {
    const { payload } = await jwtVerify(token, secret);
    if (!payload.sub || !payload.jti) return null;
    return { payload, sessionId: payload.jti };
  } catch {
    return null;
  }
}

export async function createSession(
  user: Pick<SessionUser, "id" | "username" | "name" | "email" | "role"> & { temporaryPin?: boolean },
  options: { remembered?: boolean; deviceLabel?: string; locationLabel?: string; ipHash?: string } = {},
) {
  const secret = getSecret();
  const database = getDatabase();
  if (!secret || !database) throw new Error("Sesi belum dapat dibuat.");

  const remembered = Boolean(options.remembered);
  const absoluteSeconds = remembered ? rememberedLifetimeSeconds : standardAbsoluteSeconds;
  const absoluteExpiresAt = new Date(Date.now() + absoluteSeconds * 1_000);
  const expiresAt = remembered ? absoluteExpiresAt : new Date(Date.now() + idleLifetimeSeconds * 1_000);
  const [session] = await database
    .insert(sessions)
    .values({
      userId: user.id,
      expiresAt,
      absoluteExpiresAt,
      remembered,
      deviceLabel: options.deviceLabel,
      locationLabel: options.locationLabel,
      ipHash: options.ipHash,
    })
    .returning({ id: sessions.id });

  const token = await new SignJWT({ username: user.username, email: user.email, name: user.name, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setJti(session.id)
    .setIssuedAt()
    .setExpirationTime(`${absoluteSeconds}s`)
    .sign(secret);

  (await cookies()).set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: absoluteSeconds,
    priority: "high",
  });
}

export async function getSession(): Promise<SessionUser | null> {
  const token = await readToken();
  const database = getDatabase();
  if (!token || !database) return null;

  const now = new Date();
  let record:
    | {
        id: string;
        username: string;
        name: string;
        email: string;
        role: string;
        temporaryPin: boolean;
        remembered: boolean;
        expiresAt: Date;
        absoluteExpiresAt: Date;
        lastActiveAt: Date;
      }
    | undefined;
  try {
    [record] = await database
      .select({
        id: users.id,
        username: users.username,
        name: users.name,
        email: users.email,
        role: users.role,
        temporaryPin: users.temporaryPin,
        remembered: sessions.remembered,
        expiresAt: sessions.expiresAt,
        absoluteExpiresAt: sessions.absoluteExpiresAt,
        lastActiveAt: sessions.lastActiveAt,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.id, token.sessionId),
          eq(users.id, String(token.payload.sub)),
          eq(users.isActive, true),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, now),
          gt(sessions.absoluteExpiresAt, now),
        ),
      );
  } catch {
    // Authentication must fail closed when the session store is unavailable.
    return null;
  }

  if (!record || !["admin", "content", "sales"].includes(record.role)) return null;
  let sessionExpiresAt = record.expiresAt;
  if (!record.remembered && record.lastActiveAt.getTime() < now.getTime() - 5 * 60 * 1_000) {
    const nextExpiry = new Date(
      Math.min(record.absoluteExpiresAt.getTime(), now.getTime() + idleLifetimeSeconds * 1_000),
    );
    try {
      await database
        .update(sessions)
        .set({ lastActiveAt: now, expiresAt: nextExpiry })
        .where(
          and(eq(sessions.id, token.sessionId), lt(sessions.lastActiveAt, new Date(now.getTime() - 5 * 60 * 1_000))),
        );
      sessionExpiresAt = nextExpiry;
    } catch {
      // The verified session remains valid until its previously stored expiry.
    }
  }
  return {
    id: record.id,
    sessionId: token.sessionId,
    username: record.username,
    name: record.name,
    email: record.email,
    role: record.role as Role,
    temporaryPin: record.temporaryPin,
    sessionExpiresAt,
    absoluteExpiresAt: record.absoluteExpiresAt,
    remembered: record.remembered,
  };
}

export async function extendCurrentSession() {
  const user = await getSession();
  const database = getDatabase();
  if (!user || !database) return null;
  if (user.remembered) return { expiresAt: user.absoluteExpiresAt.toISOString() };
  const now = new Date();
  const expiresAt = new Date(Math.min(user.absoluteExpiresAt.getTime(), now.getTime() + idleLifetimeSeconds * 1_000));
  try {
    await database
      .update(sessions)
      .set({ lastActiveAt: now, expiresAt })
      .where(and(eq(sessions.id, user.sessionId), isNull(sessions.revokedAt)));
  } catch {
    return null;
  }
  return { expiresAt: expiresAt.toISOString() };
}

export async function revokeOtherSessions(userId: string, currentSessionId?: string) {
  const database = getDatabase();
  if (!database) return;
  await database
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      currentSessionId
        ? and(eq(sessions.userId, userId), isNull(sessions.revokedAt), sql`${sessions.id} <> ${currentSessionId}`)
        : and(eq(sessions.userId, userId), isNull(sessions.revokedAt)),
    );
}

export async function clearSession() {
  const token = await readToken();
  const database = getDatabase();
  if (token && database) {
    try {
      await database.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, token.sessionId));
    } catch {
      // Always clear the browser cookie even if the session store is unavailable.
    }
  }
  (await cookies()).delete(cookieName);
}
