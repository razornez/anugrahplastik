/* eslint-disable @typescript-eslint/no-require-imports -- Node's test runner loads TypeScript helpers in isolation. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function load(relativePath) {
  const source = readFileSync(join(__dirname, "../src/features/workspace", relativePath), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const moduleForTest = { exports: {} };
  new Function("module", "exports", "require", compiled)(moduleForTest, moduleForTest.exports, () => ({}));
  return moduleForTest.exports;
}

const workspaceService = load("service.ts");
const { normalizeDemoWhatsAppNumber, prospectWhatsAppDestination } = load("demo-contact.ts");
const { prospectSourceLabel } = load("prospect-display.ts");

test("workspace service does not expose a selectable demo prospect mode", () => {
  assert.equal("resolveProspectView" in workspaceService, false);
});

test("demo WhatsApp never uses a phone number stored on a fictional prospect", () => {
  const testNumber = normalizeDemoWhatsAppNumber("+62 812 3456 7890");
  assert.equal(testNumber, "6281234567890");
  assert.equal(normalizeDemoWhatsAppNumber("0812 3456 7890"), testNumber);
  assert.equal(normalizeDemoWhatsAppNumber("12345"), null);
  assert.equal(prospectWhatsAppDestination("demo", "0812-6654-1102", testNumber), testNumber);
  assert.equal(prospectWhatsAppDestination("demo", "0812-6654-1102", null), null);
  assert.equal(prospectWhatsAppDestination("production", "0812-6654-1102", testNumber), "6281266541102");
  assert.equal(prospectWhatsAppDestination("other", "0812-6654-1102", testNumber), null);
});

test("prospect source labels replace internal seed codes with readable names", () => {
  assert.equal(prospectSourceLabel("home-demo-v1"), "Form website");
  assert.equal(prospectSourceLabel("google / cpc"), "Iklan Google");
  assert.equal(prospectSourceLabel("referal"), "Rujukan");
});
