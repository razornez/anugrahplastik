import { desc, eq } from "drizzle-orm";
import { getDatabase } from "@/lib/database/client";
import { growthMarketSignals } from "@/lib/database/schema";
import { monthKeyInJakarta, weekKeyInJakarta } from "./seo-benchmark";
import { reserveSearch } from "./seo-audit-service";

export type RisingQuery = { query: string; change: string; sourceUrl: string };
export type MarketSignal = { topic: string; checkedAt: Date; rising: RisingQuery[] };
type TrendResponse = {
  error?: string;
  search_metadata?: { id?: string; status?: string };
  related_queries?: { rising?: { query?: string; value?: string; link?: string }[] };
};

const topics = ["jasa cetak plastik", "injection plastik", "kemasan plastik custom", "spacer conduit"] as const;

export function topicForWeek(weekKey: string) {
  const index = Math.floor(Date.parse(`${weekKey}T00:00:00Z`) / (7 * 86_400_000));
  return topics[((index % topics.length) + topics.length) % topics.length];
}

export function futureMondaysInMonth(now: Date) {
  const jakartaDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const day = new Date(`${jakartaDay}T00:00:00Z`);
  const month = jakartaDay.slice(0, 7);
  let count = 0;
  while (true) {
    day.setUTCDate(day.getUTCDate() + 1);
    if (day.toISOString().slice(0, 7) !== month) break;
    if (day.getUTCDay() === 1) count++;
  }
  return count;
}

async function waitForTrendResult(initial: TrendResponse, key: string): Promise<TrendResponse> {
  let data = initial;
  const id = data.search_metadata?.id;
  if (!id || !/^[a-f0-9]{24}$/i.test(id)) return data;
  for (
    let attempt = 0;
    attempt < 4 && ["Queued", "Processing"].includes(data.search_metadata?.status ?? "");
    attempt++
  ) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const url = new URL(`https://serpapi.com/searches/${id}.json`);
    url.searchParams.set("api_key", key);
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) break;
    data = (await response.json()) as TrendResponse;
  }
  return data;
}

export async function getLatestMarketSignal() {
  const database = getDatabase();
  if (!database)
    return { signal: null as MarketSignal | null, error: null as string | null, attemptedAt: null as Date | null };
  try {
    const [complete, latest] = await Promise.all([
      database
        .select()
        .from(growthMarketSignals)
        .where(eq(growthMarketSignals.status, "complete"))
        .orderBy(desc(growthMarketSignals.checkedAt))
        .limit(1),
      database.select().from(growthMarketSignals).orderBy(desc(growthMarketSignals.startedAt)).limit(1),
    ]);
    return {
      signal: complete[0]?.checkedAt
        ? {
            topic: complete[0].topic,
            checkedAt: complete[0].checkedAt,
            rising: (complete[0].rising as RisingQuery[] | null) ?? [],
          }
        : null,
      error: ["failed", "skipped"].includes(latest[0]?.status ?? "") ? latest[0].error : null,
      attemptedAt: latest[0]?.startedAt ?? null,
    };
  } catch {
    return { signal: null as MarketSignal | null, error: null as string | null, attemptedAt: null as Date | null };
  }
}

export async function runMarketSignals(now = new Date()) {
  const database = getDatabase();
  if (!database || !process.env.SERPAPI_API_KEY) return "unavailable" as const;
  const weekKey = weekKeyInJakarta(now);
  const topic = topicForWeek(weekKey);
  const [inserted] = await database
    .insert(growthMarketSignals)
    .values({ weekKey, topic, status: "running", startedAt: now })
    .onConflictDoNothing()
    .returning({ id: growthMarketSignals.id });
  if (!inserted) return "existing" as const;
  try {
    // Preserve all remaining weekly organic audits and one retry before spending a discovery request.
    try {
      await reserveSearch(monthKeyInJakarta(now), futureMondaysInMonth(now) * 6 + 1);
    } catch {
      await database
        .update(growthMarketSignals)
        .set({ status: "skipped", error: "Tren ditunda: jatah API disimpan untuk audit peringkat mingguan." })
        .where(eq(growthMarketSignals.id, inserted.id));
      return "skipped" as const;
    }
    const url = new URL("https://serpapi.com/search.json");
    url.search = new URLSearchParams({
      engine: "google_trends",
      data_type: "RELATED_QUERIES",
      q: topic,
      geo: "ID",
      date: "today 3-m",
      hl: "id",
      tz: "-420",
      api_key: process.env.SERPAPI_API_KEY,
    }).toString();
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(45_000) });
    if (!response.ok) throw new Error(`Google Trends tidak tersedia (HTTP ${response.status}).`);
    const data = await waitForTrendResult((await response.json()) as TrendResponse, process.env.SERPAPI_API_KEY);
    if (data.error || data.search_metadata?.status !== "Success")
      throw new Error(
        data.search_metadata?.status === "Processing"
          ? "Google Trends belum selesai memproses pencarian. Pemeriksaan berikutnya dilakukan pada jadwal mingguan."
          : "Google Trends belum memberi hasil yang siap dipakai. Pemeriksaan berikutnya dilakukan pada jadwal mingguan.",
      );
    const rising: RisingQuery[] = (data.related_queries?.rising ?? [])
      .flatMap((item) => {
        if (!item.query?.trim()) return [];
        const sourceUrl = item.link?.startsWith("https://trends.google.com/")
          ? item.link
          : `https://trends.google.com/trends/explore?geo=ID&q=${encodeURIComponent(item.query)}`;
        return [
          { query: item.query.trim().slice(0, 140), change: String(item.value ?? "Naik").slice(0, 30), sourceUrl },
        ];
      })
      .slice(0, 12);
    await database
      .update(growthMarketSignals)
      .set({ status: "complete", checkedAt: new Date(), rising, error: null })
      .where(eq(growthMarketSignals.id, inserted.id));
    return "complete" as const;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "Pemeriksaan tren gagal.";
    await database
      .update(growthMarketSignals)
      .set({ status: "failed", error: message })
      .where(eq(growthMarketSignals.id, inserted.id));
    return "failed" as const;
  }
}
