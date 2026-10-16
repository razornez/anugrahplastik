/* eslint-disable @typescript-eslint/no-require-imports -- Node's built-in test runner uses this isolated CommonJS fixture. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { transpileModule, ModuleKind } = require("typescript");

const source = readFileSync(join(__dirname, "../src/features/operations/docgen-policy.ts"), "utf8");
const compiled = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText;

function policy(mode = "dummy", extra = {}) {
  const exports = {};
  new Function("exports", "process", compiled)(exports, { env: { DOCGEN_TEMPLATE_MODE: mode, ...extra } });
  return exports;
}

test("local renderer follows the local database, supports the production workflow, and cannot send email", () => {
  const extra = { DOCGEN_RENDER_MODE: "local_qa", NODE_ENV: "development", DATABASE_URL: "postgres://qa@127.0.0.1/qa" };
  const guard = policy("approved", extra);
  assert.equal(guard.docGenTemplateId("INVOICE"), "local_qa:INVOICE");
  assert.equal(guard.docGenTemplateReady("BAST"), true);
  assert.equal(guard.docGenProviderReady("INVOICE"), true);
  assert.doesNotThrow(() => guard.assertDocGenTransactionAllowed("production"));
  assert.doesNotThrow(() => guard.assertDocGenTransactionAllowed("demo"));
  assert.doesNotThrow(() => guard.assertDocGenTransactionAllowed("test"));
  assert.throws(() => guard.assertDocGenEmailAllowed("test", "razornez@gmail.com", true));
  assert.equal(guard.docGenPayload({}).renderSource, "local_qa");
  assert.equal(policy("dummy", { ...extra, NODE_ENV: "production" }).localQaRendererEnabled(), true);
  assert.equal(
    policy("dummy", { ...extra, DATABASE_URL: "postgres://qa@example.com/qa" }).localQaRendererEnabled(),
    false,
  );
  assert.equal(policy("dummy", { ...extra, DATABASE_URL: "not-a-url" }).localQaRendererEnabled(), false);
  assert.equal(policy("dummy", { ...extra, DOCGEN_RENDER_MODE: "provider" }).localQaRendererEnabled(), false);
  assert.equal(policy("dummy", { ...extra, APP_ORIGIN: "https://anugrahplastik.com" }).localQaRendererEnabled(), false);
  assert.equal(
    policy("dummy", { ...extra, APP_ORIGIN: "https://admin.anugrahplastik.com" }).localQaRendererEnabled(),
    false,
  );
});

test("template contoh hanya merender transaksi uji", () => {
  const guard = policy("dummy", { DOCGEN_TEMPLATE_CONTRACT_ID: "old-contract-template" });
  assert.equal(guard.docGenDummyMode(), true);
  assert.equal(guard.docGenTemplateId("CONTRACT"), undefined);
  assert.doesNotThrow(() => guard.assertDocGenTransactionAllowed("test"));
  assert.throws(() => guard.assertDocGenTransactionAllowed("production"));
  assert.deepEqual(guard.docGenPayload({ label: "uji" }), { label: "uji", isDummy: true });
});

test("dokumen contoh hanya boleh dikirim ke alamat uji", () => {
  const guard = policy();
  assert.doesNotThrow(() => guard.assertDocGenEmailAllowed("test", "razornez@gmail.com", true));
  assert.throws(() => guard.assertDocGenEmailAllowed("test", "customer@example.com", true));
  assert.throws(() => guard.assertDocGenEmailAllowed("production", "razornez@gmail.com", true));
});

test("dokumen lama yang ditandai contoh tetap dibatasi setelah mode disetujui", () => {
  const kinds = ["QUOTATION", "INVOICE", "DELIVERY", "BAST"];
  const templates = Object.fromEntries(
    kinds.flatMap((kind) => [
      [`DOCGEN_TEMPLATE_${kind}_ID`, `dummy-${kind}`],
      [`DOCGEN_OFFICIAL_TEMPLATE_${kind}_ID`, `official-${kind}`],
    ]),
  );
  const guard = policy("approved", {
    DOCGEN_OFFICIAL_RELEASE_APPROVED: "yes",
    DOCGEN_OFFICIAL_INVOICE_APPROVED: "yes",
    ...templates,
  });
  assert.equal(guard.docGenDummyMode(), false);
  assert.deepEqual(guard.docGenPayload({ label: "resmi" }), { label: "resmi", isDummy: false });
  assert.equal(guard.docGenTemplateId("QUOTATION"), "official-QUOTATION");
  assert.equal(guard.docGenTemplateId("CONTRACT"), undefined);
  assert.doesNotThrow(() => guard.assertDocGenTransactionAllowed("production"));
  assert.throws(() => guard.assertDocGenEmailAllowed("production", "customer@example.com", true));
});

test("mode approved tanpa izin dan empat template resmi tetap tertutup", () => {
  const guard = policy("approved", {
    DOCGEN_TEMPLATE_QUOTATION_ID: "dummy-quote",
    DOCGEN_OFFICIAL_TEMPLATE_QUOTATION_ID: "dummy-quote",
  });
  assert.equal(guard.docGenDummyMode(), true);
  assert.equal(guard.docGenTemplateId("QUOTATION"), undefined);
  assert.throws(() => guard.assertDocGenTransactionAllowed("production"));
});

test("template invoice resmi tetap tertutup tanpa persetujuan desain terpisah", () => {
  const kinds = ["QUOTATION", "INVOICE", "DELIVERY", "BAST"];
  const templates = Object.fromEntries(
    kinds.map((kind) => [`DOCGEN_OFFICIAL_TEMPLATE_${kind}_ID`, `official-${kind}`]),
  );
  const guard = policy("approved", { DOCGEN_OFFICIAL_RELEASE_APPROVED: "yes", ...templates });
  assert.equal(guard.docGenDummyMode(), true);
  assert.equal(guard.docGenTemplateId("INVOICE"), undefined);
});

test("izin rilis tanpa salah satu ID resmi atau dengan ID duplikat tetap tertutup", () => {
  const kinds = ["QUOTATION", "INVOICE", "DELIVERY", "BAST"];
  const templates = Object.fromEntries(
    kinds.map((kind) => [`DOCGEN_OFFICIAL_TEMPLATE_${kind}_ID`, `official-${kind}`]),
  );
  const missing = policy("approved", {
    DOCGEN_OFFICIAL_RELEASE_APPROVED: "yes",
    ...templates,
    DOCGEN_OFFICIAL_TEMPLATE_BAST_ID: "",
  });
  assert.equal(missing.docGenTemplateId("INVOICE"), undefined);
  assert.throws(() => missing.assertDocGenTransactionAllowed("production"));
  const duplicate = policy("approved", {
    DOCGEN_OFFICIAL_RELEASE_APPROVED: "yes",
    ...templates,
    DOCGEN_OFFICIAL_TEMPLATE_BAST_ID: "official-INVOICE",
  });
  assert.equal(duplicate.docGenTemplateId("BAST"), undefined);
});
