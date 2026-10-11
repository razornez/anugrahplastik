import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { getDatabase } from "@/lib/database/client";
import { growthCompetitorSettings, growthSeoAudits } from "@/lib/database/schema";
import { defaultCompetitors, ownDomain, searchKeywords, type Competitor } from "./competitor-model";
import { inspectSeoPage } from "./seo-page-crawler";
import {
  monthKeyInJakarta,
  seoCategories,
  weekKeyInJakarta,
  type PageObservation,
  type SeoAuditSnapshot,
  type SeoResult,
} from "./seo-benchmark";

export const monthlyLimit = 40;

export function canReserveSearch(used: number, reservedForOtherSearches = 0) {
  return used < monthlyLimit - reservedForOtherSearches;
}

export async function getLatestSeoAudit() {
  const database = getDatabase();
  if (!database)
    return { available: false, audit: null as SeoAuditSnapshot | null, error: null as string | null, stale: false };
  try {
    const [completed, latest] = await Promise.all([
      database
        .select()
        .from(growthSeoAudits)
        .where(eq(growthSeoAudits.status, "complete"))
        .orderBy(desc(growthSeoAudits.checkedAt))
        .limit(1),
      database.select().from(growthSeoAudits).orderBy(desc(growthSeoAudits.startedAt)).limit(1),
    ]);
    const row = completed[0];
    return {
      available: true,
      audit:
        row?.checkedAt && row.results
          ? {
              id: row.id,
              checkedAt: row.checkedAt,
              competitors: row.competitors as Competitor[],
              results: row.results as SeoResult[],
              pages: (row.pages as PageObservation[] | null) ?? [],
            }
          : null,
      error: latest[0]?.status === "failed" ? latest[0].error : null,
      stale: row?.checkedAt ? Date.now() - row.checkedAt.getTime() > 7 * 24 * 60 * 60 * 1000 : false,
    };
  } catch {
    return { available: false, audit: null as SeoAuditSnapshot | null, error: null as string | null, stale: false };
  }
}

export async function reserveSearch(monthKey: string, reservedForOrganic = 0) {
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  return database.transaction(async (tx) => {
    await tx.execute(
      sql`INSERT INTO growth_serp_usage (month_key, used) VALUES (${monthKey}, 0) ON CONFLICT DO NOTHING`,
    );
    const result = await tx.execute(sql`SELECT used FROM growth_serp_usage WHERE month_key = ${monthKey} FOR UPDATE`);
    const used = Number(result.rows[0]?.used ?? monthlyLimit);
    if (!canReserveSearch(used, reservedForOrganic))
      throw new Error("Jatah riset bulan ini disimpan untuk audit peringkat. Tidak ada permintaan tambahan.");
    await tx.execute(sql`UPDATE growth_serp_usage SET used = used + 1 WHERE month_key = ${monthKey}`);
    return used + 1;
  });
}

export async function searchKeyword(
  keyword: string,
  domains: string[],
  month: string,
  reservedForOtherSearches = 0,
): Promise<SeoResult> {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) throw new Error("SERPAPI_API_KEY belum tersedia dalam konfigurasi privat.");
  await reserveSearch(month, reservedForOtherSearches);
  const url = new URL("https://serpapi.com/search.json");
  url.search = new URLSearchParams({
    engine: "google",
    q: keyword,
    location: "Bandung, West Java, Indonesia",
    gl: "id",
    hl: "id",
    device: "desktop",
    num: "10",
    api_key: key,
  }).toString();
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`SerpApi menolak pemeriksaan (HTTP ${response.status}).`);
  const data = (await response.json()) as {
    error?: string;
    search_metadata?: { status?: string };
    organic_results?: { position?: number; link?: string; title?: string; snippet?: string }[];
    related_searches?: { query?: string }[];
    related_questions?: { question?: string }[];
    ads?: { title?: string; link?: string; displayed_link?: string }[];
  };
  if (data.error || data.search_metadata?.status !== "Success" || !Array.isArray(data.organic_results))
    throw new Error("Hasil SerpApi belum lengkap; audit tidak diterbitkan.");
  const positions: Record<string, number | null> = Object.fromEntries(domains.map((domain) => [domain, null]));
  const links: Record<string, string | null> = Object.fromEntries(domains.map((domain) => [domain, null]));
  const titles: Record<string, string | null> = Object.fromEntries(domains.map((domain) => [domain, null]));
  const snippets: Record<string, string | null> = Object.fromEntries(domains.map((domain) => [domain, null]));
  for (const result of data.organic_results) {
    if (!result.link || !Number.isInteger(result.position) || result.position! < 1 || result.position! > 10) continue;
    let host: string;
    try {
      host = new URL(result.link).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      continue;
    }
    const matched = domains.find((domain) => host === domain || host.endsWith(`.${domain}`));
    if (matched && positions[matched] == null) {
      positions[matched] = result.position!;
      links[matched] = result.link;
      titles[matched] = result.title?.slice(0, 180) ?? null;
      snippets[matched] = result.snippet?.slice(0, 240) ?? null;
    }
  }
  const relatedSearches =
    data.related_searches
      ?.flatMap((item) => (item.query?.trim() ? [item.query.trim().slice(0, 140)] : []))
      .slice(0, 8) ?? [];
  const relatedQuestions =
    data.related_questions
      ?.flatMap((item) => (item.question?.trim() ? [item.question.trim().slice(0, 180)] : []))
      .slice(0, 6) ?? [];
  const visibleAds =
    data.ads
      ?.flatMap((item) => {
        if (!item.title?.trim()) return [];
        let domain = item.displayed_link?.trim().slice(0, 100) ?? "";
        try {
          if (item.link) domain = new URL(item.link).hostname.replace(/^www\./, "");
        } catch {
          /* Keep the displayed domain. */
        }
        return [
          {
            title: item.title.trim().slice(0, 180),
            domain,
            link: item.link?.startsWith("https://") ? item.link.slice(0, 500) : null,
          },
        ];
      })
      .slice(0, 5) ?? [];
  return { keyword, positions, links, titles, snippets, relatedSearches, relatedQuestions, visibleAds };
}

