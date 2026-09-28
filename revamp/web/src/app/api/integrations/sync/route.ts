import { eq } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { syncGoogleAdsReport } from "@/features/integrations/google-ads-service";
import { syncMailbox } from "@/features/integrations/mail-service";
import { getDatabase } from "@/lib/database/client";
import { integrations } from "@/lib/database/schema";

export async function POST(request: Request) {
  const expected = process.env.INTEGRATIONS_CRON_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const expectedBytes = Buffer.from(expected ?? "");
  const suppliedBytes = Buffer.from(supplied);
  if (!expected || suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const results: Record<string, string | number> = {};
  try {
    const mail = await syncMailbox();
    results.emailSynced = mail.synced;
  } catch {
    results.email = "error";
  }
  try {
    const database = getDatabase();
    const [ads] = database
      ? await database
          .select({
            secretCiphertext: integrations.secretCiphertext,
            lastSyncAt: integrations.lastSyncAt,
            metadata: integrations.metadata,
          })
          .from(integrations)
          .where(eq(integrations.key, "google-ads"))
          .limit(1)
      : [];
    const metadata = (ads?.metadata ?? {}) as Record<string, unknown>;
    const lastAttempt = typeof metadata.lastAdsAttemptAt === "string" ? Date.parse(metadata.lastAdsAttemptAt) : NaN;
    const lastSuccessfulSync = ads?.lastSyncAt?.getTime() ?? 0;
    const lastAttemptAt = Number.isFinite(lastAttempt) ? lastAttempt : lastSuccessfulSync;
    if (ads?.secretCiphertext && Date.now() - lastAttemptAt > 6 * 60 * 60_000) {
      results.adsRows = await syncGoogleAdsReport(30);
    } else results.ads = ads ? "not-due" : "not-connected";
  } catch {
    results.ads = "error";
  }
  const failed = results.email === "error" || results.ads === "error";
  return NextResponse.json(
    { ok: !failed, ...results },
    { status: failed ? 207 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
