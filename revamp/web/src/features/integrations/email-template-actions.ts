"use server";

import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import sharp from "sharp";
import nodemailer from "nodemailer";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import {
  auditLogs,
  businessTransactions,
  customers,
  emailTemplateAttachments,
  emailTemplateMedia,
  emailTemplates,
  emailTemplateVersions,
} from "@/lib/database/schema";
import { preparePrivateDestination, removePrivateFile, safeOriginalName } from "@/features/operations/private-storage";
import { scanBytes } from "@/features/security/malware-scanner";
import {
  buildBrandedEmailDocument,
  buildTemplatedEmail,
  defaultTemplate,
  templateKeys,
  templateLabels,
  validateEmailDoc,
  type TemplateKey,
} from "./email-templates";
import { parseEmailShellConfig, validateEmailShellConfig } from "./email-template-shell";
import { getMailboxSettings } from "./mail-service";
import { republishActiveDocumentTemplates } from "@/features/operations/document-templates";

async function requireAdmin() {
  const user = await getSession();
  if (!user || user.role !== "admin") throw new Error("Hanya administrator yang dapat mengubah template email.");
  return user;
}

const templateAttachmentLimit = 15 * 1024 * 1024;
const transactionTemplateKeys: TemplateKey[] = ["quotation", "invoice", "delivery", "handover"];

export type TemplateAttachmentState = { ok?: boolean; error?: string };

export async function uploadEmailTemplateAttachment(
  _state: TemplateAttachmentState,
  formData: FormData,
): Promise<TemplateAttachmentState> {
  const user = await requireAdmin();
  const templateId = z.string().uuid().safeParse(formData.get("templateId"));
  const file = formData.get("file");
  if (!templateId.success || !(file instanceof File) || file.size < 1 || file.size > templateAttachmentLimit)
    return { error: "Pilih satu file berukuran maksimal 15 MB." };
  const database = getDatabase();
  if (!database) return { error: "Database belum terhubung." };
  const [template] = await database
    .select({ key: emailTemplates.templateKey })
    .from(emailTemplates)
    .where(and(eq(emailTemplates.id, templateId.data), eq(emailTemplates.isArchived, false)))
    .limit(1);
  if (!template || !transactionTemplateKeys.includes(template.key as TemplateKey))
    return { error: "Lampiran tetap hanya tersedia untuk template dokumen transaksi." };
  const current = await database
    .select({ size: emailTemplateAttachments.size })
    .from(emailTemplateAttachments)
    .where(eq(emailTemplateAttachments.templateId, templateId.data));
  if (current.length >= 4 || current.reduce((total, item) => total + item.size, file.size) > templateAttachmentLimit)
    return { error: "Maksimal empat lampiran tetap dengan total 15 MB." };
  const bytes = Buffer.from(await file.arrayBuffer());
  const scan = await scanBytes(bytes);
  if (scan.status === "malware") return { error: "File ditolak karena terdeteksi berbahaya." };
  const filename = safeOriginalName(file.name);
  const now = new Date();
  const relativePath = join(
    "email-template-attachments",
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    randomUUID(),
  );
  await writeFile(await preparePrivateDestination(relativePath), bytes, { flag: "wx", mode: 0o600 });
  try {
    const [saved] = await database
      .insert(emailTemplateAttachments)
      .values({
        templateId: templateId.data,
        storagePath: relativePath,
        filename,
        mimeType: file.type.slice(0, 160) || "application/octet-stream",
        size: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        scanStatus: scan.status,
        scanDetail: scan.detail,
        uploadedBy: user.id,
      })
      .returning({ id: emailTemplateAttachments.id });
    await database.insert(auditLogs).values({
      actorId: user.id,
      action: "email_template.attachment_added",
      entityType: "email_template_attachment",
      entityId: saved.id,
      metadata: { templateId: templateId.data, filename, size: bytes.length, scanStatus: scan.status },
    });
  } catch (error) {
    await removePrivateFile(relativePath);
    throw error;
  }
  revalidatePath("/admin/settings/email-templates");
  return { ok: true };
}

