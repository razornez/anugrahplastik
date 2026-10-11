import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { and, eq, isNull, desc, sql } from "drizzle-orm";
import { z } from "zod";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import nodemailer from "nodemailer";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { decodeTimeCursor, encodeTimeCursor } from "@/lib/pagination/cursor";
import {
  csEmailDrafts,
  csEmailDraftFiles,
  csEmailOutbox,
  auditLogs,
  transactionDocuments,
} from "@/lib/database/schema";
import { encryptSecret, decryptSecret } from "./secrets";
import {
  buildTemplatedEmail,
  getActiveTemplate,
  validateEmailDoc,
  type EmailNode,
  type EmailShellConfig,
} from "./email-templates";
import { getEmailRecord, getMailboxSettings } from "./mail-service";
import { validateDocumentEmailSource, type DocumentEmailSource } from "./document-email-source";
import {
  maxUploadBytes,
  parseRecipients,
  safelyFailedBeforeAcceptance,
  type EmailRecipients,
} from "./email-workspace-model";

export type DraftPayload = {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  content: EmailNode;
  replyToId?: string;
  layout: EmailNode;
  shellConfig: EmailShellConfig;
  templateVersion: number;
  originalSubject: string;
  documentSource?: DocumentEmailSource;
};
export type DraftView = {
  id: string;
  status: string;
  ownerId: string;
  revision: number;
  updatedAt: string;
  payload: DraftPayload;
  files: { id: string; filename: string; contentType: string; size: number }[];
};
type Snapshot = {
  recipients: EmailRecipients;
  subject: string;
  from: string;
  html: string;
  text: string;
  attachments: { filename: string; contentType: string; content: string; cid?: string; sha256: string }[];
  inReplyTo?: string;
  references?: string[];
  documentSource?: DocumentEmailSource;
};

async function context() {
  const user = await getSession();
  if (!user || !["admin", "sales"].includes(user.role)) throw new Error("Akses Email CS ditolak.");
  const database = getDatabase();
  if (!database) throw new Error("Database belum tersedia.");
  return { user, database };
}
async function accessibleDraft(id: string) {
  z.uuid().parse(id);
  const { user, database } = await context();
  const [row] = await database.select().from(csEmailDrafts).where(eq(csEmailDrafts.id, id)).limit(1);
  if (!row || (row.ownerId !== user.id && user.role !== "admin"))
    throw new Error("Draf tidak ditemukan atau akses ditolak.");
  return { user, database, row };
}

export async function readDraft(id: string): Promise<DraftView> {
  const { database, row } = await accessibleDraft(id);
  const files = await database
    .select({
      id: csEmailDraftFiles.id,
      filename: csEmailDraftFiles.filename,
      contentType: csEmailDraftFiles.contentType,
      size: csEmailDraftFiles.size,
    })
    .from(csEmailDraftFiles)
    .where(and(eq(csEmailDraftFiles.draftId, id), isNull(csEmailDraftFiles.removedAt)))
    .orderBy(csEmailDraftFiles.createdAt, csEmailDraftFiles.id);
  return {
    id: row.id,
    status: row.status,
    ownerId: row.ownerId,
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString(),
    payload: decryptSecret<DraftPayload>(row.payloadCiphertext),
    files,
  };
}
export async function listDrafts(before?: string) {
  const { database, user } = await context();
  const cursor = decodeTimeCursor(before);
  const rows = await database
    .select()
    .from(csEmailDrafts)
    .where(
      and(
        eq(csEmailDrafts.status, "draft"),
        user.role === "admin" ? undefined : eq(csEmailDrafts.ownerId, user.id),
        cursor
          ? sql`(${csEmailDrafts.updatedAt}<${new Date(cursor.createdAt)} or (${csEmailDrafts.updatedAt}=${new Date(cursor.createdAt)} and ${csEmailDrafts.id}<${cursor.id}))`
          : undefined,
      ),
    )
    .orderBy(desc(csEmailDrafts.updatedAt), desc(csEmailDrafts.id))
    .limit(26);
  const items = rows.slice(0, 25).map((row) => {
    const payload = decryptSecret<DraftPayload>(row.payloadCiphertext);
    return {
      id: row.id,
      subject: payload.subject || "(tanpa subjek)",
      to: payload.to,
      updatedAt: row.updatedAt.toISOString(),
      ownerId: row.ownerId,
    };
  });
  const last = rows.slice(0, 25).at(-1);
  return {
    items,
    next: rows.length > 25 && last ? encodeTimeCursor({ createdAt: last.updatedAt, id: last.id }) : null,
  };
}
export async function createDraft(
  payload: Omit<DraftPayload, "layout" | "shellConfig" | "templateVersion">,
  version: number,
) {
  const { user, database } = await context();
  z.object({
    to: z.string().max(5500),
    cc: z.string().max(5500),
    bcc: z.string().max(5500),
    subject: z
      .string()
      .max(998)
      .refine((value) => !/[\r\n]/.test(value)),
    originalSubject: z.string().max(998),
    replyToId: z.uuid().optional(),
  }).parse(payload);
  payload = { ...payload, content: validateEmailDoc(payload.content, payload.replyToId ? "reply" : "new") };
  const layout = await getActiveTemplate("layout");
  const row = await database.transaction(async (tx) => {
    const [created] = await tx
      .insert(csEmailDrafts)
      .values({
        ownerId: user.id,
        updatedAt: new Date(),
        payloadCiphertext: encryptSecret({
          ...payload,
          layout: layout.content,
          shellConfig: layout.shellConfig,
          templateVersion: version,
        }),
      })
      .returning({ id: csEmailDrafts.id });
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "email_workspace.draft_created",
      entityType: "email_draft",
      entityId: created.id,
    });
    return created;
  });
  return readDraft(row.id);
}

