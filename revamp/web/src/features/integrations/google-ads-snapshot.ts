import "server-only";

import { and, asc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/lib/database/client";
import { googleAdsDailyReports, integrations } from "@/lib/database/schema";
import {
  googleAdsDataSource,
  googleAdsSnapshotToken,
  googleAdsSnapshotUrl,
  isGoogleAdsSnapshotConfigured,
} from "./google-ads-config";
import { adsDateInTimeZone, completeAdsRange } from "./google-ads-report-model";
import { validateGoogleAdsRange } from "./google-ads-service";

const snapshotDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const snapshotDecimal = z
  .string()
  .regex(/^\d+(?:\.\d+)?$/)
  .max(40);
const snapshotTimestamp = z.string().datetime({ offset: true });

const snapshotRowSchema = z
  .object({
    reportDate: snapshotDate,
    campaignId: z.string().regex(/^\d{1,20}$/),
    campaignName: z.string().min(1).max(255),
    status: z.string().min(1).max(40),
    currencyCode: z.string().regex(/^[A-Z]{3}$/),
    impressions: z.number().int().nonnegative(),
    clicks: z.number().int().nonnegative(),
    costMicros: z.string().regex(/^\d+$/).max(40),
    conversions: snapshotDecimal,
    conversionsValue: snapshotDecimal,
    syncedAt: snapshotTimestamp,
  })
  .strict();

export const googleAdsSnapshotPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: snapshotTimestamp,
    sourceLastSyncAt: snapshotTimestamp.nullable(),
    accountTimeZone: z.string().min(1).max(100),
    from: snapshotDate,
    to: snapshotDate,
    completeThrough: snapshotDate,
    rows: z.array(snapshotRowSchema).max(100_000),
  })
  .strict()
  .superRefine((value, context) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value.accountTimeZone }).format(new Date());
    } catch {
      context.addIssue({ code: "custom", message: "Zona waktu snapshot tidak valid.", path: ["accountTimeZone"] });
    }
    if (!validateGoogleAdsRange(value.from, value.to, value.accountTimeZone) || value.to > value.completeThrough)
      context.addIssue({ code: "custom", message: "Rentang snapshot tidak valid.", path: ["from"] });
    for (const [index, row] of value.rows.entries()) {
      if (row.reportDate < value.from || row.reportDate > value.to)
        context.addIssue({ code: "custom", message: "Baris berada di luar rentang snapshot.", path: ["rows", index] });
    }
  });

export type GoogleAdsSnapshotPayload = z.infer<typeof googleAdsSnapshotPayloadSchema>;

