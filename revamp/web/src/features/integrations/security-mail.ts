import "server-only";

import nodemailer from "nodemailer";
import { and, eq, inArray } from "drizzle-orm";
import { issueAuthToken } from "@/lib/auth/security";
import { getDatabase } from "@/lib/database/client";
import { auditLogs, users } from "@/lib/database/schema";
import { getMailboxSettings } from "./mail-service";
import { escapeEmailText } from "./email-templates";

export async function sendSecurityEmail(input: {
  to: string;
  name: string;
  username: string;
  url: string;
  purpose: "activate" | "reset" | "cutover";
}) {
  if (process.env.EMAIL_CS_SEND_MODE !== "live") return { sent: false, simulated: true } as const;
  const settings = await getMailboxSettings();
  if (!settings) throw new Error("Email CS belum siap digunakan.");
  const title =
    input.purpose === "activate"
      ? "Aktifkan akun Back Office"
      : input.purpose === "cutover"
        ? "Cara masuk Back Office berubah"
        : "Bantuan masuk Back Office";
  const action =
    input.purpose === "activate" ? "Buat PIN" : input.purpose === "cutover" ? "Buka Back Office" : "Atur ulang PIN";
  const expiry =
    input.purpose === "cutover"
      ? "Gunakan username dan PIN enam digit untuk masuk."
      : "Tautan berlaku 30 menit dan hanya dapat digunakan satu kali.";
  const safeName = escapeEmailText(input.name);
  const safeUsername = escapeEmailText(input.username);
  const safeUrl = escapeEmailText(input.url);
  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.smtpPort,
    secure: settings.smtpPort === 465,
    requireTLS: settings.smtpPort !== 465,
    auth: { user: settings.email, pass: settings.password },
    logger: false,
    debug: false,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  try {
    await transport.sendMail({
      from: { name: "Anugrah Plastik", address: settings.email },
      to: input.to,
      subject: title,
      text: `Halo ${input.name},\n\nUsername Back Office Anda: ${input.username}\n\n${action}: ${input.url}\n\n${expiry} Jika Anda tidak meminta email ini, abaikan pesan ini.`,
      html: `<!doctype html><html lang="id"><body style="margin:0;background:#f4f2f8;color:#282430;font:15px/1.6 Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:28px 16px"><div style="background:#fff;border:1px solid #e5e0ea;border-radius:16px;padding:24px"><p style="margin:0 0 6px;color:#7137c8;font-size:12px;font-weight:700;letter-spacing:.08em">ANUGRAH PLASTIK · BACK OFFICE</p><h1 style="margin:0 0 18px;font-size:22px">${title}</h1><p>Halo ${safeName},</p><p>Username Anda: <strong>${safeUsername}</strong></p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#7137c8;color:#fff;text-decoration:none;font-weight:700">${action}</a></p><p style="color:#6e6876;font-size:13px">${expiry} Jika Anda tidak meminta email ini, abaikan pesan ini.</p></div></div></body></html>`,
    });
    return { sent: true, simulated: false } as const;
  } finally {
    transport.close();
  }
}

export async function sendPendingAuthCutoverNotices(limit = 10) {
  const database = getDatabase();
  if (!database || process.env.EMAIL_CS_SEND_MODE !== "live") return { sent: 0, failed: 0 };
  const required = await database
    .select({ userId: auditLogs.entityId })
    .from(auditLogs)
    .where(and(eq(auditLogs.action, "auth.cutover_notice_required"), eq(auditLogs.entityType, "user")));
  if (!required.length) return { sent: 0, failed: 0 };
  const completed = await database
    .select({ userId: auditLogs.entityId })
    .from(auditLogs)
    .where(and(eq(auditLogs.action, "auth.cutover_notice_sent"), eq(auditLogs.entityType, "user")));
  const completedIds = new Set(completed.map((entry) => entry.userId).filter(Boolean));
  const pendingIds = required
    .map((entry) => entry.userId)
    .filter((id): id is string => Boolean(id) && !completedIds.has(id))
    .slice(0, limit);
  if (!pendingIds.length) return { sent: 0, failed: 0 };
  const recipients = await database
    .select()
    .from(users)
    .where(and(inArray(users.id, pendingIds), eq(users.isActive, true)));
  let sent = 0;
  let failed = 0;
  const origin = (process.env.APP_ORIGIN || "https://anugrahplastik.com").replace(/\/$/, "");
  for (const recipient of recipients) {
    try {
      const purpose = recipient.pinHash ? ("cutover" as const) : ("activate" as const);
      const url =
        purpose === "activate"
          ? `${origin}/admin/reset-pin?purpose=activate&token=${encodeURIComponent(await issueAuthToken(recipient.id, "activate"))}`
          : `${origin}/admin/login`;
      const result = await sendSecurityEmail({
        to: recipient.email,
        name: recipient.name,
        username: recipient.username,
        purpose,
        url,
      });
      if (!result.sent) throw new Error("mail_not_sent");
      await database
        .insert(auditLogs)
        .values({ action: "auth.cutover_notice_sent", entityType: "user", entityId: recipient.id });
      sent += 1;
    } catch {
      await database
        .insert(auditLogs)
        .values({ action: "auth.cutover_notice_failed", entityType: "user", entityId: recipient.id });
      failed += 1;
    }
  }
  return { sent, failed };
}
