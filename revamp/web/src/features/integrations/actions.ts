"use server";

import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import {
  auditLogs,
  businessTransactions,
  csEmails,
  integrationOauthStates,
  integrations,
  leads,
  transactionDocuments,
} from "@/lib/database/schema";
import { requireOperationsAccess } from "@/features/operations/access";
import { MailboxSyncError, testMailbox, type MailSettings } from "./mail-service";
import { encryptSecret, hasIntegrationEncryptionKey } from "./secrets";
import {
  getGoogleAdsOAuthConfigurationIssues,
  getGoogleAdsReportingConfigurationIssues,
  googleAdsRedirectUri,
  isGoogleAdsOAuthConfigured,
} from "./google-ads-config";
import { getActiveTemplate, validateEmailDoc } from "./email-templates";
import { getCsMailboxServerConfig } from "./mailbox-config";

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
    const input = z
      .object({
        email: z.string().email().max(255),
        password: z.string().min(1).max(512),
      })
      .parse({
        email: String(formData.get("email") ?? "").trim(),
        password: String(formData.get("password") ?? ""),
      });
    const mailboxServer = getCsMailboxServerConfig();
    if (!mailboxServer.configuredExplicitly)
      return "Endpoint cPanel belum disiapkan di server. Isi CS_MAIL_HOST dari halaman Set Up Mail Client sebelum menguji koneksi.";
    const settings: MailSettings = { ...input, ...mailboxServer };
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
    // MailboxSyncError already contains a classified, provider-safe message.
    // Returning it here prevents a timeout or authentication failure from being
    // misreported as an unavailable application server/database.
    if (error instanceof MailboxSyncError) return error.message;
    if (error instanceof Error && error.message.startsWith("Kunci keamanan integrasi belum disiapkan"))
      return error.message;
    return "Koneksi belum tersimpan karena proses belum dapat diselesaikan dengan aman. Periksa status pemeriksaan lalu coba lagi.";
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
  if (!clientId || !isGoogleAdsOAuthConfigured() || getGoogleAdsOAuthConfigurationIssues().length) {
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

export type IntegrationHealthActionResult = { ok: boolean; message: string };

const MAIL_HEALTH_FAILURE_MESSAGE: Record<string, string> = {
  mail_authentication: "Mailbox menolak kredensial. Perbarui kata sandi mailbox, lalu uji ulang.",
  mail_dns_network: "Server mailbox tidak dapat dijangkau. Periksa DNS, jaringan, atau firewall server mailbox.",
  mail_tls: "Koneksi TLS mailbox tidak dapat diverifikasi. Periksa sertifikat serta pengaturan host dan port.",
  mail_timeout:
    "Server mailbox tidak merespons pada IMAP/SMTP. Password belum dapat diverifikasi; periksa firewall atau layanan mailbox, lalu uji ulang.",
  mail_folder: "Folder Inbox atau Sent tidak tersedia. Periksa konfigurasi folder pada mailbox.",
  mail_unknown: "Pemeriksaan mailbox gagal tanpa klasifikasi tambahan. Uji ulang setelah server mailbox tersedia.",
};

async function writeIntegrationHealthAudit(actorId: string, key: "cs-mail" | "google-ads", ok: boolean) {
  const database = getDatabase();
  if (!database) return;
  await database.insert(auditLogs).values({
    actorId,
    action: `integration.${key}.${ok ? "health_check_succeeded" : "health_check_failed"}`,
    entityType: "integration",
    entityId: key,
    metadata: { source: "manual_health_check" },
  });
}

/** Manual, admin-only checks. Rendering a page never calls either external service. */
export async function runCsMailboxHealthCheck(): Promise<IntegrationHealthActionResult> {
  const user = await requireRole(["admin"]);
  try {
    const { runIntegrationSync } = await import("./sync-runner");
    const result = await runIntegrationSync({ trigger: "manual", services: ["mail"] });
    const ok = result.mail.status === "success" || result.mail.status === "busy";
    await writeIntegrationHealthAudit(user.id, "cs-mail", ok);
    revalidatePath("/admin/settings/integrations");
    revalidatePath("/admin/email");
    return {
      ok,
      message:
        result.mail.status === "busy"
          ? "Mailbox sedang diperiksa oleh proses lain; tidak ada pekerjaan ganda yang dijalankan."
          : ok
            ? `Mailbox berhasil diperiksa${result.mail.count ? `; ${result.mail.count} email baru disimpan.` : "; tidak ada email baru."}`
            : (MAIL_HEALTH_FAILURE_MESSAGE[result.mail.code ?? ""] ??
              "Pemeriksaan Email CS gagal. Server mailbox belum dapat diverifikasi; coba lagi setelah layanan tersedia."),
    };
  } catch {
    await writeIntegrationHealthAudit(user.id, "cs-mail", false);
    revalidatePath("/admin/settings/integrations");
    return {
      ok: false,
      message: "Pemeriksaan Email CS gagal. Periksa koneksi atau kata sandi mailbox, lalu coba lagi.",
    };
  }
}

export async function runGoogleAdsHealthCheck(): Promise<IntegrationHealthActionResult> {
  return runGoogleAdsAccessProbe();
}

/** Verifies Cloud-project access, MCC hierarchy, and target customer access without changing stored report rows. */
export async function runGoogleAdsAccessProbe(): Promise<IntegrationHealthActionResult> {
  const user = await requireRole(["admin"]);
  const configurationIssues = [
    ...getGoogleAdsOAuthConfigurationIssues(),
    ...getGoogleAdsReportingConfigurationIssues(),
  ];
  if (configurationIssues.length)
    return {
      ok: false,
      message: `Akses API belum siap: ${configurationIssues.map((issue) => issue.label).join(", ")}.`,
    };
  try {
    const { probeGoogleAdsReporting } = await import("./google-ads-service");
    await probeGoogleAdsReporting();
    await writeIntegrationHealthAudit(user.id, "google-ads", true);
    revalidatePath("/admin/settings/integrations");
    return { ok: true, message: "Akses API, MCC, dan akun laporan berhasil diverifikasi. Laporan belum diubah." };
  } catch (error) {
    await writeIntegrationHealthAudit(user.id, "google-ads", false);
    revalidatePath("/admin/settings/integrations");
    const message = error instanceof Error ? error.message : "Verifikasi akses API belum berhasil.";
    return {
      ok: false,
      message,
    };
  }
}

export async function sendCsEmail(formData: FormData) {
  await requireRole(["admin", "sales"]);
  const attemptId = String(formData.get("attemptId") ?? "");
  if (!attemptId) throw new Error("Buka draf dan periksa pratinjau terakhir sebelum mengirim email.");
  const { sendPreparedDraft } = await import("./email-drafts");
  const result = await sendPreparedDraft(attemptId);
  revalidatePath("/admin/email");
  redirect(`/admin/email?folder=sent&email=outbox:${result.attemptId}`);
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
  const leadId = await database.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`email-lead-${input.email.toLowerCase()}`}))`);
    const [source] = await tx
      .select({ id: csEmails.id, linkedLeadId: csEmails.linkedLeadId })
      .from(csEmails)
      .where(and(eq(csEmails.id, input.emailId), eq(csEmails.folder, "inbox")))
      .limit(1);
    if (!source) throw new Error("Email asal tidak ditemukan.");
    if (source.linkedLeadId) return source.linkedLeadId;
    const [existing] = await tx
      .select({ id: leads.id })
      .from(leads)
      .where(sql`lower(${leads.email}) = ${input.email.toLowerCase()}`)
      .limit(1);
    const id =
      existing?.id ??
      (
        await tx
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
    if (!id) throw new Error("Prospek belum dapat dibuat.");
    await tx.update(csEmails).set({ linkedLeadId: id }).where(eq(csEmails.id, input.emailId));
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "integration.email_linked_to_prospect",
      entityType: "lead",
      entityId: id,
      metadata: { source: "email", emailId: input.emailId },
    });
    return id;
  });
  revalidatePath("/admin/email");
  revalidatePath("/admin/prospects");
  redirect(`/admin/prospects?selected=${leadId}`);
}

export async function linkEmailToTransaction(formData: FormData): Promise<string | null> {
  const user = await requireRole(["admin", "sales"]);
  const input = z.object({ emailId: z.string().uuid(), transactionId: z.string().uuid() }).safeParse({
    emailId: String(formData.get("emailId") ?? ""),
    transactionId: String(formData.get("transactionId") ?? ""),
  });
  if (!input.success) return "Pilih transaksi dari hasil pencarian terlebih dahulu.";
  const database = getDatabase();
  if (!database) return "Database belum terhubung. Pilihan Anda tetap tersedia; coba lagi.";
  let result;
  try {
    result = await database.transaction(async (tx) => {
      const [email] = await tx
        .select()
        .from(csEmails)
        .where(eq(csEmails.id, input.data.emailId))
        .limit(1)
        .for("update");
      if (!email || email.folder !== "inbox") return "Email masuk tidak ditemukan. Muat ulang halaman.";
      if (email.linkedTransactionId) return "Email sudah dikaitkan ke transaksi. Muat ulang halaman untuk melihatnya.";
      const [transaction] = await tx
        .select({ id: businessTransactions.id, referenceNo: businessTransactions.referenceNo })
        .from(businessTransactions)
        .where(
          and(
            eq(businessTransactions.id, input.data.transactionId),
            process.env.NODE_ENV !== "development" ? eq(businessTransactions.dataClass, "production") : undefined,
          ),
        )
        .limit(1);
      if (!transaction) return "Transaksi tidak ditemukan. Cari dan pilih transaksi kembali.";
      await tx
        .update(csEmails)
        .set({ linkedTransactionId: transaction.id })
        .where(and(eq(csEmails.id, email.id), isNull(csEmails.linkedTransactionId)));
      await tx.insert(auditLogs).values({
        actorId: user.id,
        action: "integration.email_linked_to_transaction",
        entityType: "transaction",
        entityId: transaction.id,
        metadata: { emailId: email.id, referenceNo: transaction.referenceNo },
      });
      return null;
    });
  } catch {
    return "Email belum berhasil dikaitkan. Pilihan Anda tetap tersedia; coba lagi.";
  }
  if (result) return result;
  revalidatePath("/admin/email");
  revalidatePath(`/admin/transactions/${input.data.transactionId}`);
  redirect(`/admin/email?folder=inbox&email=${input.data.emailId}&link=success`);
}

export async function refreshMailbox(formData: FormData) {
  await requireRole(["admin", "sales"]);
  const { runIntegrationSync } = await import("./sync-runner");
  let failed = false;
  try {
    const result = await runIntegrationSync({ trigger: "manual", services: ["mail"] });
    failed = result.mail.status === "failed";
  } catch {
    failed = true;
  }
  revalidatePath("/admin/email");
  const requested = String(formData.get("returnTo") ?? "");
  const destination = new URL(
    requested.startsWith("/admin/email?") ? requested : "/admin/email?folder=inbox",
    "http://localhost",
  );
  destination.searchParams.delete("sync");
  destination.searchParams.delete("synced");
  destination.searchParams.set(failed ? "sync" : "synced", failed ? "error" : "1");
  redirect(`/admin/email?${destination.searchParams}`);
}

export async function refreshGoogleAds() {
  await requireRole(["admin"]);
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

export async function refreshGoogleAdsIfDue() {
  await requireRole(["admin"]);
  const { syncGoogleAdsOncePerJakartaDay } = await import("./google-ads-service");
  const result = await syncGoogleAdsOncePerJakartaDay();
  if (result === "updated") revalidatePath("/admin/marketing");
  return result;
}

export async function refreshGoogleAdsRange(formData: FormData) {
  await requireRole(["admin"]);
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
  const configurationIssues = [
    ...getGoogleAdsOAuthConfigurationIssues(),
    ...getGoogleAdsReportingConfigurationIssues(),
  ];
  if (configurationIssues.length) redirect("/admin/marketing?error=configuration");
  const database = getDatabase();
  const [connection] = database
    ? await database
        .select({ metadata: integrations.metadata })
        .from(integrations)
        .where(eq(integrations.key, "google-ads"))
        .limit(1)
    : [];
  const metadata = (connection?.metadata ?? {}) as Record<string, unknown>;
  const timeZone = typeof metadata.adsAccountTimeZone === "string" ? metadata.adsAccountTimeZone : "Asia/Jakarta";
  const { GoogleAdsServiceError, validateGoogleAdsRange, syncGoogleAdsReportRange } =
    await import("./google-ads-service");
  if (!validateGoogleAdsRange(from, to, timeZone)) redirect("/admin/marketing?error=range");
  const { normalizeAdsMetrics } = await import("./google-ads-report-model");
  const validCampaigns =
    campaigns
      ?.split(",")
      .filter((id) => /^\d{1,20}$/.test(id))
      .slice(0, 100) ?? [];
  const validMetrics = normalizeAdsMetrics(metrics);
  const query = new URLSearchParams({ from, to, interval: interval ?? "daily", compare: compare ?? "1" });
  if (validCampaigns.length) query.set("campaigns", validCampaigns.join(","));
  if (validMetrics.length) query.set("metrics", validMetrics.join(","));
  try {
    await syncGoogleAdsReportRange(from, to, timeZone);
  } catch (error) {
    const code = error instanceof GoogleAdsServiceError ? error.code : "report_unavailable";
    revalidatePath("/admin/marketing");
    redirect(`/admin/marketing?${query.toString()}&ads=${encodeURIComponent(code)}`);
  }
  revalidatePath("/admin/marketing");
  redirect(`/admin/marketing?${query.toString()}&synced=1`);
}

// Legacy direct-send requests are refused; documents use the shared frozen-preview flow.
export async function sendTransactionDocument(_formData: FormData) {
  void _formData;
  await requireOperationsAccess();
  throw new Error("Pengiriman langsung tidak tersedia. Siapkan draf dan konfirmasi pratinjau di Email CS.");
}

export async function prepareTransactionDocumentEmail(formData: FormData) {
  await requireOperationsAccess();
  const input = z
    .object({
      transactionId: z.uuid(),
      documentId: z.uuid(),
      to: z.email().max(255),
      subject: z
        .string()
        .trim()
        .min(1)
        .max(998)
        .refine((value) => !/[\r\n]/.test(value)),
      bodyJson: z.string().min(1).max(200_000),
      confirmedTo: z.email().max(255),
    })
    .parse(Object.fromEntries(formData));
  if (input.to.toLowerCase() !== input.confirmedTo.toLowerCase()) throw new Error("Konfirmasi penerima tidak cocok.");
  const database = getDatabase();
  if (!database) throw new Error("Database belum tersedia.");
  const [document] = await database
    .select()
    .from(transactionDocuments)
    .where(
      and(eq(transactionDocuments.id, input.documentId), eq(transactionDocuments.transactionId, input.transactionId)),
    )
    .limit(1);
  if (!document?.checksum) throw new Error("Checksum dokumen belum tersedia; arsip perlu diperiksa.");
  const documentSource = {
    transactionId: input.transactionId,
    documentId: input.documentId,
    version: document.version,
    checksum: document.checksum,
  };
  const { validateDocumentEmailSource } = await import("./document-email-source");
  await validateDocumentEmailSource(database, documentSource, { to: [input.to], cc: [], bcc: [] }, input.subject);
  const { createDraft } = await import("./email-drafts");
  const template = await getActiveTemplate(
    document.type === "quotation" ? "quotation" : document.type.startsWith("invoice") ? "invoice" : "delivery",
  );
  const draft = await createDraft(
    {
      to: input.to,
      cc: "",
      bcc: "",
      subject: input.subject,
      content: validateEmailDoc(JSON.parse(input.bodyJson), "new"),
      originalSubject: "",
      documentSource,
    },
    template.version,
  );
  revalidatePath("/admin/email");
  redirect(`/admin/email?folder=drafts&draft=${draft.id}`);
}