export async function copyDraft(id: string, input: Pick<DraftPayload, "to" | "cc" | "bcc" | "subject" | "content">) {
  const { database, user, row } = await accessibleDraft(id);
  const parsed = z
    .object({
      to: z.string().max(5500),
      cc: z.string().max(5500),
      bcc: z.string().max(5500),
      subject: z
        .string()
        .max(998)
        .refine((value) => !/[\r\n]/.test(value)),
      content: z.unknown(),
    })
    .parse(input);
  const old = decryptSecret<DraftPayload>(row.payloadCiphertext);
  const payload = { ...old, ...parsed, content: validateEmailDoc(parsed.content, old.replyToId ? "reply" : "new") };
  const copyId = await database.transaction(async (tx) => {
    await tx.execute(sql`select id from cs_email_drafts where id = ${id} for update`);
    const files = await tx
      .select()
      .from(csEmailDraftFiles)
      .where(and(eq(csEmailDraftFiles.draftId, id), isNull(csEmailDraftFiles.removedAt)));
    for (const file of files) {
      const bytes = Buffer.from(decryptSecret<{ source: string }>(file.contentCiphertext).source, "base64");
      if (createHash("sha256").update(bytes).digest("hex") !== file.sha256)
        throw new Error("Checksum lampiran tidak sesuai; draf baru tidak dibuat.");
    }
    const [copy] = await tx
      .insert(csEmailDrafts)
      .values({ ownerId: user.id, payloadCiphertext: encryptSecret(payload), updatedAt: new Date() })
      .returning({ id: csEmailDrafts.id });
    if (files.length)
      await tx.insert(csEmailDraftFiles).values(
        files.map((file) => ({
          draftId: copy.id,
          filename: file.filename,
          contentType: file.contentType,
          size: file.size,
          sha256: file.sha256,
          contentCiphertext: file.contentCiphertext,
          createdAt: file.createdAt,
        })),
      );
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "email_workspace.draft_copied",
      entityType: "email_draft",
      entityId: copy.id,
      metadata: { sourceDraftId: id },
    });
    return copy.id;
  });
  return readDraft(copyId);
}
export async function saveDraft(
  id: string,
  revision: number,
  input: Pick<DraftPayload, "to" | "cc" | "bcc" | "subject" | "content">,
) {
  const { database, row, user } = await accessibleDraft(id);
  if (row.status !== "draft") throw new Error("Draf sudah diproses; buat pesan baru bila diperlukan.");
  const parsed = z
    .object({
      to: z.string().max(5500),
      cc: z.string().max(5500),
      bcc: z.string().max(5500),
      subject: z
        .string()
        .max(998)
        .refine((value) => !/[\r\n]/.test(value)),
      content: z.unknown(),
    })
    .parse(input);
  const old = decryptSecret<DraftPayload>(row.payloadCiphertext);
  const payload = { ...old, ...parsed, content: validateEmailDoc(parsed.content, old.replyToId ? "reply" : "new") };
  const result = await database.transaction(async (tx) => {
    const [pending] = await tx
      .select({ id: csEmailOutbox.id })
      .from(csEmailOutbox)
      .where(
        and(
          eq(csEmailOutbox.draftId, id),
          sql`${csEmailOutbox.status} in ('pending','uncertain','sent','partial','simulated')`,
        ),
      )
      .limit(1);
    if (pending) throw new Error("Pengiriman draf ini telah diproses. Jangan kirim ulang.");
    const [updated] = await tx
      .update(csEmailDrafts)
      .set({ payloadCiphertext: encryptSecret(payload), revision: revision + 1, updatedAt: new Date() })
      .where(and(eq(csEmailDrafts.id, id), eq(csEmailDrafts.revision, revision), eq(csEmailDrafts.status, "draft")))
      .returning({ revision: csEmailDrafts.revision });
    if (!updated)
      throw new Error(
        "Draf berubah di tab lain. Isi Anda tetap ada; muat versi terbaru atau simpan sebagai draf baru.",
      );
    await tx
      .update(csEmailOutbox)
      .set({ status: "stale" })
      .where(and(eq(csEmailOutbox.draftId, id), eq(csEmailOutbox.status, "prepared")));
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "email_workspace.draft_saved",
      entityType: "email_draft",
      entityId: id,
      metadata: { revision: updated.revision },
    });
    return updated.revision;
  });
  return { revision: result };
}