export async function runSeoAudit(
  now = new Date(),
): Promise<{ status: "complete" | "existing" | "running"; id: string }> {
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  if (!process.env.SERPAPI_API_KEY) throw new Error("SerpApi belum terhubung. Isi API key di konfigurasi privat.");
  const week = weekKeyInJakarta(now);
  const month = monthKeyInJakarta(now);
  const [settings] = await database
    .select({ competitors: growthCompetitorSettings.competitors })
    .from(growthCompetitorSettings)
    .limit(1);
  let competitors = (settings?.competitors as Competitor[] | undefined) ?? [...defaultCompetitors];
  let results: SeoResult[] = [];
  let pages: PageObservation[] = [];
  const [inserted] = await database
    .insert(growthSeoAudits)
    .values({ weekKey: week, status: "running", competitors, startedAt: now })
    .onConflictDoNothing()
    .returning({ id: growthSeoAudits.id });
  let id = inserted?.id;
  if (!id) {
    const [existing] = await database.select().from(growthSeoAudits).where(eq(growthSeoAudits.weekKey, week)).limit(1);
    if (!existing) throw new Error("Audit tidak dapat dimulai.");
    if (existing.status === "complete") return { status: "existing", id: existing.id };
    if (existing.status === "running" && now.getTime() - existing.startedAt.getTime() < 20 * 60_000)
      return { status: "running", id: existing.id };
    competitors = existing.competitors as Competitor[];
    results = (existing.results as SeoResult[] | null) ?? [];
    pages = (existing.pages as PageObservation[] | null) ?? [];
    const [retried] = await database
      .update(growthSeoAudits)
      .set({ status: "running", error: null, startedAt: now })
      .where(
        and(
          eq(growthSeoAudits.weekKey, week),
          or(
            eq(growthSeoAudits.status, "failed"),
            and(
              eq(growthSeoAudits.status, "running"),
              lt(growthSeoAudits.startedAt, new Date(now.getTime() - 20 * 60_000)),
            ),
          ),
        ),
      )
      .returning({ id: growthSeoAudits.id });
    if (!retried) return { status: "running", id: existing.id };
    id = retried.id;
  }
  const domains = [ownDomain, ...competitors.map((item) => item.domain)];
  try {
    for (const keyword of searchKeywords) {
      if (results.some((result) => result.keyword === keyword)) continue;
      results.push(await searchKeyword(keyword, domains, month));
      await database
        .update(growthSeoAudits)
        .set({ results })
        .where(
          and(eq(growthSeoAudits.id, id), eq(growthSeoAudits.startedAt, now), eq(growthSeoAudits.status, "running")),
        );
    }
    for (const domain of domains) {
      for (const category of ["jasa", "spacer"] as const) {
        if (pages.some((page) => page.domain === domain && page.category === category)) continue;
        const keywords = seoCategories.find((item) => item.key === category)!.keywords;
        const relevant = results.filter((item) => keywords.some((keyword) => keyword === item.keyword));
        const ranked = relevant.find((item) => item.links[domain])?.links[domain] ?? null;
        pages.push(await inspectSeoPage(domain, category, ranked));
        await database
          .update(growthSeoAudits)
          .set({ pages })
          .where(
            and(eq(growthSeoAudits.id, id), eq(growthSeoAudits.startedAt, now), eq(growthSeoAudits.status, "running")),
          );
      }
    }
    const [published] = await database
      .update(growthSeoAudits)
      .set({ status: "complete", checkedAt: new Date(), results, pages, error: null })
      .where(and(eq(growthSeoAudits.id, id), eq(growthSeoAudits.startedAt, now), eq(growthSeoAudits.status, "running")))
      .returning({ id: growthSeoAudits.id });
    if (!published) return { status: "running", id };
    return { status: "complete", id };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "Pemeriksaan gagal.";
    await database
      .update(growthSeoAudits)
      .set({ status: "failed", error: message })
      .where(
        and(eq(growthSeoAudits.id, id), eq(growthSeoAudits.startedAt, now), eq(growthSeoAudits.status, "running")),
      );
    throw new Error(message);
  }
}
