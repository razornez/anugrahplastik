/* eslint-disable @typescript-eslint/no-require-imports -- Node's test runner loads a small TypeScript helper in isolation. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function load(relativePath) {
  const source = readFileSync(join(__dirname, "../src/features/leads", relativePath), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const moduleForTest = { exports: {} };
  new Function("module", "exports", "require", compiled)(moduleForTest, moduleForTest.exports, () => ({}));
  return moduleForTest.exports;
}

const { campaignAttributionKeys, campaignLeadSource } = load("attribution.ts");

test("atribusi kampanye menerima click ID Google dan UTM yang relevan", () => {
  assert.deepEqual(campaignAttributionKeys, [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "gclid",
    "gbraid",
    "wbraid",
  ]);
  assert.equal(campaignLeadSource({ utm_source: "google", utm_medium: "cpc" }), "google / cpc");
  assert.equal(campaignLeadSource({ gclid: "test-click" }), "google / cpc");
  assert.equal(campaignLeadSource({ utm_source: "instagram", utm_medium: "paid" }), "website");
});
