import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { getDatabase } from "@/lib/database/client";
import { googleAdsDailyReports, integrations } from "@/lib/database/schema";
import { adsDateInJakarta, adsDateInTimeZone, completeAdsRange } from "./google-ads-report-model";
import { decryptSecret } from "./secrets";
import {
  googleAdsCustomerId,
  googleAdsDeveloperToken,
  googleAdsLoginCustomerId,
  isGoogleAdsReportingConfigured,
} from "./google-ads-config";

type GoogleSecret = { refreshToken: string };

export type GoogleAdsApiErrorCode =
  | "authorization"
  | "oauth_configuration"
  | "oauth_network"
  | "developer_token"
  | "cloud_project"
  | "manager_link"
  | "customer_access"
  | "api_access"
  | "timeout"
  | "report_unavailable"
  | "probe_required";

export class GoogleAdsServiceError extends Error {
  constructor(
    readonly code: GoogleAdsApiErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export { adsDateInJakarta };

export function isValidGoogleAdsDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateGoogleAdsRange(startDate: string, endDate: string, timeZone = "Asia/Jakarta") {
  if (!isValidGoogleAdsDate(startDate) || !isValidGoogleAdsDate(endDate) || startDate > endDate) return false;
  if (endDate > adsDateInTimeZone(timeZone)) return false;
  const days = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000 + 1;
  return days >= 1 && days <= 365;
}

function safeGoogleAdsErrorMessage(code: GoogleAdsApiErrorCode, status?: number) {
  switch (code) {
    case "authorization":
      return "Otorisasi Google Ads sudah tidak berlaku. Sambungkan ulang akun Google owner.";
    case "oauth_configuration":
      return "Konfigurasi OAuth Google Ads di server belum dapat digunakan.";
    case "oauth_network":
      return "Server belum dapat menghubungi layanan OAuth Google. Coba lagi nanti.";
    case "developer_token":
      return "Developer Token Google Ads belum tersedia atau ditolak. Lengkapi akses API pada project yang benar.";
    case "cloud_project":
      return "Project Google Cloud belum memiliki akses Google Ads API yang diperlukan.";
    case "manager_link":
      return "MCC belum dapat mengakses akun iklan. Periksa penautan akun dan MCC Login Customer ID.";
    case "customer_access":
      return "Akun Google yang disambungkan belum memiliki akses ke Customer ID laporan.";
    case "api_access":
      return "Google Ads menolak akses API. Periksa project Google Cloud, MCC, dan izin akun.";
    case "timeout":
      return "Google Ads tidak merespons dalam batas waktu. Data tersimpan tetap tersedia; coba lagi nanti.";
    case "probe_required":
      return "Verifikasi akses API diperlukan sebelum laporan diperbarui.";
    default:
      return `Pembaruan laporan Google Ads gagal${status ? ` (HTTP ${status})` : ""}. Data tersimpan tetap tersedia.`;
  }
}

function classifyGoogleAdsFailure(status: number, payload: string): GoogleAdsApiErrorCode {
  const detail = payload.toLowerCase();
  if (/developer.?token|developer_token/.test(detail)) return "developer_token";
  if (/cloud_project_not_approved_for_production|cloud project/.test(detail)) return "cloud_project";
  if (/manager|login.customer|customer_client/.test(detail)) return "manager_link";
  if (/customer.*(not found|not enabled)|user_permission_denied|authorization_error/.test(detail))
    return "customer_access";
  if (status === 401 || status === 403) return "api_access";
  if (status === 408 || status === 429 || status >= 500) return "report_unavailable";
  return "report_unavailable";
}

async function updateGoogleAdsFailure(code: GoogleAdsApiErrorCode, message: string) {
  const database = getDatabase();
  if (!database) return;
  const now = new Date().toISOString();
  await database
    .update(integrations)
    .set({
      lastError: message,
      metadata: sql`jsonb_set(jsonb_set(jsonb_set(jsonb_set(coalesce(${integrations.metadata}, '{}'::jsonb), '{lastErrorCode}', ${JSON.stringify(code)}::jsonb, true), '{lastAdsAttemptAt}', to_jsonb(${now}::text), true), '{lastAdsResult}', '"failed"'::jsonb, true), '{lastAdsErrorAt}', to_jsonb(${now}::text), true)`,
    })
    .where(and(eq(integrations.key, "google-ads"), isNotNull(integrations.secretCiphertext)));
}

async function accessToken() {
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  const [connection] = await database.select().from(integrations).where(eq(integrations.key, "google-ads")).limit(1);
  if (!connection?.secretCiphertext) throw new Error("Google Ads belum disambungkan.");
  const { refreshToken } = decryptSecret<GoogleSecret>(connection.secretCiphertext);
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    throw new GoogleAdsServiceError("oauth_configuration", "Pengaturan OAuth Google Ads belum lengkap.");
  let response: Response;
  try {
    response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    const message = safeGoogleAdsErrorMessage("oauth_network");
    await updateGoogleAdsFailure("oauth_network", message);
    throw new GoogleAdsServiceError("oauth_network", message);
  }
  if (!response.ok) {
    const body = await response.text();
    const code = /invalid_grant|invalid_token|unauthorized_client/.test(body.toLowerCase())
      ? "authorization"
      : "oauth_configuration";
    const message = safeGoogleAdsErrorMessage(code);
    await updateGoogleAdsFailure(code, message);
    throw new GoogleAdsServiceError(code, message);
  }
  const accessToken = ((await response.json()) as { access_token?: string }).access_token;
  if (!accessToken) {
    const message = safeGoogleAdsErrorMessage("authorization");
    await updateGoogleAdsFailure("authorization", message);
    throw new GoogleAdsServiceError("authorization", message);
  }
  return accessToken;
}

async function queryGoogleAdsApi(query: string, suppliedAccessToken?: string) {
  const customerId = googleAdsCustomerId();
  const managerId = googleAdsLoginCustomerId();
  const developerToken = googleAdsDeveloperToken();
  if (!isGoogleAdsReportingConfigured() || !customerId || !managerId || !developerToken)
    throw new GoogleAdsServiceError(
      "developer_token",
      "Pengaturan laporan Google Ads belum lengkap. Lengkapi Developer Token, Customer ID, dan MCC Login Customer ID.",
    );
  const token = suppliedAccessToken ?? (await accessToken());
  let response: Response;
  try {
    response = await fetch(`https://googleads.googleapis.com/v25/customers/${customerId}/googleAds:searchStream`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "developer-token": developerToken,
        "login-customer-id": managerId,
      },
      body: JSON.stringify({ query }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    const code = error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : "report_unavailable";
    const message = safeGoogleAdsErrorMessage(code);
    await updateGoogleAdsFailure(code, message);
    throw new GoogleAdsServiceError(code, message);
  }
  if (!response.ok) {
    const payload = await response.text();
    const code = classifyGoogleAdsFailure(response.status, payload);
    const message = safeGoogleAdsErrorMessage(code, response.status);
    await updateGoogleAdsFailure(code, message);
    throw new GoogleAdsServiceError(code, message);
  }
  return response.json();
}

/**
 * Validates OAuth, Cloud-project access, MCC linkage, and target-account access
 * without writing report rows. It is deliberately admin-triggered only.
 */
export async function probeGoogleAdsReporting() {
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  try {
    const stream = await queryGoogleAdsApi(
      "SELECT customer.id, customer.descriptive_name, customer.time_zone FROM customer LIMIT 1",
    );
    const customer = extractProbeCustomer(stream);
    await database
      .update(integrations)
      .set({
        lastError: null,
        metadata: sql`jsonb_set(jsonb_set(jsonb_set(jsonb_set(coalesce(${integrations.metadata}, '{}'::jsonb), '{lastProbeAt}', to_jsonb(${new Date().toISOString()}::text), true), '{lastProbeCode}', '"success"'::jsonb, true), '{adsAccountTimeZone}', to_jsonb(${customer.timeZone}::text), true), '{adsAccountName}', to_jsonb(${customer.name}::text), true) - 'lastErrorCode'`,
      })
      .where(and(eq(integrations.key, "google-ads"), isNotNull(integrations.secretCiphertext)));
    return customer;
  } catch (error) {
    const code = error instanceof GoogleAdsServiceError ? error.code : "report_unavailable";
    await database
      .update(integrations)
      .set({
        metadata: sql`jsonb_set(jsonb_set(coalesce(${integrations.metadata}, '{}'::jsonb), '{lastProbeAt}', to_jsonb(${new Date().toISOString()}::text), true), '{lastProbeCode}', ${JSON.stringify(code)}::jsonb, true)`,
      })
      .where(and(eq(integrations.key, "google-ads"), isNotNull(integrations.secretCiphertext)));
    throw error;
  }
}

type GoogleAdsProbeCustomer = { id: string; name: string; timeZone: string };

function extractProbeCustomer(stream: unknown): GoogleAdsProbeCustomer {
  const chunk = Array.isArray(stream) ? stream[0] : null;
  const result =
    chunk && typeof chunk === "object" && "results" in chunk && Array.isArray(chunk.results) ? chunk.results[0] : null;
  const customer = result && typeof result === "object" && "customer" in result ? result.customer : null;
  if (!customer || typeof customer !== "object")
    throw new GoogleAdsServiceError("report_unavailable", "Google Ads tidak mengembalikan identitas akun laporan.");
  const value = customer as { id?: string; descriptiveName?: string; timeZone?: string };
  const timeZone = value.timeZone?.trim();
  if (!value.id || !timeZone)
    throw new GoogleAdsServiceError("report_unavailable", "Google Ads tidak mengembalikan zona waktu akun laporan.");
  return { id: value.id, name: value.descriptiveName?.trim() || "Akun Google Ads", timeZone };
}

/** Validates a newly issued OAuth access token before its refresh token replaces the previous one. */
export async function verifyGoogleAdsAccessToken(accessToken: string) {
  return extractProbeCustomer(
    await queryGoogleAdsApi(
      "SELECT customer.id, customer.descriptive_name, customer.time_zone FROM customer LIMIT 1",
      accessToken,
    ),
  );
}

export function isFreshGoogleAdsProbe(metadata: Record<string, unknown>, now = new Date()) {
  if (metadata.lastProbeCode !== "success" || typeof metadata.lastProbeAt !== "string") return false;
  const timestamp = Date.parse(metadata.lastProbeAt);
  return Number.isFinite(timestamp) && now.getTime() - timestamp <= 36 * 60 * 60_000;
}

export async function syncGoogleAdsReport(days = 30, timeZone = "Asia/Jakarta") {
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error("Rentang laporan tidak valid.");
  const { from, to } = completeAdsRange(days, new Date(), timeZone);
  return syncGoogleAdsReportRange(from, to, timeZone);
}

export async function syncGoogleAdsReportRange(startDate: string, endDate: string, timeZone = "Asia/Jakarta") {
  if (!validateGoogleAdsRange(startDate, endDate, timeZone)) throw new Error("Rentang laporan tidak valid.");
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  const [connection] = await database
    .select({ key: integrations.key })
    .from(integrations)
    .where(and(eq(integrations.key, "google-ads"), isNotNull(integrations.secretCiphertext)))
    .limit(1);
  if (!connection) throw new Error("Google Ads belum disambungkan.");
  const [stored] = await database
    .select({ metadata: integrations.metadata })
    .from(integrations)
    .where(eq(integrations.key, "google-ads"))
    .limit(1);
  if (!isFreshGoogleAdsProbe((stored?.metadata ?? {}) as Record<string, unknown>)) {
    const message = safeGoogleAdsErrorMessage("probe_required");
    await updateGoogleAdsFailure("probe_required", message);
    throw new GoogleAdsServiceError("probe_required", message);
  }
  await database
    .update(integrations)
    .set({
      metadata: sql`jsonb_set(coalesce(${integrations.metadata}, '{}'::jsonb), '{lastAdsAttemptAt}', to_jsonb(${new Date().toISOString()}::text), true)`,
    })
    .where(and(eq(integrations.key, "google-ads"), isNotNull(integrations.secretCiphertext)));
  const query = `SELECT segments.date, campaign.id, campaign.name, campaign.status, customer.currency_code, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN '${startDate}' AND '${endDate}' ORDER BY segments.date DESC`;
  const stream = (await queryGoogleAdsApi(query)) as Array<{
    results?: Array<{
      campaign: { id: string; name: string; status: string };
      customer: { currencyCode: string };
      segments: { date: string };
      metrics: {
        impressions: string;
        clicks: string;
        costMicros: string;
        conversions: number;
        conversionsValue: number;
      };
    }>;
  }>;
  const rows = stream
    .flatMap((chunk) => chunk.results ?? [])
    .map((item) => ({
      reportDate: item.segments.date,
      campaignId: item.campaign.id,
      campaignName: item.campaign.name,
      status: item.campaign.status,
      currencyCode: item.customer.currencyCode,
      impressions: Number(item.metrics.impressions),
      clicks: Number(item.metrics.clicks),
      costMicros: item.metrics.costMicros,
      conversions: String(item.metrics.conversions),
      conversionsValue: String(item.metrics.conversionsValue ?? 0),
      syncedAt: new Date(),
    }));
  if (rows.length)
    await database.transaction(async (tx) => {
      for (const row of rows)
        await tx
          .insert(googleAdsDailyReports)
          .values(row)
          .onConflictDoUpdate({
            target: [googleAdsDailyReports.reportDate, googleAdsDailyReports.campaignId],
            set: { ...row },
          });
    });
  await database
    .update(integrations)
    .set({
      lastSyncAt: new Date(),
      lastError: null,
      metadata: sql`jsonb_set(jsonb_set(coalesce(${integrations.metadata}, '{}'::jsonb) - 'lastErrorCode', '{lastAdsResult}', ${JSON.stringify(rows.length ? "success" : "empty")}::jsonb, true), '{lastAdsRows}', to_jsonb(${rows.length}::integer), true)`,
    })
    .where(and(eq(integrations.key, "google-ads"), isNotNull(integrations.secretCiphertext)));
  return rows.length;
}

export async function syncGoogleAdsOncePerJakartaDay(now = new Date()) {
  const database = getDatabase();
  if (!database) return "not-connected" as const;
  const today = adsDateInJakarta(0, now);
  const attemptAt = now.toISOString();
  const [previous] = await database
    .select({ metadata: integrations.metadata })
    .from(integrations)
    .where(eq(integrations.key, "google-ads"))
    .limit(1);
  const previousMetadata = (previous?.metadata ?? {}) as Record<string, unknown>;
  if (!isFreshGoogleAdsProbe(previousMetadata, now)) {
    const message = safeGoogleAdsErrorMessage("probe_required");
    await updateGoogleAdsFailure("probe_required", message);
    return "probe-required" as const;
  }
  if (previousMetadata.adsAutoFailureDate === today && Number(previousMetadata.adsAutoFailureCount) >= 3)
    return "retry-exhausted" as const;
  const [claimed] = await database
    .update(integrations)
    .set({
      metadata: sql`jsonb_set(jsonb_set(coalesce(${integrations.metadata}, '{}'::jsonb), '{adsAutoAttemptDate}', to_jsonb(${today}::text), true), '{adsAutoAttemptAt}', to_jsonb(${attemptAt}::text), true)`,
    })
    .where(
      and(
        eq(integrations.key, "google-ads"),
        isNotNull(integrations.secretCiphertext),
        sql`coalesce(${integrations.metadata}->>'adsAutoSuccessDate', '') <> ${today}`,
        sql`(coalesce(${integrations.metadata}->>'adsAutoFailureDate', '') <> ${today} or coalesce((${integrations.metadata}->>'adsAutoFailureCount')::integer, 0) < 3)`,
        sql`coalesce(${integrations.metadata}->>'adsAutoAttemptAt', '') = '' or (${integrations.metadata}->>'adsAutoAttemptAt')::timestamptz <= ${new Date(now.getTime() - 15 * 60_000)}`,
      ),
    )
    .returning({ key: integrations.key });
  if (!claimed) {
    const [connection] = await database
      .select({ metadata: integrations.metadata })
      .from(integrations)
      .where(eq(integrations.key, "google-ads"))
      .limit(1);
    const metadata = (connection?.metadata ?? {}) as Record<string, unknown>;
    if (metadata.adsAutoFailureDate === today && Number(metadata.adsAutoFailureCount) >= 3)
      return "retry-exhausted" as const;
    return "not-due" as const;
  }
  try {
    const accountTimeZone =
      typeof previousMetadata.adsAccountTimeZone === "string" ? previousMetadata.adsAccountTimeZone : "Asia/Jakarta";
    const { from, to } = completeAdsRange(30, now, accountTimeZone);
    const rows = await syncGoogleAdsReportRange(from, to, accountTimeZone);
    await database
      .update(integrations)
      .set({
        metadata: sql`jsonb_set(jsonb_set(coalesce(${integrations.metadata}, '{}'::jsonb), '{adsAutoSuccessDate}', to_jsonb(${today}::text), true), '{adsAutoLastRows}', to_jsonb(${rows}::integer), true)`,
      })
      .where(eq(integrations.key, "google-ads"));
    return "updated" as const;
  } catch (error) {
    const code = error instanceof GoogleAdsServiceError ? error.code : "report_unavailable";
    await database
      .update(integrations)
      .set({
        metadata: sql`jsonb_set(jsonb_set(jsonb_set(coalesce(${integrations.metadata}, '{}'::jsonb), '{adsAutoFailureDate}', to_jsonb(${today}::text), true), '{adsAutoFailureCount}', to_jsonb(case when coalesce(${integrations.metadata}->>'adsAutoFailureDate', '') = ${today} then coalesce((${integrations.metadata}->>'adsAutoFailureCount')::integer, 0) + 1 else 1 end), true), '{adsAutoLastCode}', ${JSON.stringify(code)}::jsonb, true)`,
      })
      .where(eq(integrations.key, "google-ads"));
    return "error" as const;
  }
}

export async function getGoogleAdsOverview(
  startDate: string,
  endDate: string,
  campaignIds?: string[],
  timeZone = "Asia/Jakarta",
) {
  const database = getDatabase();
  if (!database || !validateGoogleAdsRange(startDate, endDate, timeZone)) return null;
  const filters = [gte(googleAdsDailyReports.reportDate, startDate), lte(googleAdsDailyReports.reportDate, endDate)];
  if (campaignIds?.length) filters.push(inArray(googleAdsDailyReports.campaignId, campaignIds));
  const rows = await database
    .select()
    .from(googleAdsDailyReports)
    .where(and(...filters))
    .orderBy(asc(googleAdsDailyReports.reportDate), asc(googleAdsDailyReports.campaignId));
  const totals = rows.reduce(
    (result, row) => ({
      impressions: result.impressions + row.impressions,
      clicks: result.clicks + row.clicks,
      costMicros: result.costMicros + BigInt(row.costMicros),
      conversions: result.conversions + Number(row.conversions),
      conversionValue: result.conversionValue + Number(row.conversionsValue),
    }),
    { impressions: 0, clicks: 0, costMicros: BigInt("0"), conversions: 0, conversionValue: 0 },
  );
  return {
    rows,
    currencyCode: rows[0]?.currencyCode ?? "IDR",
    totals: { ...totals, cost: Number(totals.costMicros) / 1_000_000 },
  };
}

export async function getGoogleAdsCampaigns() {
  const database = getDatabase();
  if (!database) return [];
  return database
    .selectDistinctOn([googleAdsDailyReports.campaignId], {
      id: googleAdsDailyReports.campaignId,
      name: googleAdsDailyReports.campaignName,
      status: googleAdsDailyReports.status,
    })
    .from(googleAdsDailyReports)
    .orderBy(asc(googleAdsDailyReports.campaignId), desc(googleAdsDailyReports.reportDate));
}
