import "server-only";
import { and, desc, eq, ilike, isNotNull, lt, or, sql } from "drizzle-orm";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { simpleParser } from "mailparser";
import { mailThreadKey } from "./email-workspace-model";
import { getDatabase } from "@/lib/database/client";
import {
  auditLogs,
  businessTransactions,
  csEmailOutbox,
  csEmails,
  integrations,
  transactionDocuments,
  userNotifications,
} from "@/lib/database/schema";
import { decryptSecret, encryptSecret } from "./secrets";
import { decodeTimeCursor, encodeTimeCursor } from "@/lib/pagination/cursor";
import { getCsMailboxServerConfig } from "./mailbox-config";

export type MailSettings = { email: string; password: string; host: string; imapPort: number; smtpPort: number };
export type MailboxFailureCode =
  "mail_authentication" | "mail_dns_network" | "mail_tls" | "mail_timeout" | "mail_folder" | "mail_unknown";

type MailboxFailure = { code: MailboxFailureCode; message: string };

export class MailboxSyncError extends Error {
  readonly mailboxCode: MailboxFailureCode;

  constructor(failure: MailboxFailure) {
    super(failure.message);
    this.name = "MailboxSyncError";
    this.mailboxCode = failure.code;
  }
}

export function classifyMailboxFailure(error: unknown): MailboxFailure {
  if (error instanceof MailboxSyncError) {
    return { code: error.mailboxCode, message: error.message };
  }

  const detail = [
    error instanceof Error ? error.name : "",
    error instanceof Error ? error.message : "",
    typeof error === "object" && error && "code" in error ? String(error.code ?? "") : "",
  ]
    .join(" ")
    .toLowerCase();
  if (/auth|credential|login|authentication|invalid.?password|eauth/.test(detail))
    return {
      code: "mail_authentication",
      message: "Mailbox menolak kredensial. Periksa kata sandi Email CS lalu uji koneksi kembali.",
    };
  if (/certificate|tls|ssl|self.?signed|wrong version/.test(detail))
    return {
      code: "mail_tls",
      message: "Koneksi aman mailbox tidak dapat diverifikasi. Periksa sertifikat atau pengaturan server email.",
    };
  if (/timeout|timed out|etimedout/.test(detail))
    return {
      code: "mail_timeout",
      message: "Mailbox tidak merespons dalam batas waktu. Password belum dapat diverifikasi.",
    };
  if (/enotfound|eai_again|getaddrinfo|econnrefused|ehostunreach|enetunreach|network|socket/.test(detail))
    return {
      code: "mail_dns_network",
      message: "Server mailbox tidak dapat dijangkau. Periksa DNS, jaringan, atau layanan email.",
    };
  if (/folder|mailbox|inbox|sent/.test(detail))
    return {
      code: "mail_folder",
      message: "Folder mailbox yang diperlukan tidak tersedia. Periksa konfigurasi Inbox dan Sent.",
    };
  return {
    code: "mail_unknown",
    message: "Sinkronisasi Email CS gagal. Layanan mailbox belum dapat diverifikasi.",
  };
}

