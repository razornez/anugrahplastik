/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const filename = path.join(__dirname, "..", "src", "features", "analytics", "display-duration.ts");
const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const moduleForTest = { exports: {} };
new Function("module", "exports", compiled)(moduleForTest, moduleForTest.exports);
const { formatAdminCount, formatAdminDuration } = moduleForTest.exports;

test("admin durations use at most two human-readable units", () => {
  assert.equal(formatAdminDuration(0), "kurang dari 1 menit");
  assert.equal(formatAdminDuration(59), "kurang dari 1 menit");
  assert.equal(formatAdminDuration(12 * 60), "12 menit");
  assert.equal(formatAdminDuration(3 * 3_600 + 20 * 60), "3 jam 20 menit");
  assert.equal(formatAdminDuration(15 * 86_400 + 5 * 3_600 + 42 * 60), "15 hari 5 jam");
  assert.equal(formatAdminCount(1_263), "1.263");
});
