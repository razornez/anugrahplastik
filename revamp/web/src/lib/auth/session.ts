import { and, eq, gt, isNull } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getDatabase } from "@/lib/database/client";
import { sessions, users } from "@/lib/database/schema";

const cookieName = "anugrahplastik_session";
const encoder = new TextEncoder();
const sessionLifetimeSeconds = 8 * 60 * 60;

export type Role = "admin" | "content" | "sales";
export type SessionUser = { id: string; name: string; email: string; role: Role };

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

export async function createSession(user: SessionUser) {
  const secret = getSecret();
  const database = getDatabase();
  if (!secret || !database) throw new Error("Sesi belum dapat dibuat.");

  const expiresAt = new Date(Date.now() + sessionLifetimeSeconds * 1_000);
  const [session] = await database
    .insert(sessions)
    .values({ userId: user.id, expiresAt })
    .returning({ id: sessions.id });

  const token = await new SignJWT({ email: user.email, name: user.name, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setJti(session.id)
    .setIssuedAt()
    .setExpirationTime(`${sessionLifetimeSeconds}s`)
    .sign(secret);

  (await cookies()).set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sessionLifetimeSeconds,
  });
}

export async function getSession(): Promise<SessionUser | null> {
  const token = await readToken();
  const database = getDatabase();
  if (!token || !database) return null;

  const [record] = await database
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.id, token.sessionId),
        eq(users.id, String(token.payload.sub)),
        eq(users.isActive, true),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    );

  if (!record || !["admin", "content", "sales"].includes(record.role)) return null;
  return { ...record, role: record.role as Role };
}

export async function clearSession() {
  const token = await readToken();
  const database = getDatabase();
  if (token && database) {
    await database.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, token.sessionId));
  }
  (await cookies()).delete(cookieName);
}
