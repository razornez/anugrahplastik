import "server-only";
import { and, desc, eq, ilike, isNotNull, lt, or, sql } from "drizzle-orm";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { getDatabase } from "@/lib/database/client";
import { csEmailOutbox, csEmails, integrations } from "@/lib/database/schema";
import { decryptSecret, encryptSecret } from "./secrets";
import { decodeTimeCursor, encodeTimeCursor } from "@/lib/pagination/cursor";

export type MailSettings = { email: string; password: string; host: string; imapPort: number; smtpPort: number };

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
  } catch {
    throw new Error("Koneksi email belum berhasil. Periksa kata sandi mailbox atau hubungi administrator domain.");
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
  return decryptSecret<MailSettings>(row.secretCiphertext);
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
        const uids =
          previous?.uidValidity === String(mailbox.uidValidity)
            ? await client.search({ uid: `${previous.lastUid + 1}:*` }, { uid: true })
            : await client.search({ since }, { uid: true });
        if (!Array.isArray(uids) || !uids.length) continue;
        const uidValidity = String(mailbox?.uidValidity ?? "unknown");
        for (let offset = 0; offset < uids.length; offset += 200) {
          const batch = uids.slice(offset, offset + 200);
          for await (const message of client.fetch(
            batch.join(","),
            { uid: true, envelope: true, internalDate: true, size: true },
            { uid: true },
          )) {
            const address = message.envelope?.from?.[0];
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
            synced += inserted.length;
          }
        }
        const nextCursors = {
          ...cursors,
          [folder]: {
            uidValidity,
            lastUid: Math.max(previous?.uidValidity === uidValidity ? previous.lastUid : 0, ...uids),
          },
        };
        await database
          .update(integrations)
          .set({ metadata: { ...metadata, mailboxCursors: nextCursors } })
          .where(eq(integrations.key, "cs-mail"));
      } finally {
        lock.release();
      }
    }
    await client.logout();
    await database
      .update(integrations)
      .set({ lastSyncAt: new Date(), lastError: null })
      .where(and(eq(integrations.key, "cs-mail"), isNotNull(integrations.secretCiphertext)));
    return { synced, skipped: false };
  } catch (error) {
    try {
      await client.logout();
    } catch {
      /* best effort close */
    }
    await database
      .update(integrations)
      .set({ lastError: "Sinkronisasi email gagal. Periksa layanan email atau kata sandi mailbox." })
      .where(and(eq(integrations.key, "cs-mail"), isNotNull(integrations.secretCiphertext)));
    throw error;
  }
}

export async function getEmailRecord(id: string) {
  const database = getDatabase();
  if (!database) return null;
  const [row] = await database.select().from(csEmails).where(eq(csEmails.id, id)).limit(1);
  return row ?? null;
}

export async function getOutboxRecord(id: string) {
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
      let source: Buffer | null = null;
      for await (const message of client.fetch(String(uid), { uid: true, source: true }, { uid: true })) {
        source = message.source ?? null;
      }
      if (source && email && source.byteLength <= 2 * 1024 * 1024) {
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
    await database
      .update(integrations)
      .set({
        lastError:
          "Isi email belum dapat diambil dari mailbox. Periksa koneksi email atau buka lagi setelah layanan pulih.",
      })
      .where(and(eq(integrations.key, "cs-mail"), isNotNull(integrations.secretCiphertext)));
    throw error;
  } finally {
    try {
      await client.logout();
    } catch {
      /* best effort close */
    }
  }
}
