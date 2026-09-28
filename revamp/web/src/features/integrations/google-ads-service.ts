import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { getDatabase } from "@/lib/database/client";
import { googleAdsDailyReports, integrations } from "@/lib/database/schema";
import { decryptSecret } from "./secrets";

type GoogleSecret = { refreshToken: string };

export function adsDateInJakarta(daysAgo = 0) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return new Date(Date.UTC(year, month - 1, day - daysAgo)).toISOString().slice(0, 10);
}

export function isValidGoogleAdsDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateGoogleAdsRange(startDate: string, endDate: string) {
  if (!isValidGoogleAdsDate(startDate) || !isValidGoogleAdsDate(endDate) || startDate > endDate) return false;
  if (endDate > adsDateInJakarta()) return false;
  const days = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000 + 1;
  return days >= 1 && days <= 365;
}

async function accessToken() {
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  const [connection] = await database.select().from(integrations).where(eq(integrations.key, "google-ads")).limit(1);
  if (!connection?.secretCiphertext) throw new Error("Google Ads belum disambungkan.");
  const { refreshToken } = decryptSecret<GoogleSecret>(connection.secretCiphertext);
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Pengaturan OAuth Google Ads belum lengkap.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
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
  if (!response.ok) {
    await database
      .update(integrations)
      .set({ lastError: "Otorisasi Google Ads perlu diperbarui oleh administrator." })
      .where(and(eq(integrations.key, "google-ads"), isNotNull(integrations.secretCiphertext)));
    throw new Error("Sesi Google Ads perlu disambungkan ulang.");
  }
  return ((await response.json()) as { access_token: string }).access_token;
}

export async function syncGoogleAdsReport(days = 30) {
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error("Rentang laporan tidak valid.");
  return syncGoogleAdsReportRange(adsDateInJakarta(days - 1), adsDateInJakarta());
}

export async function syncGoogleAdsReportRange(startDate: string, endDate: string) {
  if (!validateGoogleAdsRange(startDate, endDate)) throw new Error("Rentang laporan tidak valid.");
  const database = getDatabase();
  const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || "6738895829").replaceAll("-", "");
  if (!database || !/^\d{10}$/.test(customerId)) throw new Error("Pengaturan API Google Ads belum lengkap.");
  const [connection] = await database
    .select({ metadata: integrations.metadata })
    .from(integrations)
    .where(and(eq(integrations.key, "google-ads"), isNotNull(integrations.secretCiphertext)))
    .limit(1);
  if (!connection) throw new Error("Google Ads belum disambungkan.");
  const metadata = (connection.metadata ?? {}) as Record<string, unknown>;
  await database
    .update(integrations)
    .set({ metadata: { ...metadata, lastAdsAttemptAt: new Date().toISOString() } })
    .where(and(eq(integrations.key, "google-ads"), isNotNull(integrations.secretCiphertext)));
  const token = await accessToken();
  const query = `SELECT segments.date, campaign.id, campaign.name, campaign.status, customer.currency_code, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN '${startDate}' AND '${endDate}' ORDER BY segments.date DESC`;
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
  if (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID)
    headers["login-customer-id"] = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID.replaceAll("-", "");
  const response = await fetch(`https://googleads.googleapis.com/v25/customers/${customerId}/googleAds:searchStream`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    await database
      .update(integrations)
      .set({
        lastError: `Google Ads menolak laporan (HTTP ${response.status}). Periksa akses akun dan konfigurasi API.`,
      })
      .where(and(eq(integrations.key, "google-ads"), isNotNull(integrations.secretCiphertext)));
    throw new Error(`Laporan Google Ads gagal (HTTP ${response.status}).`);
  }
  const stream = (await response.json()) as Array<{
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
    .set({ lastSyncAt: new Date(), lastError: null })
    .where(and(eq(integrations.key, "google-ads"), isNotNull(integrations.secretCiphertext)));
  return rows.length;
}

export async function getGoogleAdsOverview(startDate: string, endDate: string, campaignIds?: string[]) {
  const database = getDatabase();
  if (!database || !validateGoogleAdsRange(startDate, endDate)) return null;
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
