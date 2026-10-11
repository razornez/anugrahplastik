/* eslint-disable @typescript-eslint/no-require-imports -- Node's test runner loads TS in isolation. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const { renderToStaticMarkup } = require("react-dom/server");

function load(relativePath, imports) {
  const source = readFileSync(join(__dirname, "../src/features/analytics", relativePath), "utf8");
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

const reportPeriod = load("report-period.ts", {});
const { classifyVisitorSessions } = load("visitor-cohorts.ts", { "./report-period": reportPeriod });
const { normalizeDomain, summarizeSearchAudit, isAuditStale, ownDomain, defaultCompetitors, searchKeywords } = load(
  "competitor-model.ts",
  {},
);

function renderVisitorChart(days, sessions) {
  const source = readFileSync(join(__dirname, "../src/components/growth-visitor-chart.tsx"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const chartModule = { exports: {} };
  new Function("module", "exports", "require", compiled)(chartModule, chartModule.exports, require);
  const now = new Date("2026-10-01T12:00:00+07:00");
  const trend = classifyVisitorSessions(
    sessions ?? [
      { anonymousId: "A", createdAt: new Date("2026-09-23T09:00:00+07:00") },
      { anonymousId: "B", createdAt: new Date("2026-09-24T09:00:00+07:00") },
      { anonymousId: "A", createdAt: new Date("2026-10-01T09:00:00+07:00") },
    ],
    days,
    now,
  );
  return renderToStaticMarkup(require("react").createElement(chartModule.exports.GrowthVisitorChart, { data: trend }));
}

test("grafik 30 hari menampilkan periode penuh, penanda mingguan, dan tabel 30 tanggal terbuka", () => {
  const html = renderVisitorChart(30);
  assert.match(html, /2 Sep 2026–1 Okt 2026/);
  assert.match(html, /30 hari kalender/);
  assert.match(html, /<details[^>]*open=""/);
  assert.equal((html.match(/<tbody>.*?<\/tbody>/) ?? [""])[0].match(/<tr>/g)?.length, 30);
  assert.equal((html.match(/growth-visitor-chart__dates[^]*?<\/div>/) ?? [""])[0].match(/<span/g)?.length, 5);
  assert.match(html, /is-staggered/);
});

test("grafik tujuh hari dengan data pada tiap tanggal menampilkan semua nilai tanpa bergantung pada hover", () => {
  const sessions = Array.from({ length: 7 }, (_, index) => ({
    anonymousId: `visitor-${index}`,
    createdAt: new Date(Date.UTC(2026, 8, 25 + index, 2)),
  }));
  const html = renderVisitorChart(7, sessions);
  assert.equal((html.match(/growth-visitor-chart__point--new/g) ?? []).length, 7);
  assert.equal((html.match(/growth-visitor-chart__dates[^]*?<\/div>/) ?? [""])[0].match(/<span/g)?.length, 7);
});

test("grafik 7 hari memberi tujuh label tanggal dan tetap membedakan dua seri", () => {
  const html = renderVisitorChart(7);
  assert.match(html, /25 Sep 2026–1 Okt 2026/);
  assert.equal((html.match(/<tbody>.*?<\/tbody>/) ?? [""])[0].match(/<tr>/g)?.length, 7);
  assert.equal((html.match(/growth-visitor-chart__dates[^]*?<\/div>/) ?? [""])[0].match(/<span/g)?.length, 7);
  assert.match(html, /growth-visitor-chart__line--new/);
  assert.match(html, /growth-visitor-chart__line--returning/);
});

test("pengunjung baru dan kembali dihitung sekali per hari dan sekali per periode", () => {
  const now = new Date("2026-10-01T12:00:00+07:00");
  const sessions = [
    { anonymousId: "A", createdAt: new Date("2026-09-20T09:00:00+07:00") },
    { anonymousId: "A", createdAt: new Date("2026-09-30T08:00:00+07:00") },
    { anonymousId: "A", createdAt: new Date("2026-09-30T09:00:00+07:00") },
    { anonymousId: "B", createdAt: new Date("2026-09-30T10:00:00+07:00") },
    { anonymousId: "B", createdAt: new Date("2026-10-01T08:00:00+07:00") },
  ];
  const result = classifyVisitorSessions(sessions, 7, now);
  assert.equal(result.newVisitors, 1);
  assert.equal(result.returningVisitors, 1);
  assert.deepEqual(result.trend.at(-2), { date: "2026-09-30", newVisitors: 1, returningVisitors: 1 });
  assert.deepEqual(result.trend.at(-1), { date: "2026-10-01", newVisitors: 0, returningVisitors: 1 });
});

test("batas hari Jakarta dan riwayat yang terarsip tidak menebak kunjungan lama", () => {
  const now = new Date("2026-10-01T00:20:00+07:00");
  const result = classifyVisitorSessions(
    [
      { anonymousId: "C", createdAt: new Date("2026-09-30T23:59:00+07:00") },
      { anonymousId: "C", createdAt: new Date("2026-10-01T00:01:00+07:00") },
      { anonymousId: "D", createdAt: new Date("2026-10-01T00:00:00+07:00") },
    ],
    7,
    now,
  );
  assert.equal(result.newVisitors, 2);
  assert.equal(result.returningVisitors, 0);
  assert.deepEqual(result.trend.at(-1), { date: "2026-10-01", newVisitors: 1, returningVisitors: 1 });
});

test("domain pesaing divalidasi dan duplikasi diri ditolak", () => {
  assert.equal(normalizeDomain("https://www.barokahplastik.com/layanan"), "barokahplastik.com");
  assert.throws(() => normalizeDomain("http://127.0.0.1"));
  assert.throws(() => normalizeDomain("anugrahplastik.com"));
});

test("jumlah kata kunci top 10 tidak menganggap posisi sama sebagai kekalahan", () => {
  const competitors = [...defaultCompetitors];
  const positions = {
    [ownDomain]: 3,
    [competitors[0].domain]: 3,
    [competitors[1].domain]: null,
    [competitors[2].domain]: null,
  };
  const audit = {
    id: "test",
    checkedAt: new Date(),
    location: "Bandung",
    device: "desktop",
    competitors,
    results: [
      { keyword: searchKeywords[0], sourceUrl: "https://www.google.com/search?q=test", positions },
      {
        keyword: searchKeywords[1],
        sourceUrl: "https://www.google.com/search?q=test",
        positions: { ...positions, [ownDomain]: null, [competitors[0].domain]: 2 },
      },
    ],
  };
  const summary = summarizeSearchAudit(audit);
  assert.equal(summary.scores[0].topTen, 1);
  assert.equal(summary.scores[1].topTen, 2);
  assert.match(summary.lesson.title, /jasa injection plastik/);
});

test("tanpa hasil top 10 tidak membuat klaim situs telah terlihat", () => {
  const competitors = [...defaultCompetitors];
  const summary = summarizeSearchAudit({
    id: "test",
    checkedAt: new Date(),
    location: "Bandung",
    device: "desktop",
    competitors,
    results: [
      {
        keyword: searchKeywords[0],
        sourceUrl: "https://www.google.com/search?q=test",
        positions: Object.fromEntries(
          [ownDomain, ...competitors.map((item) => item.domain)].map((domain) => [domain, null]),
        ),
      },
    ],
  });
  assert.match(summary.lesson.title, /kecocokan kata kunci/);
});

test("audit mingguan baru ditandai lewat waktu setelah tujuh hari", () => {
  const now = new Date("2026-10-01T12:00:00+07:00");
  const audit = { checkedAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
  assert.equal(isAuditStale(null, now), false);
  assert.equal(isAuditStale(audit, now), false);
  assert.equal(isAuditStale(audit, new Date(now.getTime() + 1000)), true);
});
