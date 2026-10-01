/* eslint-disable @typescript-eslint/no-require-imports -- Node's built-in test runner uses CommonJS fixtures. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const source = readFileSync(join(__dirname, "../src/features/analytics/report-period.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const moduleForTest = { exports: {} };
new Function("module", "exports", compiled)(moduleForTest, moduleForTest.exports);
const { jakartaReportStart, jakartaReportRange } = moduleForTest.exports;

test("periode laporan dimulai pada tengah malam Asia/Jakarta, termasuk saat UTC masih tanggal sebelumnya", () => {
  const now = new Date("2026-09-29T17:15:00.000Z");
  assert.equal(jakartaReportStart(1, now).toISOString(), "2026-09-29T17:00:00.000Z");
  assert.equal(jakartaReportStart(7, now).toISOString(), "2026-09-23T17:00:00.000Z");
  assert.equal(jakartaReportStart(30, now).toISOString(), "2026-08-31T17:00:00.000Z");
});

test("tanggal yang sama di Jakarta memberi batas awal yang sama walau jam UTC berbeda", () => {
  assert.equal(
    jakartaReportStart(7, new Date("2026-09-29T17:01:00.000Z")).toISOString(),
    jakartaReportStart(7, new Date("2026-09-30T16:59:00.000Z")).toISOString(),
  );
});

test("batas ringkasan 30 hari memakai kalender Jakarta yang sama dengan laporan pengunjung", () => {
  const now = new Date("2026-09-30T16:59:00.000Z");
  const range = jakartaReportRange(30, now);
  assert.equal(range.start.toISOString(), "2026-08-31T17:00:00.000Z");
  assert.equal(range.prior.toISOString(), "2026-08-01T17:00:00.000Z");
  assert.equal(jakartaReportStart(1, now).toISOString(), "2026-09-29T17:00:00.000Z");
});
