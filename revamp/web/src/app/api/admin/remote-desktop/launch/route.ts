import { createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { auditLogs, remoteDesktopLaunchTickets } from "@/lib/database/schema";
import { createRemoteDesktopProfile, getRemoteDesktopConfiguration } from "@/features/remote-desktop/service";

export async function GET(request: Request) {
  const user = await getSession();
  const configuration = getRemoteDesktopConfiguration();
  const token = new URL(request.url).searchParams.get("ticket") ?? "";
  const database = getDatabase();
  if (
    !user ||
    user.role !== "admin" ||
    !database ||
    configuration.status !== "configured" ||
    !/^[A-Za-z0-9_-]{43}$/.test(token)
  )
    return Response.json({ error: "Permintaan Remote Desktop tidak valid." }, { status: 403 });

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [ticket] = await database
    .update(remoteDesktopLaunchTickets)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(remoteDesktopLaunchTickets.tokenHash, tokenHash),
        eq(remoteDesktopLaunchTickets.actorId, user.id),
        isNull(remoteDesktopLaunchTickets.usedAt),
        gt(remoteDesktopLaunchTickets.expiresAt, new Date()),
      ),
    )
    .returning({ id: remoteDesktopLaunchTickets.id });
  if (!ticket)
    return Response.json({ error: "Tautan akses sudah tidak berlaku. Ulangi verifikasi kata sandi." }, { status: 403 });

  await database.insert(auditLogs).values({
    actorId: user.id,
    action: "remote_desktop.rdp_downloaded",
    entityType: "remote_desktop",
    entityId: "home-workstation",
    metadata: { ticketId: ticket.id },
  });
  return new Response(createRemoteDesktopProfile(configuration), {
    headers: {
      "content-type": "application/x-rdp; charset=utf-8",
      "content-disposition": 'attachment; filename="komputer-rumah.rdp"',
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
    },
  });
}
