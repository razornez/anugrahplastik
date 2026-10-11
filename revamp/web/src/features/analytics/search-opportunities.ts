import { createHash } from "node:crypto";
import { ownDomain } from "./competitor-model";
import type { MarketSignal } from "./market-signals";
import type { SearchDiscovery } from "./search-discovery";
import type { SeoAuditSnapshot } from "./seo-benchmark";

export type OpportunityKind = "gap" | "question" | "phrase" | "trend";
export type OpportunityStatus = "new" | "reviewing" | "relevant" | "dismissed";
export type SearchOpportunity = {
  key: string;
  kind: OpportunityKind;
  title: string;
  explanation: string;
  evidence: string;
  sourceHref: string;
  actionHref: string;
  checkedAt: Date;
  status: OpportunityStatus;
  needsProductionCheck: boolean;
};

export function opportunityKey(kind: OpportunityKind, title: string) {
  return createHash("sha256")
    .update(`${kind}:${title.trim().toLocaleLowerCase("id-ID")}`)
    .digest("hex");
}

function unique(items: SearchOpportunity[]) {
  return [...new Map(items.map((item) => [item.key, item])).values()];
}

export function buildSearchOpportunities(
  audit: SeoAuditSnapshot | null,
  market: MarketSignal | null,
  discovery: SearchDiscovery | null = null,
): SearchOpportunity[] {
  const results: SearchOpportunity[] = [];
  const addRelated = (
    result: { keyword: string; relatedQuestions?: string[]; relatedSearches?: string[] },
    checkedAt: Date,
    sourceHref: string,
  ) => {
    for (const question of result.relatedQuestions ?? [])
      results.push({
        key: opportunityKey("question", question),
        kind: "question",
        title: question,
        explanation: `Pertanyaan ini muncul saat memeriksa “${result.keyword}”. Tinjau apakah halaman kita sudah menjawabnya dengan jelas.`,
        evidence: `Pertanyaan terkait · ${result.keyword}`,
        sourceHref,
        actionHref: "/admin/content",
        checkedAt,
        status: "new",
        needsProductionCheck: false,
      });
    for (const phrase of result.relatedSearches ?? [])
      results.push({
        key: opportunityKey("phrase", phrase),
        kind: "phrase",
        title: phrase,
        explanation: `Frasa terkait dengan “${result.keyword}”. Ini ide untuk ditinjau, bukan angka volume pencarian.`,
        evidence: `Pencarian terkait · ${result.keyword}`,
        sourceHref,
        actionHref: "/admin/content",
        checkedAt,
        status: "new",
        needsProductionCheck: false,
      });
  };
  if (audit) {
    for (const result of audit.results) {
      const competitor = audit.competitors.find(
        (site) =>
          result.positions[site.domain] != null &&
          (result.positions[ownDomain] == null || result.positions[site.domain]! < result.positions[ownDomain]!),
      );
      if (competitor)
        results.push({
          key: opportunityKey("gap", result.keyword),
          kind: "gap",
          title: result.keyword,
          explanation: `${competitor.name} muncul di posisi ${result.positions[competitor.domain]}, sementara Anugrah Plastik ${result.positions[ownDomain] == null ? "belum masuk 10 besar" : `berada di posisi ${result.positions[ownDomain]}`}. Tinjau kecocokan halaman kita; posisi ini bukan bukti penjualan pesaing.`,
          evidence: `Google organik · Bandung · ${competitor.domain}`,
          sourceHref: "/admin/growth/competitors",
          actionHref: "/admin/content",
          checkedAt: audit.checkedAt,
          status: "new",
          needsProductionCheck: false,
        });
      addRelated(result, audit.checkedAt, "/admin/growth/competitors");
    }
  }
  if (discovery) for (const result of discovery.results) addRelated(result, discovery.checkedAt, result.sourceUrl);
  if (market)
    for (const item of market.rising)
      results.push({
        key: opportunityKey("trend", item.query),
        kind: "trend",
        title: item.query,
        explanation: `Google Trends menandai pencarian terkait “${market.topic}” sedang naik (${item.change}). Ini ukuran relatif, bukan jumlah calon pembeli. Periksa relevansi dan kemampuan produksi sebelum menawarkan produk baru.`,
        evidence: `Google Trends · Indonesia · 3 bulan`,
        sourceHref: item.sourceUrl,
        actionHref: "/admin/growth/opportunities",
        checkedAt: market.checkedAt,
        status: "new",
        needsProductionCheck: true,
      });
  return unique(results);
}

export function groupSearchOpportunities(items: SearchOpportunity[]) {
  const group = (kinds: OpportunityKind[]) => {
    const matching = items.filter((item) => kinds.includes(item.kind));
    return {
      active: matching.filter((item) => item.status !== "dismissed"),
      dismissed: matching.filter((item) => item.status === "dismissed"),
    };
  };
  return {
    gap: group(["gap"]),
    need: group(["question", "phrase"]),
    trend: group(["trend"]),
  };
}
