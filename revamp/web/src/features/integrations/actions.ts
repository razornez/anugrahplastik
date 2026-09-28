"use server";

import { and, eq, lt } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import nodemailer from "nodemailer";
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import {
  auditLogs,
  businessTransactions,
  csEmailOutbox,
  csEmails,
  customers,
  integrationOauthStates,
  integrations,
  leads,
  transactionDocuments,
} from "@/lib/database/schema";
import { privateFilePath } from "@/features/operations/private-storage";
import { requireOperationsAccess } from "@/features/operations/access";
import { getEmailRecord, getMailboxSettings, testMailbox, type MailSettings } from "./mail-service";
import { encryptSecret, hasIntegrationEncryptionKey } from "./secrets";
import { googleAdsRedirectUri, isGoogleAdsOAuthConfigured } from "./google-ads-config";
import { buildCompanyEmail } from "./email-format";

async function requireRole(roles: string[]) {
  const user = await getSession();
  if (!user || !roles.includes(user.role)) throw new Error("Anda tidak memiliki akses untuk tindakan ini.");
  return user;
}

export async function saveCsMailbox(_previousMessage: string | null, formData: FormData): Promise<string | null> {
  const user = await requireRole(["admin"]);
  const database = getDatabase();
  if (!database) return "Database belum terhubung. Coba lagi setelah database aktif.";
  try {
    const settings = z
      .object({
        email: z.string().email().max(255),
        password: z.string().min(1).max(512),
        host: z.literal("mail.anugrahplastik.com"),
        imapPort: z.literal(993),
        smtpPort: z.literal(465),
      })
      .parse({
        email: String(formData.get("email") ?? "").trim(),
        password: String(formData.get("password") ?? ""),
        host: String(formData.get("host") ?? ""),
        imapPort: Number(formData.get("imapPort")),
        smtpPort: Number(formData.get("smtpPort")),
      }) satisfies MailSettings;
    if (!hasIntegrationEncryptionKey())
      return "Kunci enkripsi integrasi belum disiapkan pada server. Minta administrator server melengkapinya sebelum memasukkan kata sandi email.";
    if (settings.email.toLowerCase() !== "cs@anugrahplastik.com")
      return "Gunakan alamat mailbox CS yang telah diverifikasi.";
    const ciphertext = encryptSecret(settings);
    await testMailbox(settings);
    await database
      .insert(integrations)
      .values({
        key: "cs-mail",
        status: "connected",
        secretCiphertext: ciphertext,
        metadata: { email: settings.email, host: settings.host },
        updatedBy: user.id,
        lastError: null,
      })
      .onConflictDoUpdate({
        target: integrations.key,
        set: {
          status: "connected",
          secretCiphertext: ciphertext,
          metadata: { email: settings.email, host: settings.host },
          updatedBy: user.id,
          lastError: null,
          updatedAt: new Date(),
        },
      });
    await database.insert(auditLogs).values({
      actorId: user.id,
      action: "integration.mail_connected",
      entityType: "integration",
      entityId: "cs-mail",
      metadata: { email: settings.email },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return "Periksa kata sandi dan pastikan data koneksi email terisi dengan benar.";
    if (error instanceof Error && error.message.startsWith("Koneksi email belum berhasil.")) return error.message;
    if (error instanceof Error && error.message.startsWith("Kunci keamanan integrasi belum disiapkan"))
      return error.message;
    return "Koneksi belum tersimpan. Pastikan server dan database tersedia, lalu coba lagi.";
  }
  revalidatePath("/admin/settings/integrations");
  redirect("/admin/settings/integrations?saved=mail");
}

export async function disconnectCsMailbox() {
  const user = await requireRole(["admin"]);
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  await database
    .update(integrations)
    .set({ status: "disconnected", secretCiphertext: null, lastError: null, updatedBy: user.id, updatedAt: new Date() })
    .where(eq(integrations.key, "cs-mail"));
  await database.insert(auditLogs).values({
    actorId: user.id,
    action: "integration.mail_disconnected",
    entityType: "integration",
    entityId: "cs-mail",
  });
  revalidatePath("/admin/settings/integrations");
  redirect("/admin/settings/integrations");
}

export async function startGoogleAdsConnection() {
  const user = await requireRole(["admin"]);
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const redirectUri = googleAdsRedirectUri();
  const callbackHost = new URL(redirectUri).hostname;
  if (process.env.NODE_ENV !== "production" && !["localhost", "127.0.0.1"].includes(callbackHost)) {
    redirect("/admin/settings/integrations?error=google-local");
  }
  if (!clientId || !isGoogleAdsOAuthConfigured()) {
    throw new Error(
      "Google Ads belum siap. Administrator server perlu mengisi OAuth Client ID, Client Secret, dan kunci enkripsi integrasi.",
    );
  }
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  const state = randomBytes(32).toString("base64url");
  const stateHash = createHash("sha256").update(state).digest("hex");
  await database.delete(integrationOauthStates).where(lt(integrationOauthStates.expiresAt, new Date()));
  await database
    .insert(integrationOauthStates)
    .values({ stateHash, actorId: user.id, expiresAt: new Date(Date.now() + 10 * 60_000) });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email https://www.googleapis.com/auth/adwords",
    access_type: "offline",
    prompt: "consent",
    state,
  });
  if (process.env.GOOGLE_ADS_LOGIN_EMAIL) params.set("login_hint", process.env.GOOGLE_ADS_LOGIN_EMAIL);
  params.set("include_granted_scopes", "true");
  params.set("select_account", "true");
  redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

export async function disconnectGoogleAds() {
  const user = await requireRole(["admin"]);
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  await database
    .update(integrations)
    .set({
      status: "disconnected",
      secretCiphertext: null,
      metadata: null,
      lastError: null,
      updatedBy: user.id,
      updatedAt: new Date(),
    })
    .where(eq(integrations.key, "google-ads"));
  await database.insert(auditLogs).values({
    actorId: user.id,
    action: "integration.google_ads_disconnected",
    entityType: "integration",
    entityId: "google-ads",
  });
  revalidatePath("/admin/settings/integrations");
  redirect("/admin/settings/integrations");
}

export async function sendCsEmail(formData: FormData) {
  const user = await requireRole(["admin", "sales"]);
  const input = z
    .object({
      to: z.string().email().max(255),
      subject: z.string().trim().min(1).max(998),
      body: z.string().trim().min(1).max(20_000),
      idempotencyKey: z.string().uuid(),
      replyToId: z.string().uuid().optional(),
    })
    .parse({
      to: String(formData.get("to") ?? "").trim(),
      subject: String(formData.get("subject") ?? ""),
      body: String(formData.get("body") ?? ""),
      idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
      replyToId: String(formData.get("replyToId") ?? "") || undefined,
    });
  const database = getDatabase();
  const settings = await getMailboxSettings();
  if (!database || !settings) throw new Error("Email CS belum tersambung.");
  const linkedEmail = input.replyToId ? await getEmailRecord(input.replyToId) : null;
  if (input.replyToId && !linkedEmail) throw new Error("Email asal balasan tidak ditemukan.");
  const [pending] = await database
    .insert(csEmailOutbox)
    .values({
      toAddress: input.to,
      subject: input.subject,
      bodyCiphertext: encryptSecret({ body: input.body }),
      idempotencyKey: input.idempotencyKey,
      status: "pending",
      linkedEmailId: linkedEmail?.id ?? null,
      inReplyTo: linkedEmail?.messageId ?? null,
      sentBy: user.id,
    })
    .onConflictDoNothing()
    .returning({ id: csEmailOutbox.id });
  if (!pending) throw new Error("Permintaan email ini sudah pernah diproses. Segarkan halaman sebelum mengirim lagi.");
  const formattedEmail = buildCompanyEmail(input.body);
  try {
    const transporter = nodemailer.createTransport({
      host: settings.host,
      port: settings.smtpPort,
      secure: true,
      auth: { user: settings.email, pass: settings.password },
      logger: false,
      debug: false,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
    const result = await transporter.sendMail({
      from: { name: "Anugrah Plastik", address: settings.email },
      to: input.to,
      subject: input.subject,
      text: formattedEmail.text,
      html: formattedEmail.html,
      ...(linkedEmail?.messageId ? { inReplyTo: linkedEmail.messageId, references: [linkedEmail.messageId] } : {}),
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    await database
      .update(csEmailOutbox)
      .set({ status: "sent", messageId: result.messageId })
      .where(eq(csEmailOutbox.id, pending.id));
    await database.insert(auditLogs).values({
      actorId: user.id,
      action: "integration.mail_sent",
      entityType: "email",
      entityId: pending.id,
      metadata: { recipient: input.to, reply: Boolean(linkedEmail) },
    });
  } catch {
    // The SMTP server may accept a message before the connection fails; keep this idempotency key blocked to prevent accidental duplicates.
    await database.update(csEmailOutbox).set({ status: "uncertain" }).where(eq(csEmailOutbox.id, pending.id));
    revalidatePath("/admin/email");
    redirect("/admin/email?folder=sent&send=check");
  }
  revalidatePath("/admin/email");
  redirect("/admin/email?folder=sent&sent=1");
}

export async function createProspectFromEmail(formData: FormData) {
  const user = await requireRole(["admin", "sales"]);
  const input = z
    .object({
      emailId: z.string().uuid(),
      name: z.string().trim().min(2).max(120),
      email: z.string().email().max(255),
      message: z.string().trim().min(2).max(5000),
    })
    .parse({
      emailId: String(formData.get("emailId") ?? ""),
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? "").trim(),
      message: String(formData.get("message") ?? ""),
    });
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  const [source] = await database
    .select({ id: csEmails.id, linkedLeadId: csEmails.linkedLeadId })
    .from(csEmails)
    .where(eq(csEmails.id, input.emailId))
    .limit(1);
  if (!source) throw new Error("Email asal tidak ditemukan.");
  if (source.linkedLeadId) redirect(`/admin/prospects?selected=${source.linkedLeadId}`);
  const [existing] = await database.select({ id: leads.id }).from(leads).where(eq(leads.email, input.email)).limit(1);
  const leadId =
    existing?.id ??
    (
      await database
        .insert(leads)
        .values({
          name: input.name,
          email: input.email,
          phone: null,
          message: input.message,
          source: "email",
          status: "new",
          assignedUserId: user.id,
        })
        .returning({ id: leads.id })
    )[0]?.id;
  if (!leadId) throw new Error("Prospek belum dapat dibuat.");
  await database.update(csEmails).set({ linkedLeadId: leadId }).where(eq(csEmails.id, input.emailId));
  await database.insert(auditLogs).values({
    actorId: user.id,
    action: "integration.email_linked_to_prospect",
    entityType: "lead",
    entityId: leadId,
    metadata: { source: "email", emailId: input.emailId },
  });
  revalidatePath("/admin/email");
  revalidatePath("/admin/prospects");
  redirect(`/admin/prospects?selected=${leadId}`);
}

export async function linkEmailToTransaction(formData: FormData) {
  const user = await requireRole(["admin", "sales"]);
  const input = z
    .object({
      emailId: z.string().uuid(),
      referenceNo: z
        .string()
        .trim()
        .regex(/^TRX-\d{4}-\d{5}$/i),
    })
    .parse({ emailId: String(formData.get("emailId") ?? ""), referenceNo: String(formData.get("referenceNo") ?? "") });
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  const [email] = await database.select().from(csEmails).where(eq(csEmails.id, input.emailId)).limit(1);
  if (!email || email.folder !== "inbox") throw new Error("Email masuk tidak ditemukan.");
  const [transaction] = await database
    .select({ id: businessTransactions.id, referenceNo: businessTransactions.referenceNo })
    .from(businessTransactions)
    .where(eq(businessTransactions.referenceNo, input.referenceNo.toUpperCase()))
    .limit(1);
  if (!transaction) redirect(`/admin/email?folder=inbox&email=${email.id}&link=not-found`);
  await database.update(csEmails).set({ linkedTransactionId: transaction.id }).where(eq(csEmails.id, email.id));
  await database.insert(auditLogs).values({
    actorId: user.id,
    action: "integration.email_linked_to_transaction",
    entityType: "transaction",
    entityId: transaction.id,
    metadata: { emailId: email.id, referenceNo: transaction.referenceNo },
  });
  revalidatePath("/admin/email");
  revalidatePath(`/admin/transactions/${transaction.id}`);
  redirect(`/admin/email?folder=inbox&email=${email.id}&link=success`);
}

export async function refreshMailbox() {
  await requireRole(["admin", "sales"]);
  const { syncMailbox } = await import("./mail-service");
  let failed = false;
  try {
    await syncMailbox();
  } catch {
    failed = true;
  }
  revalidatePath("/admin/email");
  redirect(failed ? "/admin/email?folder=inbox&sync=error" : "/admin/email?folder=inbox&synced=1");
}

export async function refreshGoogleAds() {
  await requireRole(["admin", "sales"]);
  const { syncGoogleAdsReport } = await import("./google-ads-service");
  try {
    await syncGoogleAdsReport(30);
  } catch {
    revalidatePath("/admin/marketing");
    redirect("/admin/marketing?error=sync");
  }
  revalidatePath("/admin/marketing");
  redirect("/admin/marketing?synced=1");
}

export async function refreshGoogleAdsRange(formData: FormData) {
  await requireRole(["admin", "sales"]);
  const dateInput = z
    .object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      campaigns: z.string().max(1200).optional(),
      metrics: z.string().max(160).optional(),
      interval: z.enum(["daily", "weekly", "monthly"]).optional(),
      compare: z.enum(["0", "1"]).optional(),
    })
    .safeParse({
      from: String(formData.get("from") ?? ""),
      to: String(formData.get("to") ?? ""),
      campaigns: String(formData.get("campaigns") ?? ""),
      metrics: String(formData.get("metrics") ?? ""),
      interval: String(formData.get("interval") ?? "daily"),
      compare: String(formData.get("compare") ?? "1"),
    });
  if (!dateInput.success) redirect("/admin/marketing?error=range");
  const { from, to, campaigns, metrics, interval, compare } = dateInput.data;
  const { validateGoogleAdsRange, syncGoogleAdsReportRange } = await import("./google-ads-service");
  if (!validateGoogleAdsRange(from, to)) redirect("/admin/marketing?error=range");
  const allowedMetrics = new Set(["impressions", "cost", "conversions", "conversionValue"]);
  const validCampaigns =
    campaigns
      ?.split(",")
      .filter((id) => /^\d{1,20}$/.test(id))
      .slice(0, 100) ?? [];
  const validMetrics =
    metrics
      ?.split(",")
      .filter((item) => allowedMetrics.has(item))
      .slice(0, 4) ?? [];
  const query = new URLSearchParams({ from, to, interval: interval ?? "daily", compare: compare ?? "1" });
  if (validCampaigns.length) query.set("campaigns", validCampaigns.join(","));
  if (validMetrics.length) query.set("metrics", validMetrics.join(","));
  try {
    await syncGoogleAdsReportRange(from, to);
  } catch {
    revalidatePath("/admin/marketing");
    redirect(`/admin/marketing?${query.toString()}&error=sync`);
  }
  revalidatePath("/admin/marketing");
  redirect(`/admin/marketing?${query.toString()}&synced=1`);
}

export async function sendTransactionDocument(formData: FormData) {
  const user = await requireOperationsAccess();
  const input = z
    .object({
      transactionId: z.string().uuid(),
      documentId: z.string().uuid(),
      to: z.string().email().max(255),
      subject: z.string().trim().min(1).max(998),
      body: z.string().trim().min(1).max(20_000),
      idempotencyKey: z.string().uuid(),
    })
    .parse({
      transactionId: String(formData.get("transactionId") ?? ""),
      documentId: String(formData.get("documentId") ?? ""),
      to: String(formData.get("to") ?? "").trim(),
      subject: String(formData.get("subject") ?? ""),
      body: String(formData.get("body") ?? ""),
      idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
    });
  const database = getDatabase();
  const settings = await getMailboxSettings();
  if (!database || !settings) throw new Error("Email CS belum tersambung.");
  const [record] = await database
    .select({
      document: transactionDocuments,
      customerEmail: customers.email,
      transactionNo: businessTransactions.referenceNo,
    })
    .from(transactionDocuments)
    .innerJoin(businessTransactions, eq(businessTransactions.id, transactionDocuments.transactionId))
    .innerJoin(customers, eq(customers.id, businessTransactions.customerId))
    .where(
      and(eq(transactionDocuments.id, input.documentId), eq(transactionDocuments.transactionId, input.transactionId)),
    )
    .limit(1);
  if (
    !record?.document.storagePath ||
    !record.customerEmail ||
    record.customerEmail.toLowerCase() !== input.to.toLowerCase()
  ) {
    throw new Error(
      "Dokumen atau email customer belum siap. Pastikan dokumen privat tersedia dan alamat cocok dengan data customer.",
    );
  }
  const absolutePath = privateFilePath(record.document.storagePath);
  const fileInfo = await stat(absolutePath);
  if (!fileInfo.isFile() || fileInfo.size < 1 || fileInfo.size > 15 * 1024 * 1024)
    throw new Error("Lampiran tidak ditemukan atau lebih besar dari batas 15 MB.");
  const file = await readFile(absolutePath);
  const [pending] = await database
    .insert(csEmailOutbox)
    .values({
      toAddress: input.to,
      subject: input.subject,
      bodyCiphertext: encryptSecret({ body: input.body }),
      idempotencyKey: input.idempotencyKey,
      status: "pending",
      linkedTransactionId: input.transactionId,
      sentBy: user.id,
    })
    .onConflictDoNothing()
    .returning({ id: csEmailOutbox.id });
  if (!pending)
    throw new Error(
      "Permintaan dokumen ini sudah pernah diproses. Periksa menu Email terkirim sebelum mencoba kembali.",
    );
  const formattedEmail = buildCompanyEmail(input.body);
  try {
    const transporter = nodemailer.createTransport({
      host: settings.host,
      port: settings.smtpPort,
      secure: true,
      auth: { user: settings.email, pass: settings.password },
      logger: false,
      debug: false,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
    const result = await transporter.sendMail({
      from: { name: "Anugrah Plastik", address: settings.email },
      to: input.to,
      subject: input.subject,
      text: formattedEmail.text,
      html: formattedEmail.html,
      attachments: [
        {
          filename: basename(record.document.originalName || "dokumen.pdf")
            .replace(/[\r\n"\\]/g, "_")
            .slice(0, 180),
          content: file,
        },
      ],
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    await database.transaction(async (tx) => {
      await tx
        .update(csEmailOutbox)
        .set({ status: "sent", messageId: result.messageId })
        .where(eq(csEmailOutbox.id, pending.id));
      await tx
        .update(transactionDocuments)
        .set({ sentMessageId: result.messageId, recipient: input.to })
        .where(eq(transactionDocuments.id, input.documentId));
      await tx.insert(auditLogs).values({
        actorId: user.id,
        action: "transaction.document_emailed",
        entityType: "transaction",
        entityId: input.transactionId,
        metadata: { documentId: input.documentId, recipient: input.to, outboxId: pending.id },
      });
    });
  } catch {
    await database.update(csEmailOutbox).set({ status: "uncertain" }).where(eq(csEmailOutbox.id, pending.id));
    revalidatePath("/admin/email");
    redirect(`/admin/transactions/${input.transactionId}?email=check`);
  }
  revalidatePath(`/admin/transactions/${input.transactionId}`);
  revalidatePath("/admin/email");
  redirect(`/admin/transactions/${input.transactionId}?email=sent`);
}