export async function uploadDraftFile(id: string, revision: number, filename: string, bytes: Buffer) {
  const { database, user } = await accessibleDraft(id);
  if (!bytes.length || bytes.length > maxUploadBytes) throw new Error("Ukuran berkas harus 1 byte sampai 10 MB.");
  const name = filename.replace(/[\r\n"\\/\x00-\x1f]/g, "_").slice(0, 180);
  let contentType: string;
  if (bytes.subarray(0, 5).toString() === "%PDF-") {
    await PDFDocument.load(bytes);
    contentType = "application/pdf";
  } else {
    const metadata = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
    const types: Record<string, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
    contentType = types[metadata.format ?? ""];
    if (!contentType || (metadata.pages ?? 1) > 1) throw new Error("Gunakan PDF, JPG, PNG, atau WebP yang valid.");
    await sharp(bytes, { limitInputPixels: 40_000_000 }).stats();
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const [document] = await database
    .select({ id: transactionDocuments.id })
    .from(transactionDocuments)
    .where(eq(transactionDocuments.checksum, sha256))
    .limit(1);
  if (document) throw new Error("Dokumen transaksi harus dikirim melalui tindakan dokumen di halaman Transaksi.");
  await database.transaction(async (tx) => {
    const [draft] = await tx
      .update(csEmailDrafts)
      .set({ revision: revision + 1, updatedAt: new Date() })
      .where(and(eq(csEmailDrafts.id, id), eq(csEmailDrafts.revision, revision), eq(csEmailDrafts.status, "draft")))
      .returning({ id: csEmailDrafts.id });
    if (!draft) throw new Error("Draf berubah; simpan atau muat versi terbaru sebelum unggah.");
    const files = await tx
      .select({ size: csEmailDraftFiles.size })
      .from(csEmailDraftFiles)
      .where(and(eq(csEmailDraftFiles.draftId, id), isNull(csEmailDraftFiles.removedAt)));
    if (files.length >= 5 || files.reduce((sum, file) => sum + file.size, bytes.length) > maxUploadBytes)
      throw new Error("Maksimal lima lampiran dengan total 10 MB.");
    await tx.insert(csEmailDraftFiles).values({
      draftId: id,
      createdAt: new Date(),
      filename: name,
      contentType,
      size: bytes.length,
      sha256,
      contentCiphertext: encryptSecret({ source: bytes.toString("base64") }),
    });
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "email_workspace.file_added",
      entityType: "email_draft",
      entityId: id,
      metadata: { revision: revision + 1, checksum: sha256, size: bytes.length },
    });
    await tx
      .update(csEmailOutbox)
      .set({ status: "stale" })
      .where(and(eq(csEmailOutbox.draftId, id), eq(csEmailOutbox.status, "prepared")));
  });
  return readDraft(id);
}

export async function prepareDraft(id: string, revision: number) {
  const { database, user, row } = await accessibleDraft(id);
  if (row.status !== "draft" || row.revision !== revision)
    throw new Error("Draf berubah. Simpan lalu periksa kembali.");
  const payload = decryptSecret<DraftPayload>(row.payloadCiphertext);
  const hasMessage = (node: EmailNode): boolean =>
    Boolean(node.text?.trim() || node.type === "image" || node.content?.some(hasMessage));
  if (!hasMessage(payload.content)) throw new Error("Isi pesan sebelum membuat pratinjau.");
  const recipients = parseRecipients(payload);
  if (!payload.subject.trim() || /[\r\n]/.test(payload.subject) || payload.subject.length > 998)
    throw new Error("Subjek wajib diisi tanpa baris baru, maksimal 998 karakter.");
  const settings = await getMailboxSettings();
  if (!settings) throw new Error("Koneksi Email CS belum disiapkan.");
  const source = payload.replyToId ? await getEmailRecord(payload.replyToId) : null;
  if (payload.replyToId && (!source || source.folder !== "inbox"))
    throw new Error("Pesan asal balasan tidak tersedia.");
  const formatted = await buildTemplatedEmail(
    payload.content,
    { senderName: user.name, originalSubject: payload.originalSubject },
    source ? "reply" : "new",
    payload.layout,
    payload.shellConfig,
  );
  if (!formatted.text.trim() || /{{[^}]+}}/.test(formatted.text + formatted.html + payload.subject))
    throw new Error("Lengkapi pesan dan variabel sebelum mengirim.");
  const files = await database
    .select()
    .from(csEmailDraftFiles)
    .where(and(eq(csEmailDraftFiles.draftId, id), isNull(csEmailDraftFiles.removedAt)));
  files.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  const attachments: Snapshot["attachments"] = files.map((file) => {
    const content = decryptSecret<{ source: string }>(file.contentCiphertext).source;
    if (createHash("sha256").update(Buffer.from(content, "base64")).digest("hex") !== file.sha256)
      throw new Error("Checksum lampiran berubah. Unggah ulang berkas yang benar.");
    return { filename: file.filename, contentType: file.contentType, content, sha256: file.sha256 };
  });
  let documentInfo: { number: string | null; type: string; version: number } | undefined;
  if (payload.documentSource) {
    const document = await validateDocumentEmailSource(database, payload.documentSource, recipients, payload.subject);
    documentInfo = { number: document.documentNo, type: document.type, version: payload.documentSource.version };
    attachments.unshift({
      filename: document.filename,
      contentType: "application/pdf",
      content: document.bytes.toString("base64"),
      sha256: payload.documentSource.checksum,
    });
  }
  formatted.attachments.forEach((file) =>
    attachments.push({
      filename: file.filename ?? "gambar-template.jpg",
      contentType: "image/jpeg",
      cid: file.cid,
      content: file.content.toString("base64"),
      sha256: createHash("sha256").update(file.content).digest("hex"),
    }),
  );
  if (
    attachments.filter((file) => !file.cid).length > 5 ||
    attachments.reduce((sum, file) => sum + Buffer.from(file.content, "base64").length, 0) > maxUploadBytes ||
    Buffer.byteLength(formatted.html + formatted.text) +
      attachments.reduce((sum, file) => sum + file.content.length, 0) >
      25 * 1024 * 1024
  )
    throw new Error("Ukuran pesan dan gambar template melebihi batas.");
  const snapshot: Snapshot = {
    recipients,
    subject: payload.subject,
    from: settings.email,
    html: formatted.html,
    text: formatted.text,
    attachments,
    documentSource: payload.documentSource,
    ...(source?.messageId
      ? {
          inReplyTo: source.messageId,
          references: [...(source.references?.match(/<[^<>\s]+>/g) ?? []), source.messageId].slice(-50),
        }
      : {}),
  };
  const attemptId = await database.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`email-draft-${id}`}))`);
    const [fresh] = await tx.select().from(csEmailDrafts).where(eq(csEmailDrafts.id, id)).limit(1);
    if (!fresh || fresh.revision !== revision || fresh.status !== "draft")
      throw new Error("Draf berubah. Periksa kembali.");
    const [existing] = await tx
      .select({ id: csEmailOutbox.id })
      .from(csEmailOutbox)
      .where(
        and(
          eq(csEmailOutbox.draftId, id),
          eq(csEmailOutbox.draftRevision, revision),
          sql`${csEmailOutbox.status} in ('pending','uncertain','sent','partial','simulated')`,
        ),
      )
      .limit(1);
    if (existing) throw new Error("Pengiriman sudah diproses; periksa status, jangan kirim ulang.");
    await tx
      .update(csEmailOutbox)
      .set({ status: "stale" })
      .where(and(eq(csEmailOutbox.draftId, id), eq(csEmailOutbox.status, "prepared")));
    const [attempt] = await tx
      .insert(csEmailOutbox)
      .values({
        draftId: id,
        draftRevision: revision,
        preparedBy: user.id,
        preparedAt: new Date(),
        snapshotCiphertext: encryptSecret(snapshot),
        bodyCiphertext: encryptSecret({ body: formatted.text }),
        htmlCiphertext: encryptSecret({ html: formatted.html }),
        toAddress: recipients.to.join(", "),
        subject: payload.subject,
        idempotencyKey: randomUUID(),
        status: "prepared",
        sentBy: user.id,
        linkedEmailId: source?.id,
        linkedTransactionId: payload.documentSource?.transactionId,
        inReplyTo: source?.messageId,
      })
      .returning({ id: csEmailOutbox.id });
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "email_workspace.preview_prepared",
      entityType: "email",
      entityId: attempt.id,
      metadata: { draftId: id, revision },
    });
    return attempt.id;
  });
  const preview = snapshot.attachments.reduce(
    (html, file) =>
      file.cid ? html.replaceAll(`cid:${file.cid}`, `data:${file.contentType};base64,${file.content}`) : html,
    snapshot.html,
  );
  return {
    attemptId,
    simulation: process.env.EMAIL_CS_SEND_MODE !== "live",
    html: preview,
    text: snapshot.text,
    recipients,
    from: snapshot.from,
    subject: snapshot.subject,
    files: attachments.map((file) => ({ filename: file.filename, size: Buffer.from(file.content, "base64").length })),
    documentInfo,
  };
}

export async function sendPreparedDraft(attemptId: string) {
  z.uuid().parse(attemptId);
  const { database, user } = await context();
  const [attempt] = await database.select().from(csEmailOutbox).where(eq(csEmailOutbox.id, attemptId)).limit(1);
  if (!attempt?.draftId || attempt.preparedBy !== user.id || !attempt.snapshotCiphertext)
    throw new Error("Pratinjau tidak tersedia untuk pengguna ini.");
  await accessibleDraft(attempt.draftId);
  const snapshot = decryptSecret<Snapshot>(attempt.snapshotCiphertext);
  if (
    snapshot.documentSource &&
    (snapshot.attachments[0]?.sha256 !== snapshot.documentSource.checksum ||
      snapshot.attachments[0]?.contentType !== "application/pdf")
  )
    throw new Error("Lampiran wajib tidak cocok dengan dokumen transaksi.");
  for (const file of snapshot.attachments) {
    if (createHash("sha256").update(Buffer.from(file.content, "base64")).digest("hex") !== file.sha256)
      throw new Error("Checksum lampiran pratinjau tidak sesuai. Pengiriman dihentikan.");
  }
  const simulate = process.env.EMAIL_CS_SEND_MODE !== "live";
  if (simulate && process.env.NODE_ENV === "production")
    throw new Error("Pengiriman Email CS belum diaktifkan administrator server.");
  if (!simulate && process.env.NODE_ENV !== "production") {
    const allowed = (process.env.EMAIL_CS_TEST_RECIPIENTS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (
      ![...snapshot.recipients.to, ...snapshot.recipients.cc, ...snapshot.recipients.bcc].every((value) =>
        allowed.includes(value.toLowerCase()),
      )
    )
      throw new Error("Uji lokal hanya boleh dikirim ke alamat uji privat pada konfigurasi.");
  }
  const settings = simulate ? null : await getMailboxSettings();
  if (!simulate && (!settings || settings.email !== snapshot.from))
    throw new Error("Konfigurasi pengirim berubah. Buat pratinjau baru.");
  const started = await database.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`email-draft-${attempt.draftId}`}))`);
    if (snapshot.documentSource) {
      await tx.execute(
        sql`select id from business_transactions where id = ${snapshot.documentSource.transactionId} for update`,
      );
      await validateDocumentEmailSource(tx, snapshot.documentSource, snapshot.recipients, snapshot.subject);
      await tx
        .update(transactionDocuments)
        .set({
          payload: sql`coalesce(${transactionDocuments.payload}, '{}'::jsonb) || ${JSON.stringify({ sendState: "pending", lastEmailState: "pending", lastEmailAttemptId: attemptId })}::jsonb`,
        })
        .where(eq(transactionDocuments.id, snapshot.documentSource.documentId));
    }
    const [draft] = await tx.select().from(csEmailDrafts).where(eq(csEmailDrafts.id, attempt.draftId!)).limit(1);
    if (
      !draft ||
      draft.status !== "draft" ||
      draft.revision !== attempt.draftRevision ||
      !attempt.preparedAt ||
      Date.now() - attempt.preparedAt.getTime() > 10 * 60 * 1000
    )
      throw new Error("Pratinjau kedaluwarsa atau draf berubah. Periksa kembali.");
    const [claimed] = await tx
      .update(csEmailOutbox)
      .set({ status: "pending", startedAt: new Date() })
      .where(and(eq(csEmailOutbox.id, attemptId), eq(csEmailOutbox.status, "prepared")))
      .returning({ id: csEmailOutbox.id });
    if (!claimed) throw new Error("Permintaan sudah diproses. Periksa Terkirim sebelum mencoba lagi.");
    await tx.update(csEmailDrafts).set({ status: "processing" }).where(eq(csEmailDrafts.id, draft.id));
    return claimed;
  });
  let status = simulate ? "simulated" : "uncertain";
  let messageId: string | undefined;
  let results: { accepted: string[]; rejected: string[] } = { accepted: [], rejected: [] };
  if (!simulate && settings) {
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
      dnsTimeout: 10_000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    try {
      const result = await transport.sendMail({
        from: { name: "Anugrah Plastik", address: snapshot.from },
        to: snapshot.recipients.to,
        cc: snapshot.recipients.cc,
        bcc: snapshot.recipients.bcc,
        subject: snapshot.subject,
        text: snapshot.text,
        html: snapshot.html,
        messageId: `<${attemptId}@anugrahplastik.com>`,
        inReplyTo: snapshot.inReplyTo,
        references: snapshot.references,
        attachments: snapshot.attachments.map((file) => ({
          filename: file.filename,
          content: Buffer.from(file.content, "base64"),
          contentType: file.contentType,
          cid: file.cid,
        })),
      });
      messageId = result.messageId;
      const address = (value: string | { address: string }) => (typeof value === "string" ? value : value.address);
      results = { accepted: result.accepted.map(address), rejected: result.rejected.map(address) };
      status = results.accepted.length ? (results.rejected.length ? "partial" : "sent") : "failed";
    } catch (error) {
      status = safelyFailedBeforeAcceptance(error) ? "failed" : "uncertain";
    } finally {
      transport.close();
    }
  }
  // A persistence failure after SMTP acceptance must never be classified as retryable SMTP failure.
  await database.transaction(async (tx) => {
    if (snapshot.documentSource) {
      // Failed before acceptance and simulation do not mark the document as sent.
      const state = status === "failed" || status === "simulated" ? null : status;
      await tx
        .update(transactionDocuments)
        .set({
          sentMessageId: status === "sent" || status === "partial" ? messageId : undefined,
          recipient: status === "sent" || status === "partial" ? snapshot.recipients.to[0] : undefined,
          payload: state
            ? sql`coalesce(${transactionDocuments.payload}, '{}'::jsonb) || ${JSON.stringify({ sendState: state, lastEmailState: status, lastEmailAttemptId: attemptId })}::jsonb`
            : sql`(coalesce(${transactionDocuments.payload}, '{}'::jsonb) - 'sendState') || ${JSON.stringify({ lastEmailState: status, lastEmailAttemptId: attemptId })}::jsonb`,
        })
        .where(eq(transactionDocuments.id, snapshot.documentSource.documentId));
    }
    await tx
      .update(csEmailOutbox)
      .set({ status, messageId, resultCiphertext: encryptSecret(results) })
      .where(eq(csEmailOutbox.id, started.id));
    await tx
      .update(csEmailDrafts)
      .set({ status: status === "failed" ? "draft" : "processed" })
      .where(eq(csEmailDrafts.id, attempt.draftId!));
    await tx
      .insert(auditLogs)
      .values({ actorId: user.id, action: `email_workspace.${status}`, entityType: "email", entityId: started.id });
  });
  return { status, attemptId };
}