export async function removeEmailTemplateAttachment(formData: FormData) {
  const user = await requireAdmin();
  const id = z.string().uuid().safeParse(formData.get("attachmentId"));
  if (!id.success) return;
  const database = getDatabase();
  if (!database) return;
  const [removed] = await database.transaction(async (tx) => {
    const rows = await tx.delete(emailTemplateAttachments).where(eq(emailTemplateAttachments.id, id.data)).returning({
      storagePath: emailTemplateAttachments.storagePath,
      templateId: emailTemplateAttachments.templateId,
    });
    if (rows[0])
      await tx.insert(auditLogs).values({
        actorId: user.id,
        action: "email_template.attachment_removed",
        entityType: "email_template_attachment",
        entityId: id.data,
        metadata: { templateId: rows[0].templateId },
      });
    return rows;
  });
  if (removed) await removePrivateFile(removed.storagePath);
  revalidatePath("/admin/settings/email-templates");
}

export async function saveEmailTemplate(formData: FormData) {
  const user = await requireAdmin();
  const key = String(formData.get("key") ?? "") as TemplateKey;
  if (!templateKeys.includes(key)) throw new Error("Jenis template tidak valid.");
  const subject = z
    .string()
    .max(998)
    .parse(String(formData.get("subject") ?? "").trim());
  if (key !== "layout" && !subject) throw new Error("Subjek tidak boleh kosong.");
  const subjectTokens =
    key === "new"
      ? ["senderName"]
      : key === "reply"
        ? ["senderName", "originalSubject"]
        : key === "layout"
          ? []
          : ["customerName", "transactionNo", "documentName", "senderName"];
  if (
    /[\r\n]/.test(subject) ||
    [...subject.matchAll(/{{([^{}]+)}}/g)].some((match) => !subjectTokens.includes(match[1])) ||
    /{{|}}/.test(subject.replace(/{{([^{}]+)}}/g, ""))
  )
    throw new Error("Subjek mengandung variabel atau baris baru yang tidak diizinkan.");
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("content") ?? ""));
  } catch {
    throw new Error("Isi template tidak valid.");
  }
  const content = validateEmailDoc(raw, key);
  let shellConfig: ReturnType<typeof parseEmailShellConfig> | null = null;
  if (key === "layout") {
    try {
      shellConfig = validateEmailShellConfig(JSON.parse(String(formData.get("shellConfig") ?? "")));
    } catch {
      throw new Error("Tampilan email tidak valid. Muat ulang halaman lalu coba lagi.");
    }
  }
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  const requestedTemplateId = z
    .string()
    .uuid()
    .safeParse(String(formData.get("templateId") ?? ""));
  const [catalog] = requestedTemplateId.success
    ? await database
        .select()
        .from(emailTemplates)
        .where(
          and(
            eq(emailTemplates.id, requestedTemplateId.data),
            eq(emailTemplates.templateKey, key),
            eq(emailTemplates.isArchived, false),
          ),
        )
        .limit(1)
    : await database
        .select()
        .from(emailTemplates)
        .where(
          and(
            eq(emailTemplates.templateKey, key),
            eq(emailTemplates.language, "id"),
            eq(emailTemplates.isDefault, true),
            eq(emailTemplates.isArchived, false),
          ),
        )
        .limit(1);
  if (!catalog) throw new Error("Katalog template belum tersedia. Jalankan migrasi database lalu muat ulang.");
  const activation = await database.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`email-template-${catalog.id}`}))`);
    const [previous] = await tx
      .select()
      .from(emailTemplateVersions)
      .where(eq(emailTemplateVersions.templateId, catalog.id))
      .orderBy(desc(emailTemplateVersions.version))
      .limit(1);
    const [saved] = await tx
      .insert(emailTemplateVersions)
      .values({
        templateId: catalog.id,
        templateKey: key,
        version: (previous?.version ?? 0) + 1,
        subject,
        content,
        shellConfig,
        createdBy: user.id,
      })
      .returning({ id: emailTemplateVersions.id, version: emailTemplateVersions.version });
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "email_template.activated",
      entityType: "email_template",
      entityId: saved.id,
      metadata: { key, templateId: catalog.id, version: saved.version, previousVersion: previous?.version ?? 0 },
    });
    return { previous, saved };
  });
  if (key === "layout") {
    try {
      await republishActiveDocumentTemplates(user.id);
    } catch (error) {
      if (activation.previous) {
        await database.transaction(async (tx) => {
          await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`email-template-${catalog.id}`}))`);
          const [latest] = await tx
            .select({ id: emailTemplateVersions.id, version: emailTemplateVersions.version })
            .from(emailTemplateVersions)
            .where(eq(emailTemplateVersions.templateId, catalog.id))
            .orderBy(desc(emailTemplateVersions.version))
            .limit(1);
          if (latest?.id === activation.saved.id) {
            await tx.insert(emailTemplateVersions).values({
              templateId: catalog.id,
              templateKey: key,
              version: latest.version + 1,
              subject: activation.previous.subject,
              content: activation.previous.content,
              shellConfig: activation.previous.shellConfig,
              createdBy: user.id,
              restoredFromId: activation.previous.id,
            });
          }
        });
      }
      throw error;
    }
  }
  revalidatePath("/admin/settings/email-templates");
  revalidatePath("/admin/email");
}