export class GoogleAdsSnapshotError extends Error {
  constructor(
    readonly code: "configuration" | "authorization" | "network" | "invalid-response" | "database",
    message: string,
  ) {
    super(message);
  }
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function createGoogleAdsSnapshot(from: string, to: string): Promise<GoogleAdsSnapshotPayload> {
  if (googleAdsDataSource() !== "live")
    throw new GoogleAdsSnapshotError("configuration", "Export snapshot hanya tersedia pada sumber laporan live.");
  const database = getDatabase();
  if (!database) throw new GoogleAdsSnapshotError("database", "Database laporan belum tersedia.");
  const [connection] = await database
    .select({ metadata: integrations.metadata, lastSyncAt: integrations.lastSyncAt })
    .from(integrations)
    .where(eq(integrations.key, "google-ads"))
    .limit(1);
  const metadata = metadataObject(connection?.metadata);
  const accountTimeZone =
    typeof metadata.adsAccountTimeZone === "string" ? metadata.adsAccountTimeZone : "Asia/Jakarta";
  const completeThrough = adsDateInTimeZone(accountTimeZone, 1);
  if (!validateGoogleAdsRange(from, to, accountTimeZone) || to > completeThrough)
    throw new GoogleAdsSnapshotError("invalid-response", "Rentang snapshot tidak valid.");
  const rows = await database
    .select()
    .from(googleAdsDailyReports)
    .where(and(gte(googleAdsDailyReports.reportDate, from), lte(googleAdsDailyReports.reportDate, to)))
    .orderBy(asc(googleAdsDailyReports.reportDate), asc(googleAdsDailyReports.campaignId));
  return googleAdsSnapshotPayloadSchema.parse({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceLastSyncAt: connection?.lastSyncAt?.toISOString() ?? null,
    accountTimeZone,
    from,
    to,
    completeThrough,
    rows: rows.map((row) => ({
      reportDate: row.reportDate,
      campaignId: row.campaignId,
      campaignName: row.campaignName,
      status: row.status,
      currencyCode: row.currencyCode,
      impressions: row.impressions,
      clicks: row.clicks,
      costMicros: row.costMicros,
      conversions: row.conversions,
      conversionsValue: row.conversionsValue,
      syncedAt: row.syncedAt.toISOString(),
    })),
  });
}

async function requestGoogleAdsSnapshot() {
  if (!isGoogleAdsSnapshotConfigured())
    throw new GoogleAdsSnapshotError("configuration", "Sumber snapshot production belum disiapkan.");
  const url = googleAdsSnapshotUrl();
  const token = googleAdsSnapshotToken();
  if (!url || !token) throw new GoogleAdsSnapshotError("configuration", "Sumber snapshot production belum disiapkan.");
  const { from, to } = completeAdsRange(90);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new GoogleAdsSnapshotError("network", "Server production belum dapat dihubungi.");
  }
  if (response.status === 401 || response.status === 403)
    throw new GoogleAdsSnapshotError("authorization", "Token snapshot production ditolak.");
  if (!response.ok) throw new GoogleAdsSnapshotError("network", "Snapshot production belum dapat diambil.");
  const raw = await response.text();
  if (raw.length > 20_000_000)
    throw new GoogleAdsSnapshotError("invalid-response", "Ukuran snapshot production tidak valid.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new GoogleAdsSnapshotError("invalid-response", "Respons snapshot production tidak valid.");
  }
  const payload = googleAdsSnapshotPayloadSchema.safeParse(parsed);
  if (!payload.success)
    throw new GoogleAdsSnapshotError("invalid-response", "Struktur snapshot production tidak valid.");
  if (payload.data.from !== from || payload.data.to !== to)
    throw new GoogleAdsSnapshotError("invalid-response", "Rentang snapshot production tidak sesuai permintaan.");
  return payload.data;
}

export async function importGoogleAdsSnapshot(actorId: string) {
  if (googleAdsDataSource() !== "snapshot")
    throw new GoogleAdsSnapshotError("configuration", "Import snapshot hanya tersedia pada mode snapshot.");
  const payload = await requestGoogleAdsSnapshot();
  const database = getDatabase();
  if (!database) throw new GoogleAdsSnapshotError("database", "Database lokal belum tersedia.");
  const importedAt = new Date();
  await database.transaction(async (transaction) => {
    await transaction
      .delete(googleAdsDailyReports)
      .where(
        and(gte(googleAdsDailyReports.reportDate, payload.from), lte(googleAdsDailyReports.reportDate, payload.to)),
      );
    if (payload.rows.length)
      await transaction.insert(googleAdsDailyReports).values(
        payload.rows.map((row) => ({
          ...row,
          syncedAt: new Date(row.syncedAt),
        })),
      );
    const [existing] = await transaction
      .select({ metadata: integrations.metadata })
      .from(integrations)
      .where(eq(integrations.key, "google-ads"))
      .limit(1);
    const metadata = {
      ...metadataObject(existing?.metadata),
      dataSource: "production-snapshot",
      snapshotSchemaVersion: payload.schemaVersion,
      snapshotGeneratedAt: payload.generatedAt,
      snapshotImportedAt: importedAt.toISOString(),
      snapshotSourceLastSyncAt: payload.sourceLastSyncAt,
      snapshotFrom: payload.from,
      snapshotTo: payload.to,
      snapshotCompleteThrough: payload.completeThrough,
      snapshotRows: payload.rows.length,
      adsAccountTimeZone: payload.accountTimeZone,
    };
    await transaction
      .insert(integrations)
      .values({
        key: "google-ads",
        status: "connected",
        metadata,
        lastSyncAt: payload.sourceLastSyncAt ? new Date(payload.sourceLastSyncAt) : importedAt,
        lastError: null,
        updatedBy: actorId,
      })
      .onConflictDoUpdate({
        target: integrations.key,
        set: {
          status: "connected",
          metadata,
          lastSyncAt: payload.sourceLastSyncAt ? new Date(payload.sourceLastSyncAt) : importedAt,
          lastError: null,
          updatedBy: actorId,
          updatedAt: importedAt,
        },
      });
  });
  return { rows: payload.rows.length, from: payload.from, to: payload.to };
}