export async function removeDraftFile(id: string, revision: number, fileId: string) {
  z.uuid().parse(fileId);
  const { database, user } = await accessibleDraft(id);
  await database.transaction(async (tx) => {
    const [draft] = await tx
      .update(csEmailDrafts)
      .set({ revision: revision + 1, updatedAt: new Date() })
      .where(and(eq(csEmailDrafts.id, id), eq(csEmailDrafts.revision, revision), eq(csEmailDrafts.status, "draft")))
      .returning({ id: csEmailDrafts.id });
    if (!draft) throw new Error("Draf berubah. Muat versi terbaru sebelum menghapus lampiran.");
    const [file] = await tx
      .update(csEmailDraftFiles)
      .set({ removedAt: new Date() })
      .where(
        and(eq(csEmailDraftFiles.id, fileId), eq(csEmailDraftFiles.draftId, id), isNull(csEmailDraftFiles.removedAt)),
      )
      .returning({ id: csEmailDraftFiles.id });
    if (!file) throw new Error("Lampiran tidak ditemukan.");
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "email_workspace.file_removed",
      entityType: "email_draft",
      entityId: id,
      metadata: { fileId, revision: revision + 1 },
    });
    await tx
      .update(csEmailOutbox)
      .set({ status: "stale" })
      .where(and(eq(csEmailOutbox.draftId, id), eq(csEmailOutbox.status, "prepared")));
  });
  return readDraft(id);
}

