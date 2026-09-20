import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const cookieName = "anugrahplastik_session";
const encoder = new TextEncoder();

export type Role = "admin" | "content" | "sales";
export type SessionUser = { id: string; name: string; email: string; role: Role };

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  return secret ? encoder.encode(secret) : null;
}

export async function createSession(user: SessionUser) {
  const secret = getSecret();
  if (!secret) throw new Error("AUTH_SECRET belum dikonfigurasi.");

  const token = await new SignJWT(user)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret);

  const store = await cookies();
  store.set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 28800,
  });
}

export async function getSession(): Promise<SessionUser | null> {
  const secret = getSecret();
  const store = await cookies();
  const token = store.get(cookieName)?.value;
  if (!secret || !token) return null;

  try {
    const { payload } = await jwtVerify(token, secret);
    if (!payload.sub || !payload.email || !payload.name || !payload.role) return null;
    return { id: payload.sub, email: String(payload.email), name: String(payload.name), role: payload.role as Role };
  } catch {
    return null;
  }
}

export async function clearSession() {
  const store = await cookies();
  store.delete(cookieName);
}
