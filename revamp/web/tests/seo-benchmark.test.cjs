/* eslint-disable @typescript-eslint/no-require-imports -- Isolated TS test fixture. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function load(file, imports = {}) {
  const source = readFileSync(join(__dirname, "../src/features/analytics", file), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const moduleForTest = { exports: {} };
  new Function("module", "exports", "require", compiled)(
    moduleForTest,
    moduleForTest.exports,
    (name) => imports[name] ?? {},
  );
  return moduleForTest.exports;
}

const competitors = load("competitor-model.ts");
const { rankSeoSnapshot, monthKeyInJakarta, weekKeyInJakarta } = load("seo-benchmark.ts", {
  "./competitor-model": competitors,
});
const { allowedUrl, publicIpv4, robotsAllows } = load("seo-page-crawler.ts", {
  "node:net": require("node:net"),
});
const market = load("market-signals.ts", {
  "drizzle-orm": {},
  "@/lib/database/client": {},
  "@/lib/database/schema": {},
  "./seo-benchmark": { monthKeyInJakarta, weekKeyInJakarta },
  "./seo-audit-service": {},
});
const seoService = load("seo-audit-service.ts", {
  "drizzle-orm": {},
  "@/lib/database/client": {},
  "@/lib/database/schema": {},
  "./competitor-model": competitors,
  "./seo-page-crawler": {},
  "./seo-benchmark": { monthKeyInJakarta, weekKeyInJakarta },
});
const discovery = load("search-discovery.ts", {
  "drizzle-orm": {},
  "@/lib/database/client": {},
  "@/lib/database/schema": {},
  "./competitor-model": competitors,
  "./market-signals": market,
  "./seo-benchmark": { monthKeyInJakarta, weekKeyInJakarta },
  "./seo-audit-service": seoService,
});
const opportunities = load("search-opportunities.ts", {
  "node:crypto": require("node:crypto"),
  "./competitor-model": competitors,
});

test("service ranking scores positions, distinguishes spacer, and shares genuine ties", () => {
  const domains = [competitors.ownDomain, ...competitors.defaultCompetitors.map((item) => item.domain)];
  const snapshot = {
    competitors: competitors.defaultCompetitors,
    pages: [],
    results: competitors.searchKeywords.map((keyword, index) => ({
      keyword,
      positions: Object.fromEntries(
        domains.map((domain) => [
          domain,
          index < 4 ? (domain === domains[0] ? 3 : domain === domains[1] ? 1 : null) : domain === domains[0] ? 2 : null,
        ]),
      ),
      links: {},
    })),
  };
  const service = rankSeoSnapshot(snapshot, "jasa");
  assert.equal(service[0].domain, domains[1]);
  assert.equal(service[0].points, 40);
  assert.equal(service[1].points, 32);
  assert.equal(service[2].rank, null);
  assert.equal(service[3].rank, null);
  snapshot.results[0].positions[domains[2]] = 10;
  snapshot.results[0].positions[domains[3]] = 10;
  const tied = rankSeoSnapshot(snapshot, "jasa");
  assert.equal(tied[2].rank, 3);
  assert.equal(tied[3].rank, 3);
  const spacer = rankSeoSnapshot(snapshot, "spacer");
  assert.equal(spacer[0].domain, domains[0]);
  assert.equal(spacer[0].points, 18);
});

test("month and week keys follow Jakarta calendar boundaries", () => {
  const instant = new Date("2026-09-30T18:00:00Z");
  assert.equal(monthKeyInJakarta(instant), "2026-10");
  assert.equal(weekKeyInJakarta(instant), "2026-09-28");
});

test("crawler rejects private addresses, foreign domains, credentials, and disallowed paths", () => {
  for (const address of ["127.0.0.1", "10.1.2.3", "172.18.1.2", "192.168.1.1", "169.254.1.1", "203.0.113.2"])
    assert.equal(publicIpv4(address), false);
  assert.equal(publicIpv4("8.8.8.8"), true);
  for (const url of [
    "http://example.com/",
    "https://example.com.evil.test/",
    "https://user:pass@example.com/",
    "https://127.0.0.1/",
  ])
    assert.equal(allowedUrl(url, "example.com"), null);
  assert.equal(allowedUrl("https://www.example.com/product", "example.com").pathname, "/product");
  assert.equal(robotsAllows("User-agent: *\nDisallow: /private", "/private/item"), false);
});

test("market discovery rotates topics and reserves all future Monday audits", () => {
  assert.equal(market.futureMondaysInMonth(new Date("2026-11-02T03:00:00Z")), 4);
  assert.equal(market.futureMondaysInMonth(new Date("2026-11-30T03:00:00Z")), 0);
  assert.equal(market.futureMondaysInMonth(new Date("2026-09-30T18:00:00Z")), 4);
  assert.equal(typeof market.topicForWeek("2026-11-02"), "string");
  assert.notEqual(market.topicForWeek("2026-11-02"), market.topicForWeek("2026-11-09"));
});

test("limited discovery leaves four Monday audits, a retry, and one trend request", () => {
  assert.equal(discovery.reservedSearches(new Date("2026-10-02T03:00:00Z")), 26);
  assert.equal(discovery.reservedSearches(new Date("2026-10-02T03:00:00Z"), true), 25);
  assert.equal(40 - 11 - discovery.reservedSearches(new Date("2026-10-02T03:00:00Z")), 3);
  assert.equal(seoService.monthlyLimit, 40);
  assert.equal(seoService.canReserveSearch(13, 26), true);
  assert.equal(seoService.canReserveSearch(14, 26), false);
  assert.equal(seoService.canReserveSearch(39), true);
  assert.equal(seoService.canReserveSearch(40), false);
});

test("supplemental searches only backfill a legacy audit in the current week", () => {
  const now = new Date("2026-10-02T03:00:00Z");
  const legacy = { checkedAt: new Date("2026-10-01T02:00:00Z"), results: [{ keyword: "jasa cetak plastik" }] };
  assert.equal(discovery.needsSupplementalDiscovery(legacy, now), true);
  assert.equal(
    discovery.needsSupplementalDiscovery(
      { ...legacy, results: [{ keyword: "jasa cetak plastik", relatedQuestions: [], relatedSearches: [] }] },
      now,
    ),
    false,
  );
  assert.equal(discovery.needsSupplementalDiscovery(legacy, new Date("2026-10-06T03:00:00Z")), false);
  assert.equal(discovery.needsSupplementalDiscovery(null, now), false);
});

test("opportunities use evidence, deduplicate phrases, and do not invent missing trends", () => {
  const audit = {
    checkedAt: new Date("2026-10-01T02:00:00Z"),
    competitors: competitors.defaultCompetitors,
    results: [
      {
        keyword: "jasa cetak plastik Bandung",
        positions: { [competitors.ownDomain]: null, "barokahplastik.com": 3 },
        relatedSearches: ["cetak plastik custom", "cetak plastik custom"],
        relatedQuestions: ["Berapa minimum pesanan cetak plastik?"],
      },
    ],
  };
  const items = opportunities.buildSearchOpportunities(audit, null);
  assert.equal(items.length, 3);
  assert.equal(items[0].kind, "gap");
  assert.match(items[0].explanation, /posisi 3/);
  assert.equal(
    items.find((item) => item.kind === "trend"),
    undefined,
  );
  const withTrend = opportunities.buildSearchOpportunities(audit, {
    topic: "kemasan plastik custom",
    checkedAt: new Date("2026-10-02T02:00:00Z"),
    rising: [
      { query: "tutup botol plastik", change: "+80%", sourceUrl: "https://trends.google.com/trends/explore?q=tutup" },
    ],
  });
  const grouped = opportunities.groupSearchOpportunities(withTrend);
  assert.equal(grouped.gap.active.length, 1);
  assert.equal(grouped.need.active.length, 2);
  assert.equal(grouped.trend.active.length, 1);
  assert.equal(withTrend.find((item) => item.kind === "trend").needsProductionCheck, true);
  assert.deepEqual(opportunities.buildSearchOpportunities(null, null), []);
  assert.deepEqual(opportunities.groupSearchOpportunities([]).need.active, []);
  const enriched = opportunities.buildSearchOpportunities(audit, null, {
    checkedAt: new Date("2026-10-02T03:00:00Z"),
    results: [
      {
        keyword: "cetak plastik custom Bandung",
        relatedQuestions: ["Berapa minimum pesanan cetak plastik?"],
        relatedSearches: ["injection plastik bandung"],
        sourceUrl: "https://www.google.com/search?q=cetak%20plastik",
      },
    ],
  });
  assert.equal(enriched.filter((entry) => entry.kind === "question").length, 1);
  assert.equal(enriched.find((entry) => entry.kind === "question").checkedAt.toISOString(), "2026-10-02T03:00:00.000Z");
  withTrend[0].status = "dismissed";
  assert.equal(opportunities.groupSearchOpportunities(withTrend).gap.active.length, 0);
  assert.equal(opportunities.groupSearchOpportunities(withTrend).gap.dismissed[0].key, withTrend[0].key);
});