export async function restoreEmailTemplate(formData: FormData) {
  const user = await requireAdmin();
  const id = z
    .string()
    .uuid()
    .parse(String(formData.get("versionId") ?? ""));
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  await database.transaction(async (tx) => {
    const [source] = await tx.select().from(emailTemplateVersions).where(eq(emailTemplateVersions.id, id)).limit(1);
    if (!source || !templateKeys.includes(source.templateKey as TemplateKey)) throw new Error("Versi tidak ditemukan.");
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`email-template-${source.templateId}`}))`);
    const [current] = await tx
      .select()
      .from(emailTemplateVersions)
      .where(eq(emailTemplateVersions.templateId, source.templateId))
      .orderBy(desc(emailTemplateVersions.version))
      .limit(1);
    const [saved] = await tx
      .insert(emailTemplateVersions)
      .values({
        templateId: source.templateId,
        templateKey: source.templateKey,
        version: (current?.version ?? 0) + 1,
        subject: source.subject,
        content: source.content,
        shellConfig: source.shellConfig,
        createdBy: user.id,
        restoredFromId: source.id,
      })
      .returning({ id: emailTemplateVersions.id });
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "email_template.restored",
      entityType: "email_template",
      entityId: saved.id,
      metadata: { key: source.templateKey, restoredVersion: source.version },
    });
  });
  revalidatePath("/admin/settings/email-templates");
}

const languageSchema = z
  .string()
  .trim()
  .min(2)
  .max(10)
  .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/);

export async function createEmailTemplate(formData: FormData) {
  const user = await requireAdmin();
  const key = String(formData.get("key") ?? "") as TemplateKey;
  const name = z
    .string()
    .trim()
    .min(2)
    .max(120)
    .parse(String(formData.get("name") ?? ""));
  const language = languageSchema.parse(String(formData.get("language") ?? "id"));
  if (!templateKeys.includes(key) || ["layout", "new", "reply"].includes(key))
    throw new Error("Jenis template tidak dapat ditambahkan.");
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  const defaults = defaultTemplate(key);
  const [template] = await database.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: emailTemplates.id })
      .from(emailTemplates)
      .where(
        and(
          eq(emailTemplates.templateKey, key),
          eq(emailTemplates.language, language),
          eq(emailTemplates.isDefault, true),
          eq(emailTemplates.isArchived, false),
        ),
      )
      .limit(1);
    const [sourceVersion] = existing
      ? await tx
          .select()
          .from(emailTemplateVersions)
          .where(eq(emailTemplateVersions.templateId, existing.id))
          .orderBy(desc(emailTemplateVersions.version))
          .limit(1)
      : [];
    const [created] = await tx
      .insert(emailTemplates)
      .values({ templateKey: key, name, language, isDefault: !existing, createdBy: user.id })
      .returning();
    await tx.insert(emailTemplateVersions).values({
      templateId: created.id,
      templateKey: key,
      version: 1,
      subject: sourceVersion?.subject ?? defaults.subject,
      content: sourceVersion?.content ?? defaults.content,
      shellConfig: sourceVersion?.shellConfig ?? null,
      createdBy: user.id,
    });
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "email_template.created",
      entityType: "email_template",
      entityId: created.id,
      metadata: { key, language },
    });
    return [created];
  });
  revalidatePath("/admin/settings/email-templates");
  redirect(
    "/admin/settings/email-templates?kind=" +
      encodeURIComponent(key) +
      "&template=" +
      encodeURIComponent(template.id) +
      "&status=created",
  );
}

export async function duplicateEmailTemplate(formData: FormData) {
  const user = await requireAdmin();
  const templateId = z
    .string()
    .uuid()
    .parse(String(formData.get("templateId") ?? ""));
  const name = z
    .string()
    .trim()
    .min(2)
    .max(120)
    .parse(String(formData.get("name") ?? ""));
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  const [source] = await database.select().from(emailTemplates).where(eq(emailTemplates.id, templateId)).limit(1);
  const [version] = await database
    .select()
    .from(emailTemplateVersions)
    .where(eq(emailTemplateVersions.templateId, templateId))
    .orderBy(desc(emailTemplateVersions.version))
    .limit(1);
  if (!source || !version) throw new Error("Template sumber tidak ditemukan.");
  const siblings = await database
    .select({ name: emailTemplates.name })
    .from(emailTemplates)
    .where(and(eq(emailTemplates.templateKey, source.templateKey), eq(emailTemplates.language, source.language)));
  const usedNames = new Set(siblings.map((entry) => entry.name.toLocaleLowerCase("id-ID")));
  let uniqueName = name;
  for (let suffix = 2; usedNames.has(uniqueName.toLocaleLowerCase("id-ID")); suffix += 1)
    uniqueName = `${name.replace(/\s+\d+$/, "").slice(0, 115)} ${suffix}`;
  const [created] = await database.transaction(async (tx) => {
    const [template] = await tx
      .insert(emailTemplates)
      .values({ templateKey: source.templateKey, name: uniqueName, language: source.language, createdBy: user.id })
      .returning();
    await tx.insert(emailTemplateVersions).values({
      templateId: template.id,
      templateKey: source.templateKey,
      version: 1,
      subject: version.subject,
      content: version.content,
      shellConfig: version.shellConfig,
      createdBy: user.id,
      restoredFromId: version.id,
    });
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "email_template.duplicated",
      entityType: "email_template",
      entityId: template.id,
      metadata: { sourceId: source.id },
    });
    return [template];
  });
  revalidatePath("/admin/settings/email-templates");
  void created;
}

export async function setDefaultEmailTemplate(formData: FormData) {
  const user = await requireAdmin();
  const templateId = z
    .string()
    .uuid()
    .parse(String(formData.get("templateId") ?? ""));
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  const [target] = await database
    .select()
    .from(emailTemplates)
    .where(and(eq(emailTemplates.id, templateId), eq(emailTemplates.isArchived, false)))
    .limit(1);
  if (!target) throw new Error("Template tidak ditemukan.");
  await database.transaction(async (tx) => {
    await tx
      .update(emailTemplates)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(and(eq(emailTemplates.templateKey, target.templateKey), eq(emailTemplates.language, target.language)));
    await tx
      .update(emailTemplates)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(emailTemplates.id, target.id));
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "email_template.default_changed",
      entityType: "email_template",
      entityId: target.id,
    });
  });
  revalidatePath("/admin/settings/email-templates");
}

export async function archiveEmailTemplate(formData: FormData) {
  const user = await requireAdmin();
  const templateId = z
    .string()
    .uuid()
    .parse(String(formData.get("templateId") ?? ""));
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  const [target] = await database.select().from(emailTemplates).where(eq(emailTemplates.id, templateId)).limit(1);
  if (!target || target.isDefault) throw new Error("Template default tidak dapat diarsipkan.");
  await database.transaction(async (tx) => {
    await tx
      .update(emailTemplates)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(eq(emailTemplates.id, templateId));
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "email_template.archived",
      entityType: "email_template",
      entityId: templateId,
    });
  });
  revalidatePath("/admin/settings/email-templates");
}

export async function uploadEmailTemplateImage(formData: FormData) {
  const user = await requireAdmin();
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  const file = formData.get("file");
  if (
    !(file instanceof File) ||
    file.size < 1 ||
    file.size > 2 * 1024 * 1024 ||
    !["image/png", "image/jpeg", "image/webp"].includes(file.type)
  )
    throw new Error("Gunakan PNG, JPEG, atau WebP maksimal 2 MB.");
  const input = Buffer.from(await file.arrayBuffer());
  const info = await sharp(input, { limitInputPixels: 10_000_000 }).metadata();
  if (
    !info.width ||
    !info.height ||
    info.width > 4000 ||
    info.height > 4000 ||
    !["png", "jpeg", "webp"].includes(info.format ?? "")
  )
    throw new Error("Berkas gambar tidak valid.");
  const buffer = await sharp(input)
    .rotate()
    .resize({ width: 1400, withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  const id = randomUUID();
  const relativePath = join("email-template", `${id}.jpg`);
  await writeFile(await preparePrivateDestination(relativePath), buffer, { flag: "wx", mode: 0o600 });
  await database.insert(emailTemplateMedia).values({
    id,
    storagePath: relativePath,
    mimeType: "image/jpeg",
    size: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    uploadedBy: user.id,
  });
  return { url: `/api/admin/email-template-media/${id}` };
}

export async function previewEmailTemplate(key: TemplateKey, raw: unknown, rawShellConfig?: unknown) {
  const user = await requireAdmin();
  if (!templateKeys.includes(key)) throw new Error("Jenis template tidak valid.");
  const content = validateEmailDoc(raw, key);
  const database = getDatabase();
  const [latest] = database
    ? await database
        .select({ customerName: customers.displayName, transactionNo: businessTransactions.referenceNo })
        .from(businessTransactions)
        .innerJoin(customers, eq(customers.id, businessTransactions.customerId))
        .orderBy(desc(businessTransactions.updatedAt))
        .limit(1)
    : [];
  const variables = {
    customerName: latest?.customerName ?? "—",
    transactionNo: latest?.transactionNo ?? "—",
    documentName: "Surat penawaran",
    senderName: user.name,
    message: "Isi pesan untuk pratinjau.",
  };
  const result =
    key === "layout"
      ? await buildBrandedEmailDocument(content, variables, parseEmailShellConfig(rawShellConfig))
      : await buildTemplatedEmail(content, variables, key);
  const html = result.attachments.reduce(
    (value, image) =>
      value.replaceAll(
        `cid:${image.cid}`,
        `data:${image.filename.endsWith(".png") ? "image/png" : "image/jpeg"};base64,${image.content.toString("base64")}`,
      ),
    result.html,
  );
  return html;
}

export async function previewOutgoingEmail(raw: unknown) {
  const user = await getSession();
  if (!user || !["admin", "sales"].includes(user.role)) throw new Error("Tidak memiliki akses email.");
  const result = await buildTemplatedEmail(validateEmailDoc(raw, "new"), { senderName: user.name });
  return result.attachments.reduce(
    (value, image) =>
      value.replaceAll(
        `cid:${image.cid}`,
        `data:${image.filename.endsWith(".png") ? "image/png" : "image/jpeg"};base64,${image.content.toString("base64")}`,
      ),
    result.html,
  );
}

export async function sendEmailTemplateTest(formData: FormData) {
  const user = await requireAdmin();
  const key = String(formData.get("key") ?? "") as TemplateKey;
  if (!templateKeys.includes(key)) throw new Error("Jenis template tidak valid.");
  const subject = String(formData.get("subject") ?? "").trim() || "Template email";
  const content = validateEmailDoc(JSON.parse(String(formData.get("content") ?? "")), key);
  const variables = {
    customerName: "PT Preview Internal",
    transactionNo: "TEST-0001",
    documentName: templateLabels[key],
    senderName: user.name,
    originalSubject: "Pesan pelanggan",
    message: "Email uji internal.",
  };
  const rendered =
    key === "layout"
      ? await buildBrandedEmailDocument(
          content,
          variables,
          parseEmailShellConfig(JSON.parse(String(formData.get("shellConfig") || "{}"))),
        )
      : await buildTemplatedEmail(content, variables, key);
  if (process.env.EMAIL_CS_SEND_MODE !== "live") return { simulated: true };
  const settings = await getMailboxSettings();
  if (!settings) throw new Error("Email CS belum siap digunakan.");
  const watermark =
    '<div style="padding:10px;background:#fff1d9;color:#7a4a00;text-align:center;font-weight:700">TEST · EMAIL UJI INTERNAL</div>';
  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.smtpPort,
    secure: settings.smtpPort === 465,
    requireTLS: settings.smtpPort !== 465,
    auth: { user: settings.email, pass: settings.password },
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  try {
    await transport.sendMail({
      from: { name: user.name, address: settings.email },
      replyTo: settings.email,
      to: user.email,
      subject: `[TEST] ${subject}`,
      text: `TEST · EMAIL UJI INTERNAL\n\n${rendered.text}`,
      html: rendered.html.replace(/<body([^>]*)>/i, `<body$1>${watermark}`),
      attachments: rendered.attachments.map((file) => ({
        filename: file.filename,
        content: file.content,
        cid: file.cid,
      })),
    });
    return { simulated: false };
  } finally {
    transport.close();
  }
}
