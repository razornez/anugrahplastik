import "server-only";
import { and, desc, eq, isNotNull, lt } from "drizzle-orm";
import { getDatabase } from "@/lib/database/client";
import { integrationSyncRuns, integrations } from "@/lib/database/schema";
import { syncGoogleAdsOncePerJakartaDay } from "./google-ads-service";
import { syncMailbox, type MailboxFailureCode } from "./mail-service";

export type SyncTrigger = "scheduled" | "manual";
export type SyncService = "mail" | "ads";
type ServiceResult = {
  status: "success" | "failed" | "skipped" | "busy" | "not-due" | "retry-exhausted";
  count: number;
  code: string | null;
};

/** Safe scheduler readiness check. It intentionally returns no environment values. */
export function getSchedulerConfiguration() {
  const syncUrl = (process.env.INTEGRATIONS_SYNC_URL || process.env.APP_ORIGIN || "").replace(/\/$/, "");
  const issues: string[] = [];
  if (!process.env.INTEGRATIONS_CRON_TOKEN) issues.push("Token scheduler belum diisi");
  if (!/^https:\/\//i.test(syncUrl)) issues.push("URL HTTPS sinkronisasi belum diisi");
  return { configured: issues.length === 0, issues };
}

function errorCode(error: unknown, service: SyncService) {
  if (
    service === "mail" &&
    typeof error === "object" &&
    error !== null &&
    "mailboxCode" in error &&
    typeof error.mailboxCode === "string"
  )
    return error.mailboxCode as MailboxFailureCode;
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (service === "ads" && /sesi google ads|otorisasi/.test(message)) return "authorization";
  if (service === "ads" && /developer token/.test(message)) return "developer_token";
  if (service === "ads" && /verifikasi akses api/.test(message)) return "probe_required";
  if (service === "ads" && /project google cloud|developer token/.test(message)) return "cloud_project";
  if (service === "ads" && /mcc|login customer/.test(message)) return "manager_link";
  if (service === "ads" && /akun google.*akses/.test(message)) return "customer_access";
  if (service === "ads" && /pengaturan laporan/.test(message)) return "configuration";
  if (/timeout|timed out/.test(message)) return "timeout";
  if (service === "ads" && /http 401|http 403|akses/.test(message)) return "api_access";
  return service === "mail" ? "mailbox_unavailable" : "report_unavailable";
}

export async function runIntegrationSync({
  trigger,
  services = ["mail", "ads"],
}: {
  trigger: SyncTrigger;
  services?: SyncService[];
}) {
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  const configured = await database
    .select({ key: integrations.key })
    .from(integrations)
    .where(isNotNull(integrations.secretCiphertext));
  const hasMail = configured.some((item) => item.key === "cs-mail");
  const hasAds = configured.some((item) => item.key === "google-ads");
  const [run] = await database
    .insert(integrationSyncRuns)
    .values({ trigger, status: "running" })
    .returning({ id: integrationSyncRuns.id });
  if (!run) throw new Error("Riwayat sinkronisasi belum dapat dibuat.");

  let mail: ServiceResult = { status: "skipped", count: 0, code: null };
  let ads: ServiceResult = { status: "skipped", count: 0, code: null };
  if (services.includes("mail") && hasMail) {
    try {
      const result = await syncMailbox();
      mail = result.skipped
        ? { status: "busy", count: 0, code: null }
        : { status: "success", count: result.synced, code: null };
    } catch (error) {
      mail = { status: "failed", count: 0, code: errorCode(error, "mail") };
    }
  }
  if (services.includes("ads") && hasAds) {
    try {
      const result = trigger === "scheduled" ? await syncGoogleAdsOncePerJakartaDay() : "manual";
      if (result === "not-connected") ads = { status: "skipped", count: 0, code: null };
      else if (result === "probe-required") ads = { status: "skipped", count: 0, code: "probe_required" };
      else if (result === "not-due") ads = { status: "not-due", count: 0, code: null };
      else if (result === "retry-exhausted") ads = { status: "retry-exhausted", count: 0, code: "retry_exhausted" };
      else if (result === "error") ads = { status: "failed", count: 0, code: "report_unavailable" };
      else if (result === "manual") {
        const { syncGoogleAdsReport } = await import("./google-ads-service");
        ads = { status: "success", count: await syncGoogleAdsReport(30), code: null };
      } else {
        const [connection] = await database
          .select({ metadata: integrations.metadata })
          .from(integrations)
          .where(eq(integrations.key, "google-ads"))
          .limit(1);
        const metadata = (connection?.metadata ?? {}) as Record<string, unknown>;
        ads = { status: "success", count: Number(metadata.adsAutoLastRows) || 0, code: null };
      }
    } catch (error) {
      ads = { status: "failed", count: 0, code: errorCode(error, "ads") };
    }
  }
  const status =
    mail.status === "failed" || ads.status === "failed" || ads.status === "retry-exhausted" ? "failed" : "success";
  await database
    .update(integrationSyncRuns)
    .set({
      status,
      mailStatus: mail.status,
      mailCount: mail.count,
      mailErrorCode: mail.code,
      adsStatus: ads.status,
      adsCount: ads.count,
      adsErrorCode: ads.code,
      finishedAt: new Date(),
    })
    .where(eq(integrationSyncRuns.id, run.id));
  if (trigger === "scheduled")
    await database
      .delete(integrationSyncRuns)
      .where(lt(integrationSyncRuns.startedAt, new Date(Date.now() - 30 * 86_400_000)));
  return { id: run.id, status, mail, ads };
}

export async function getRecentIntegrationSyncRuns(limit = 6) {
  const database = getDatabase();
  if (!database) return [];
  return database.select().from(integrationSyncRuns).orderBy(desc(integrationSyncRuns.startedAt)).limit(limit);
}

export async function getLastScheduledIntegrationRun() {
  const database = getDatabase();
  if (!database) return null;
  const [run] = await database
    .select({ startedAt: integrationSyncRuns.startedAt })
    .from(integrationSyncRuns)
    .where(and(eq(integrationSyncRuns.trigger, "scheduled"), isNotNull(integrationSyncRuns.finishedAt)))
    .orderBy(desc(integrationSyncRuns.startedAt))
    .limit(1);
  return run?.startedAt ?? null;
}

export async function getActiveIntegrationSyncRun() {
  const database = getDatabase();
  if (!database) return null;
  const [run] = await database
    .select({
      id: integrationSyncRuns.id,
      trigger: integrationSyncRuns.trigger,
      startedAt: integrationSyncRuns.startedAt,
    })
    .from(integrationSyncRuns)
    .where(eq(integrationSyncRuns.status, "running"))
    .orderBy(desc(integrationSyncRuns.startedAt))
    .limit(1);
  return run ?? null;
}
