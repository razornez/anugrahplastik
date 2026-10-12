"use server";

import { createHash, randomBytes } from "node:crypto";
import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { auditLogs, remoteDesktopLaunchTickets, users } from "@/lib/database/schema";
import { clientAddress, takeRateLimit } from "@/lib/security/rate-limit";
import { getRemoteDesktopConfiguration } from "./service";

export type RemoteDesktopLaunchState = { error: string | null; downloadUrl: string | null };

export async function authorizeRemoteDesktopLaunch(
  _previous: RemoteDesktopLaunchState,
  formData: FormData,
): Promise<RemoteDesktopLaunchState> {
  const user = await getSession();
  const configuration = getRemoteDesktopConfiguration();
  const password = String(formData.get("password") ?? "");
  const database = getDatabase();
  if (!user || user.role !== "admin")
    return { error: "Akses Remote Desktop hanya untuk administrator.", downloadUrl: null };
  if (configuration.status !== "configured")
    return { error: "Komputer rumah belum dikonfigurasi pada server.", downloadUrl: null };
  if (!database) return { error: "Database belum tersedia. Coba lagi.", downloadUrl: null };
  if (!takeRateLimit(`remote-desktop:${user.id}:${clientAddress(await headers())}`, 5, 15 * 60 * 1_000).allowed)
    return { error: "Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.", downloadUrl: null };
  if (!password) return { error: "Masukkan kata sandi Anda untuk melanjutkan.", downloadUrl: null };

  const [record] = await database.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id));
  if (!record || !(await compare(password, record.passwordHash))) {
    await database.insert(auditLogs).values({
      actorId: user.id,
      action: "remote_desktop.reauth_failed",
      entityType: "remote_desktop",
      entityId: "home-workstation",
    });
    return { error: "Kata sandi tidak cocok.", downloadUrl: null };
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 2 * 60 * 1_000);
  await database.transaction(async (transaction) => {
    await transaction.insert(remoteDesktopLaunchTickets).values({ actorId: user.id, tokenHash, expiresAt });
    await transaction.insert(auditLogs).values({
      actorId: user.id,
      action: "remote_desktop.launch_authorized",
      entityType: "remote_desktop",
      entityId: "home-workstation",
      metadata: { expiresAt: expiresAt.toISOString(), source: "admin" },
    });
  });
  return { error: null, downloadUrl: `/api/admin/remote-desktop/launch?ticket=${encodeURIComponent(token)}` };
}