export async function testMailbox(settings: MailSettings) {
  const imap = new ImapFlow({
    host: settings.host,
    port: settings.imapPort,
    secure: true,
    auth: { user: settings.email, pass: settings.password },
    logger: false,
    connectionTimeout: 10_000,
  });
  const smtp = nodemailer.createTransport({
    host: settings.host,
    port: settings.smtpPort,
    secure: true,
    auth: { user: settings.email, pass: settings.password },
    logger: false,
    debug: false,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  try {
    await imap.connect();
    await imap.logout();
    await smtp.verify();
  } catch (error) {
    throw new MailboxSyncError(classifyMailboxFailure(error));
  } finally {
    try {
      await imap.logout();
    } catch {
      /* best effort close */
    }
    smtp.close();
  }
}

export async function getMailboxSettings() {
  const database = getDatabase();
  if (!database) return null;
  const [row] = await database.select().from(integrations).where(eq(integrations.key, "cs-mail")).limit(1);
  if (!row?.secretCiphertext) return null;
  const stored = decryptSecret<MailSettings>(row.secretCiphertext);
  // Server environment overrides stale hostname/port values encrypted by an
  // earlier deployment. The password itself always remains in the ciphertext.
  return { ...stored, ...getCsMailboxServerConfig() };
}

export async function listEmails(folder: "inbox" | "sent", before?: string, search?: string) {
  const database = getDatabase();
  if (!database) return null;
  const cursor = decodeTimeCursor(before);
  const cursorDate = cursor ? new Date(cursor.createdAt) : null;
  const q = search
    ?.replace(/[\\%_]/g, " ")
    .trim()
    .slice(0, 120);
  if (folder === "sent") {
    const mailboxRows = await database
      .select()
      .from(csEmails)
      .where(
        and(
          eq(csEmails.folder, "sent"),
          q
            ? or(
                ilike(csEmails.subject, `${q}%`),
                ilike(csEmails.fromAddress, `${q}%`),
                ilike(csEmails.toAddress, `${q}%`),
              )
            : undefined,
          cursorDate
            ? or(
                sql`${csEmails.receivedAt} < ${cursorDate}`,
                and(
                  eq(csEmails.receivedAt, cursorDate),
                  sql`concat('mailbox:', ${csEmails.id}::text) < ${cursor?.id ?? ""}`,
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(csEmails.receivedAt), desc(csEmails.id))
      .limit(26);
    const outboxRows = await database
      .select()
      .from(csEmailOutbox)
      .where(
        and(
          q ? or(ilike(csEmailOutbox.subject, `${q}%`), ilike(csEmailOutbox.toAddress, `${q}%`)) : undefined,
          cursorDate
            ? or(
                sql`${csEmailOutbox.sentAt} < ${cursorDate}`,
                and(
                  eq(csEmailOutbox.sentAt, cursorDate),
                  sql`concat('outbox:', ${csEmailOutbox.id}::text) < ${cursor?.id ?? ""}`,
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(csEmailOutbox.sentAt), desc(csEmailOutbox.id))
      .limit(26);
    const items = [
      ...mailboxRows.map((row) => ({ ...row, id: `mailbox:${row.id}`, status: "sent", source: "mailbox" as const })),
      ...outboxRows.map((row) => ({
        ...row,
        id: `outbox:${row.id}`,
        folder: "sent" as const,
        receivedAt: row.sentAt,
        fromAddress: "cs@anugrahplastik.com",
        fromName: "Anugrah Plastik",
        preview: null,
        uid: 0,
        uidValidity: "outbox",
        source: "workspace" as const,
      })),
    ]
      .sort((left, right) => {
        const timeDifference = (right.receivedAt?.getTime() ?? 0) - (left.receivedAt?.getTime() ?? 0);
        return timeDifference || right.id.localeCompare(left.id);
      })
      .slice(0, 26);
    const pageItems = items.slice(0, 25);
    return {
      items: pageItems,
      next:
        items.length > 25 && pageItems.length && pageItems.at(-1)?.receivedAt
          ? encodeTimeCursor({ createdAt: pageItems.at(-1)!.receivedAt!, id: pageItems.at(-1)!.id })
          : null,
    };
  }
  const filters = and(
    eq(csEmails.folder, folder),
    q
      ? or(ilike(csEmails.subject, `${q}%`), ilike(csEmails.fromAddress, `${q}%`), ilike(csEmails.toAddress, `${q}%`))
      : undefined,
    cursorDate
      ? or(
          sql`${csEmails.receivedAt} < ${cursorDate}`,
          and(eq(csEmails.receivedAt, cursorDate), lt(csEmails.id, cursor?.id ?? "")),
        )
      : undefined,
  );
  const rows = await database
    .select()
    .from(csEmails)
    .where(filters)
    .orderBy(desc(csEmails.receivedAt), desc(csEmails.id))
    .limit(26);
  const items = rows.slice(0, 25).map((row) => ({ ...row, status: "received" }));
  return {
    items,
    next:
      rows.length > 25 && items.length && items.at(-1)?.receivedAt
        ? encodeTimeCursor({ createdAt: items.at(-1)!.receivedAt!, id: items.at(-1)!.id })
        : null,
  };
}

export async function syncMailbox() {
  const database = getDatabase();
  if (!database) return { synced: 0, skipped: true };
  return database.transaction(async (tx) => {
    const lock = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext('cs-mail-sync')) as acquired`);
    if (!(lock.rows[0] as { acquired: boolean })?.acquired) return { synced: 0, skipped: true };
    return syncMailboxUnlocked();
  });
}

async function syncMailboxUnlocked() {
  const database = getDatabase();
  const settings = await getMailboxSettings();
  if (!database || !settings) return { synced: 0, skipped: true };
  const client = new ImapFlow({
    host: settings.host,
    port: settings.imapPort,
    secure: true,
    auth: { user: settings.email, pass: settings.password },
    logger: false,
    connectionTimeout: 10_000,
  });
  let synced = 0;
  try {
    await client.connect();
    const boxes = await client.list();
    const inbox = boxes.find((box) => box.path.toUpperCase() === "INBOX");
    const sent = boxes.find((box) => box.specialUse === "\\Sent") ?? boxes.find((box) => /sent/i.test(box.path));
    const [connection] = await database
      .select({ metadata: integrations.metadata })
      .from(integrations)
      .where(eq(integrations.key, "cs-mail"))
      .limit(1);
    const metadata = (connection?.metadata ?? {}) as Record<string, unknown>;
    const cursors = (metadata.mailboxCursors ?? {}) as Record<string, { uidValidity: string; lastUid: number }>;
    for (const [folder, box] of [
      ["inbox", inbox],
      ["sent", sent],
    ] as const) {
      if (!box) continue;
      const lock = await client.getMailboxLock(box.path, { readOnly: true });
      try {
        const mailbox = client.mailbox;
        if (!mailbox) continue;
        const since = new Date();
        since.setDate(since.getDate() - 90);
        const previous = cursors[folder];
        const foundUids =
          previous?.uidValidity === String(mailbox.uidValidity)
            ? await client.search({ uid: `${previous.lastUid + 1}:*` }, { uid: true })
            : await client.search({ since }, { uid: true });
        if (!Array.isArray(foundUids)) continue;
        const uids = foundUids.filter(
          (uid) => previous?.uidValidity !== String(mailbox.uidValidity) || uid > previous.lastUid,
        );
        if (!uids.length) continue;
        const uidValidity = String(mailbox?.uidValidity ?? "unknown");
        for (let offset = 0; offset < uids.length; offset += 200) {
          const batch = uids.slice(offset, offset + 200);
          for await (const message of client.fetch(
            batch.join(","),
            { uid: true, envelope: true, internalDate: true, size: true, headers: ["references", "reply-to", "cc"] },
            { uid: true },
          )) {
            const address = message.envelope?.from?.[0];
            const header = message.headers ? await simpleParser(message.headers) : null;
            const references = Array.isArray(header?.references)
              ? header.references.join(" ")
              : (header?.references ?? null);
            const rootKey = mailThreadKey(
              message.envelope?.messageId ?? null,
              message.envelope?.inReplyTo ?? null,
              references,
            );
            const to =
              message.envelope?.to
                ?.map((item) => item.address)
                .filter(Boolean)
                .join(", ") ?? null;
            const inserted = await database
              .insert(csEmails)
              .values({
                folder,
                uidValidity,
                uid: message.uid,
                size: message.size ?? 0,
                messageId: message.envelope?.messageId ?? null,
                inReplyTo: message.envelope?.inReplyTo ?? null,
                references,
                replyToAddress:
                  header?.replyTo?.value
                    .map((item) => item.address)
                    .filter(Boolean)
                    .join(", ") ?? null,
                ccAddress: Array.isArray(header?.cc)
                  ? header.cc
                      .flatMap((item) => item.value)
                      .map((item) => item.address)
                      .filter(Boolean)
                      .join(", ")
                  : (header?.cc?.value
                      .map((item) => item.address)
                      .filter(Boolean)
                      .join(", ") ?? null),
                threadKey: rootKey,
                fromName: address?.name?.slice(0, 255) ?? null,
                fromAddress: address?.address?.slice(0, 255) ?? null,
                toAddress: to?.slice(0, 1000) ?? null,
                subject: (message.envelope?.subject || "(tanpa subjek)").slice(0, 998),
                receivedAt: message.internalDate
                  ? new Date(String(message.internalDate))
                  : message.envelope?.date
                    ? new Date(String(message.envelope.date))
                    : null,
              })
              .onConflictDoNothing()
              .returning({ id: csEmails.id });
            if (inserted[0] && folder === "inbox" && rootKey) {
              const isBounce =
                /^(mailer-daemon|postmaster)@/i.test(address?.address ?? "") ||
                /(delivery status notification|mail delivery failed|undeliver|returned mail|failure notice)/i.test(
                  message.envelope?.subject ?? "",
                );
              const matches = await database
                .select({
                  id: csEmailOutbox.id,
                  transactionId: csEmailOutbox.linkedTransactionId,
                  sentBy: csEmailOutbox.sentBy,
                })
                .from(csEmailOutbox)
                .where(and(eq(csEmailOutbox.messageId, rootKey), isNotNull(csEmailOutbox.linkedTransactionId)))
                .limit(2);
              if (matches.length === 1 && matches[0].transactionId) {
                const transactionId = matches[0].transactionId;
                await database.transaction(async (tx) => {
                  await tx
                    .update(csEmails)
                    .set({ linkedTransactionId: transactionId })
                    .where(eq(csEmails.id, inserted[0].id));
                  if (isBounce) {
                    await tx
                      .update(csEmailOutbox)
                      .set({ status: "bounced" })
                      .where(eq(csEmailOutbox.id, matches[0].id));
                    await tx
                      .update(transactionDocuments)
                      .set({
                        payload: sql`coalesce(${transactionDocuments.payload}, '{}'::jsonb) || '{"lastEmailState":"bounced"}'::jsonb`,
                      })
                      .where(eq(transactionDocuments.sentMessageId, rootKey));
                    const [transaction] = await tx
                      .select({ ownerId: businessTransactions.ownerId })
                      .from(businessTransactions)
                      .where(eq(businessTransactions.id, transactionId))
                      .limit(1);
                    const recipients = new Set(
                      [matches[0].sentBy, transaction?.ownerId].filter((id): id is string => Boolean(id)),
                    );
                    if (recipients.size)
                      await tx.insert(userNotifications).values(
                        [...recipients].map((userId) => ({
                          userId,
                          kind: "email_bounce",
                          title: "Email gagal diterima",
                          body: "Periksa alamat penerima lalu kirim ulang dokumen bila sudah diperbaiki.",
                          href: `/admin/transactions/${transactionId}`,
                        })),
                      );
                  }
                  await tx.insert(auditLogs).values({
                    action: isBounce ? "transaction.email_bounced" : "transaction.email_reply_linked",
                    entityType: "transaction",
                    entityId: transactionId,
                    metadata: { emailId: inserted[0].id, method: "message_id" },
                  });
                });
              }
            }
            synced += inserted.length;
          }
        }
        const nextCursor = {
          uidValidity,
          lastUid: uids.reduce(
            (highest, uid) => Math.max(highest, uid),
            previous?.uidValidity === uidValidity ? previous.lastUid : 0,
          ),
        };
        await database
          .update(integrations)
          .set({
            metadata: sql`jsonb_set(jsonb_set(coalesce(${integrations.metadata}, '{}'::jsonb), '{mailboxCursors}', coalesce(${integrations.metadata}->'mailboxCursors', '{}'::jsonb)), ${`{mailboxCursors,${folder}}`}::text[], ${JSON.stringify(nextCursor)}::jsonb)`,
          })
          .where(eq(integrations.key, "cs-mail"));
      } finally {
        lock.release();
      }
    }
    await client.logout();
    await database
      .update(integrations)
      .set({
        lastSyncAt: new Date(),
        lastError: null,
        metadata: sql`coalesce(${integrations.metadata}, '{}'::jsonb) - 'mailLastErrorCode'`,
      })
      .where(and(eq(integrations.key, "cs-mail"), isNotNull(integrations.secretCiphertext)));
    return { synced, skipped: false };
  } catch (error) {
    try {
      await client.logout();
    } catch {
      /* best effort close */
    }
    const failure = classifyMailboxFailure(error);
    await database
      .update(integrations)
      .set({
        lastError: failure.message,
        metadata: sql`jsonb_set(coalesce(${integrations.metadata}, '{}'::jsonb), '{mailLastErrorCode}', ${JSON.stringify(failure.code)}::jsonb)`,
      })
      .where(and(eq(integrations.key, "cs-mail"), isNotNull(integrations.secretCiphertext)));
    throw new MailboxSyncError(failure);
  }
}

export async function getEmailRecord(id: string) {
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return null;
  const database = getDatabase();
  if (!database) return null;
  const [row] = await database.select().from(csEmails).where(eq(csEmails.id, id)).limit(1);
  return row ?? null;
}

export async function getOutboxRecord(id: string) {
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return null;
  const database = getDatabase();
  if (!database) return null;
  const [row] = await database.select().from(csEmailOutbox).where(eq(csEmailOutbox.id, id)).limit(1);
  return row ?? null;
}

export async function fetchEmailBody(folder: "inbox" | "sent", uid: number, uidValidity: string) {
  const database = getDatabase();
  if (!database) throw new Error("Database belum tersedia.");
  const [email] = await database
    .select({ id: csEmails.id, size: csEmails.size, bodyCiphertext: csEmails.bodyCiphertext })
    .from(csEmails)
    .where(and(eq(csEmails.folder, folder), eq(csEmails.uid, uid), eq(csEmails.uidValidity, uidValidity)))
    .limit(1);
  if (email?.bodyCiphertext) {
    const cached = decryptSecret<{ source: string }>(email.bodyCiphertext);
    return Buffer.from(cached.source, "base64");
  }
  if (!email || email.size > 25 * 1024 * 1024) throw new Error("Email tidak tersedia atau melebihi batas 25 MB.");

  const settings = await getMailboxSettings();
  if (!settings) throw new Error("Email CS belum tersambung.");
  const client = new ImapFlow({
    host: settings.host,
    port: settings.imapPort,
    secure: true,
    auth: { user: settings.email, pass: settings.password },
    logger: false,
    connectionTimeout: 10_000,
  });
  try {
    await client.connect();
    const boxes = await client.list();
    const box =
      folder === "inbox"
        ? boxes.find((item) => item.path.toUpperCase() === "INBOX")
        : (boxes.find((item) => item.specialUse === "\\Sent") ?? boxes.find((item) => /sent/i.test(item.path)));
    if (!box) throw new Error("Folder email tidak ditemukan.");
    const lock = await client.getMailboxLock(box.path, { readOnly: true });
    try {
      if (!client.mailbox || String(client.mailbox.uidValidity) !== uidValidity)
        throw new Error("Email sudah berubah di server. Segarkan daftar email.");
      const maxBytes = 25 * 1024 * 1024;
      const downloaded = await client.download(String(uid), undefined, {
        uid: true,
        maxBytes: maxBytes + 1,
        chunkSize: 64 * 1024,
      });
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of downloaded.content) {
        const bytes = Buffer.from(chunk);
        size += bytes.length;
        if (size > maxBytes) {
          downloaded.content.destroy();
          throw new Error("Email melebihi batas 25 MB.");
        }
        chunks.push(bytes);
      }
      const source = size ? Buffer.concat(chunks, size) : null;
      if (source && email && source.byteLength <= maxBytes) {
        await database
          .update(csEmails)
          .set({ bodyCiphertext: encryptSecret({ source: source.toString("base64") }) })
          .where(eq(csEmails.id, email.id));
      }
      return source;
    } finally {
      lock.release();
    }
  } catch (error) {
    // A single cached/deleted message can fail independently of the mailbox connection.
    // Do not mark the whole Email CS integration unhealthy from this on-demand action.
    // Keep a specific message such as a changed UID for the person opening it.
    if (error instanceof Error) {
      throw error;
    }

    throw new Error("Isi email belum dapat diambil. Muat ulang atau coba lagi setelah layanan mailbox pulih.");
  } finally {
    try {
      await client.logout();
    } catch {
      /* best effort close */
    }
  }
}
