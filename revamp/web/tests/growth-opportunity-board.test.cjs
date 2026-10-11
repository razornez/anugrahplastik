/* eslint-disable @typescript-eslint/no-require-imports -- Isolated server-render fixture. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");

function loadBoard() {
  const source = readFileSync(join(__dirname, "../src/components/growth-opportunity-board.tsx"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const moduleForTest = { exports: {} };
  const groupSearchOpportunities = (items) => {
    const group = (kinds) => {
      const matching = items.filter((item) => kinds.includes(item.kind));
      return {
        active: matching.filter((item) => item.status !== "dismissed"),
        dismissed: matching.filter((item) => item.status === "dismissed"),
      };
    };
    return { gap: group(["gap"]), need: group(["question", "phrase"]), trend: group(["trend"]) };
  };
  new Function("module", "exports", "require", compiled)(moduleForTest, moduleForTest.exports, (name) => {
    if (name === "react/jsx-runtime") return require("react/jsx-runtime");
    if (name === "next/link")
      return { default: ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children) };
    if (name === "@/features/analytics/opportunity-actions") return { reviewSearchOpportunity: async () => {} };
    if (name === "@/components/opportunity-discovery-button") return { OpportunityDiscoveryButton: () => null };
    if (name === "@/features/analytics/search-opportunities") return { groupSearchOpportunities };
    throw new Error(`Unexpected import: ${name}`);
  });
  return moduleForTest.exports.GrowthOpportunityBoard;
}

const Board = loadBoard();
const date = new Date("2026-10-01T02:00:00Z");
const base = {
  seoDate: date,
  seoNotice: null,
  trendDate: null,
  trendNotice: "Tren ditunda untuk menjaga jatah audit.",
  trendAttemptedAt: null,
  needDate: null,
  needStatus: "missing",
  needNotice: null,
  budget: null,
  visibleAds: [],
};
const item = (kind, key, status = "new") => ({
  key,
  kind,
  status,
  title: `Contoh ${key}`,
  explanation: `Alasan ${key}`,
  evidence: `Bukti ${key}`,
  checkedAt: date,
  sourceHref: "/admin/growth/competitors",
  actionHref: "/admin/content",
  needsProductionCheck: kind === "trend",
});

test("temuan utama dan bukti langsung ada pada kartu tanpa tautan ke halaman rincian", () => {
  const html = renderToStaticMarkup(
    React.createElement(Board, { ...base, items: [item("gap", "utama")], canReview: false }),
  );
  assert.match(html, /Contoh utama/);
  assert.match(html, /Alasan utama/);
  assert.match(html, /Bukti utama/);
  assert.match(html, /Langkah berikutnya/);
  assert.doesNotMatch(html, /href="\/admin\/growth\/opportunities"/);
  assert.doesNotMatch(html, /Keputusan admin/);
  assert.match(html, /Tren ditunda untuk menjaga jatah audit/);
});

test("temuan tambahan dan yang disisihkan tetap dapat dibuka dan ditinjau di kartu", () => {
  const items = [
    item("gap", "utama"),
    item("gap", "tambahan"),
    item("question", "pertanyaan"),
    item("phrase", "frasa"),
    item("trend", "produk"),
    item("gap", "lama", "dismissed"),
  ];
  const html = renderToStaticMarkup(React.createElement(Board, { ...base, items, canReview: true }));
  assert.match(html, /Lihat 1 temuan lainnya/);
  assert.match(html, /1 temuan disisihkan/);
  assert.match(html, /Pertanyaan terkait/);
  assert.match(html, /Frasa pencarian/);
  assert.match(html, /Periksa mesin, material, mould, kapasitas/);
  assert.match(html, /Keputusan admin/);
  assert.equal((html.match(/<details/g) ?? []).length, 4);
});

test("keadaan kosong tidak mengarang sinyal atau menampilkan tombol keputusan", () => {
  const html = renderToStaticMarkup(
    React.createElement(Board, { ...base, seoDate: null, items: [], canReview: false }),
  );
  assert.match(html, /Audit pencarian belum tersedia/);
  assert.match(html, /Tren ditunda untuk menjaga jatah audit/);
  assert.doesNotMatch(html, /Keputusan admin/);
  assert.equal((html.match(/opportunity-tile--compact/g) ?? []).length, 2);
  assert.match(html, /Pemeriksaan berikutnya: Senin, 09.00 WIB/);
});
