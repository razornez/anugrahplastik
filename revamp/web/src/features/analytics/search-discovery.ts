import { desc, eq } from "drizzle-orm";
import { getDatabase } from "@/lib/database/client";
import { growthMarketSignals, growthSearchDiscoveries, growthSerpUsage } from "@/lib/database/schema";
import { searchKeywords } from "./competitor-model";
import { futureMondaysInMonth } from "./market-signals";
import { monthKeyInJakarta, weekKeyInJakarta, type SeoAuditSnapshot } from "./seo-benchmark";
import { getLatestSeoAudit, monthlyLimit, searchKeyword } from "./seo-audit-service";

export type SearchDiscoveryResult = {
  keyword: string;
  relatedSearches: string[];
  relatedQuestions: string[];
  sourceUrl: string;
};

export type SearchDiscovery = { checkedAt: Date; results: SearchDiscoveryResult[] };

const discoveryKeywords = [searchKeywords[0], searchKeywords[3], searchKeywords[4]];

export function needsSupplementalDiscovery(audit: SeoAuditSnapshot | null, now: Date) {
  // New organic audits already save related searches/questions (even when empty).
  // Supplemental searches are only a one-time backfill for this week's legacy audit.
  return Boolean(
    audit &&
    weekKeyInJakarta(audit.checkedAt) === weekKeyInJakarta(now) &&
    !audit.results.some((result) => Array.isArray(result.relatedSearches) || Array.isArray(result.relatedQuestions)),
  );
}

export function reservedSearches(now: Date, trendAttemptedThisWeek = false) {
  // Keep every remaining Monday's six-keyword audit, one retry, and one Trends request.
  return futureMondaysInMonth(now) * searchKeywords.length + 1 + Number(!trendAttemptedThisWeek);
}

async function marketAttemptedThisWeek(now: Date) {
  const database = getDatabase();
  if (!database) return false;
  const [row] = await database
    .select({ status: growthMarketSignals.status })
    .from(growthMarketSignals)
    .where(eq(growthMarketSignals.weekKey, weekKeyInJakarta(now)))
    .limit(1);
  return Boolean(row);
}

export async function getDiscoveryBudget(now = new Date()) {
  const database = getDatabase();
  if (!database) return null;
  try {
    const [usage, trendAttempted] = await Promise.all([
      database
        .select({ used: growthSerpUsage.used })
        .from(growthSerpUsage)
        .where(eq(growthSerpUsage.monthKey, monthKeyInJakarta(now)))
        .limit(1),
      marketAttemptedThisWeek(now),
    ]);
    const used = usage[0]?.used ?? 0;
    return {
      used,
      limit: monthlyLimit,
      available: Math.max(0, monthlyLimit - used - reservedSearches(now, trendAttempted)),
    };
  } catch {
    return null;
  }
}

export async function getLatestSearchDiscovery() {
  const database = getDatabase();
  if (!database)
    return { discovery: null as SearchDiscovery | null, status: "unavailable", error: null as string | null };
  try {
    const [complete, latest] = await Promise.all([
      database
        .select()
        .from(growthSearchDiscoveries)
        .where(eq(growthSearchDiscoveries.status, "complete"))
        .orderBy(desc(growthSearchDiscoveries.checkedAt))
        .limit(1),
      database.select().from(growthSearchDiscoveries).orderBy(desc(growthSearchDiscoveries.startedAt)).limit(1),
    ]);
    return {
      discovery: complete[0]?.checkedAt
        ? { checkedAt: complete[0].checkedAt, results: complete[0].results as SearchDiscoveryResult[] }
        : null,
      status: latest[0]?.status ?? "missing",
      error: ["failed", "skipped"].includes(latest[0]?.status ?? "") ? latest[0].error : null,
    };
  } catch {
    return { discovery: null as SearchDiscovery | null, status: "unavailable", error: null as string | null };
  }
}

export async function runSearchDiscovery(now = new Date()) {
  const database = getDatabase();
  if (!database || !process.env.SERPAPI_API_KEY)
    throw new Error("Pemeriksaan belum tersedia; periksa koneksi database dan SerpApi.");
  const weekKey = weekKeyInJakarta(now);
  const [previous] = await database
    .select({ status: growthSearchDiscoveries.status })
    .from(growthSearchDiscoveries)
    .where(eq(growthSearchDiscoveries.weekKey, weekKey))
    .limit(1);
  if (previous)
    return previous.status === "complete"
      ? ("existing" as const)
      : previous.status === "running"
        ? ("running" as const)
        : ("failed" as const);
  const latestAudit = await getLatestSeoAudit();
  if (!needsSupplementalDiscovery(latestAudit.audit, now)) return "not_needed" as const;
  const [inserted] = await database
    .insert(growthSearchDiscoveries)
    .values({ weekKey, status: "running", startedAt: now })
    .onConflictDoNothing()
    .returning({ id: growthSearchDiscoveries.id });
  if (!inserted) {
    const [existing] = await database
      .select({ status: growthSearchDiscoveries.status })
      .from(growthSearchDiscoveries)
      .where(eq(growthSearchDiscoveries.weekKey, weekKey))
      .limit(1);
    return existing?.status === "complete"
      ? ("existing" as const)
      : existing?.status === "running"
        ? ("running" as const)
        : ("failed" as const);
  }
  try {
    const results: SearchDiscoveryResult[] = [];
    const trendAttempted = await marketAttemptedThisWeek(now);
    const budget = await getDiscoveryBudget(now);
    if (!budget || budget.available < discoveryKeywords.length) {
      await database
        .update(growthSearchDiscoveries)
        .set({
          status: "skipped",
          error: "Jatah pemeriksaan tambahan belum cukup untuk tiga frasa. Audit peringkat tetap diprioritaskan.",
        })
        .where(eq(growthSearchDiscoveries.id, inserted.id));
      return "skipped" as const;
    }
    for (const keyword of discoveryKeywords) {
      const found = await searchKeyword(keyword, [], monthKeyInJakarta(now), reservedSearches(now, trendAttempted));
      results.push({
        keyword,
        relatedSearches: found.relatedSearches ?? [],
        relatedQuestions: found.relatedQuestions ?? [],
        sourceUrl: `https://www.google.com/search?q=${encodeURIComponent(keyword)}`,
      });
      await database
        .update(growthSearchDiscoveries)
        .set({ results })
        .where(eq(growthSearchDiscoveries.id, inserted.id));
    }
    await database
      .update(growthSearchDiscoveries)
      .set({ status: "complete", checkedAt: new Date(), error: null })
      .where(eq(growthSearchDiscoveries.id, inserted.id));
    return "complete" as const;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "Pemeriksaan pencarian gagal.";
    await database
      .update(growthSearchDiscoveries)
      .set({ status: "failed", error: message })
      .where(eq(growthSearchDiscoveries.id, inserted.id));
    return "failed" as const;
  }
}
