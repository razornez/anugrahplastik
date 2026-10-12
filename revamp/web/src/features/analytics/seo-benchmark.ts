import { ownDomain, searchKeywords, type Competitor } from "./competitor-model";

export type SeoResult = {
  keyword: string;
  positions: Record<string, number | null>;
  links: Record<string, string | null>;
  titles?: Record<string, string | null>;
  snippets?: Record<string, string | null>;
  relatedSearches?: string[];
  relatedQuestions?: string[];
  visibleAds?: { title: string; domain: string; link: string | null }[];
};

export type PageObservation = {
  domain: string;
  category: "jasa" | "spacer";
  url: string | null;
  status: "checked" | "unavailable";
  title: string | null;
  heading: string | null;
  description: string | null;
  signals: string[];
};

export type SeoAuditSnapshot = {
  id: string;
  checkedAt: Date;
  competitors: Competitor[];
  results: SeoResult[];
  pages: PageObservation[];
};

export const seoCategories = [
  { key: "jasa", label: "Jasa cetak plastik", keywords: searchKeywords.slice(0, 4) },
  { key: "spacer", label: "Spacer conduit", keywords: searchKeywords.slice(4) },
] as const;

export function rankSeoSnapshot(snapshot: SeoAuditSnapshot, category: "jasa" | "spacer") {
  const keywords = seoCategories.find((item) => item.key === category)!.keywords;
  const domains = [{ name: "Anugrah Plastik", domain: ownDomain }, ...snapshot.competitors];
  const sorted = domains
    .map((item) => {
      const positions = snapshot.results
        .filter((result) => keywords.includes(result.keyword as (typeof keywords)[number]))
        .map((result) => result.positions[item.domain] ?? null);
      const contributions = snapshot.results
        .filter((result) => keywords.includes(result.keyword as (typeof keywords)[number]))
        .map((result) => {
          const position = result.positions[item.domain] ?? null;
          return {
            keyword: result.keyword,
            position,
            points: position == null ? 0 : 11 - position,
            link: result.links[item.domain] ?? null,
            title: result.titles?.[item.domain] ?? null,
            snippet: result.snippets?.[item.domain] ?? null,
          };
        });
      return {
        ...item,
        contributions,
        points: contributions.reduce<number>((sum, item) => sum + item.points, 0),
        visible: positions.filter((position) => position != null).length,
        best: Math.min(...positions.filter((position): position is number => position != null), 11),
        observation: snapshot.pages.find((page) => page.domain === item.domain && page.category === category) ?? null,
      };
    })
    .sort(
      (a, b) => b.points - a.points || b.visible - a.visible || a.best - b.best || a.domain.localeCompare(b.domain),
    );
  return sorted.map((item, index) => ({
    ...item,
    rank:
      item.points === 0
        ? null
        : index > 0 &&
            item.points === sorted[index - 1].points &&
            item.visible === sorted[index - 1].visible &&
            item.best === sorted[index - 1].best
          ? sorted.findIndex(
              (other) => other.points === item.points && other.visible === item.visible && other.best === item.best,
            ) + 1
          : index + 1,
  }));
}

export function monthKeyInJakarta(now: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" })
    .format(now)
    .slice(0, 7);
}

export function weekKeyInJakarta(now: Date) {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}