export async function downloadDraftFile(id: string, fileId: string) {
  z.uuid().parse(fileId);
  const { database } = await accessibleDraft(id);
  const [file] = await database
    .select()
    .from(csEmailDraftFiles)
    .where(
      and(eq(csEmailDraftFiles.id, fileId), eq(csEmailDraftFiles.draftId, id), isNull(csEmailDraftFiles.removedAt)),
    )
    .limit(1);
  if (!file) throw new Error("Lampiran tidak ditemukan.");
  const bytes = Buffer.from(decryptSecret<{ source: string }>(file.contentCiphertext).source, "base64");
  if (createHash("sha256").update(bytes).digest("hex") !== file.sha256)
    throw new Error("Checksum lampiran tidak sesuai.");
  return { bytes, filename: file.filename, contentType: file.contentType };
}

export async function retryRejectedRecipients(attemptId: string) {
  z.uuid().parse(attemptId);
  const { user, database } = await context();
  const [attempt] = await database.select().from(csEmailOutbox).where(eq(csEmailOutbox.id, attemptId)).limit(1);
  if (
    !attempt?.draftId ||
    attempt.status !== "partial" ||
    !attempt.resultCiphertext ||
    !attempt.snapshotCiphertext ||
    (attempt.sentBy !== user.id && user.role !== "admin")
  )
    throw new Error("Draf ulang hanya tersedia untuk penerima yang pasti ditolak.");
  const original = await readDraft(attempt.draftId);
  const result = decryptSecret<{ rejected: string[] }>(attempt.resultCiphertext);
  const snapshot = decryptSecret<Snapshot>(attempt.snapshotCiphertext);
  const rejected = new Set(result.rejected.map((value) => value.toLowerCase()));
  const pick = (values: string[]) => values.filter((value) => rejected.has(value.toLowerCase())).join(", ");
  const recipients = {
    to: pick(snapshot.recipients.to),
    cc: pick(snapshot.recipients.cc),
    bcc: pick(snapshot.recipients.bcc),
  };
  // Do not promote a private BCC address to To; a missing To must be reviewed manually.
  return copyDraft(original.id, { ...original.payload, ...recipients });
}

export async function downloadOutboxFile(attemptId: string, index: number) {
  z.uuid().parse(attemptId);
  z.number().int().min(0).max(4).parse(index);
  const { user, database } = await context();
  const [attempt] = await database.select().from(csEmailOutbox).where(eq(csEmailOutbox.id, attemptId)).limit(1);
  if (
    !attempt?.snapshotCiphertext ||
    ["prepared", "stale"].includes(attempt.status) ||
    (attempt.sentBy !== user.id && user.role !== "admin")
  )
    throw new Error("Lampiran tidak tersedia atau akses ditolak.");
  const snapshot = decryptSecret<Snapshot>(attempt.snapshotCiphertext);
  const file = snapshot.attachments.filter((item) => !item.cid)[index];
  if (!file) throw new Error("Lampiran tidak ditemukan.");
  const bytes = Buffer.from(file.content, "base64");
  if (createHash("sha256").update(bytes).digest("hex") !== file.sha256)
    throw new Error("Checksum lampiran tidak sesuai.");
  return { bytes, filename: file.filename, contentType: file.contentType };
}
