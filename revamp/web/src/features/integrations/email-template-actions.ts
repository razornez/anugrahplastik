"use server";

import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { auditLogs, emailTemplateMedia, emailTemplateVersions } from "@/lib/database/schema";
import { preparePrivateDestination } from "@/features/operations/private-storage";
import {
  buildBrandedEmailDocument,
  buildTemplatedEmail,
  templateKeys,
  validateEmailDoc,
  type TemplateKey,
} from "./email-templates";
import { parseEmailShellConfig, validateEmailShellConfig } from "./email-template-shell";

async function requireAdmin() {
  const user = await getSession();
  if (!user || user.role !== "admin") throw new Error("Hanya administrator yang dapat mengubah template email.");
  return user;
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
  await database.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`email-template-${key}`}))`);
    const [previous] = await tx
      .select()
      .from(emailTemplateVersions)
      .where(eq(emailTemplateVersions.templateKey, key))
      .orderBy(desc(emailTemplateVersions.version))
      .limit(1);
    const [saved] = await tx
      .insert(emailTemplateVersions)
      .values({
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
      metadata: { key, version: saved.version, previousVersion: previous?.version ?? 0 },
    });
  });
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
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`email-template-${source.templateKey}`}))`);
    const [current] = await tx
      .select()
      .from(emailTemplateVersions)
      .where(eq(emailTemplateVersions.templateKey, source.templateKey))
      .orderBy(desc(emailTemplateVersions.version))
      .limit(1);
    const [saved] = await tx
      .insert(emailTemplateVersions)
      .values({
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
  await requireAdmin();
  if (!templateKeys.includes(key)) throw new Error("Jenis template tidak valid.");
  const content = validateEmailDoc(raw, key);
  const variables = {
    customerName: "PT Contoh Pelanggan",
    transactionNo: "TRX-2026-00001",
    documentName: "Surat penawaran",
    senderName: "Tim Anugrah Plastik",
    message: "Contoh isi pesan untuk pratinjau.",
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
