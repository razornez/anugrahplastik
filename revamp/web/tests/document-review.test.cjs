/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");
const { transpileModule, ModuleKind } = require("typescript");

const source = readFileSync("src/features/operations/document-review.ts", "utf8");
const compiled = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText;
const reviewModule = {};
new Function("exports", compiled)(reviewModule);

test("document review gives a safe, actionable explanation without exposing provider details", () => {
  assert.equal(
    reviewModule.classifyDocumentFailure(new Error("Kredit DocGen tidak cukup"), false).code,
    "provider-credit",
  );
  assert.equal(reviewModule.classifyDocumentFailure(new Error("fetch failed"), false).code, "provider-pending");
  assert.equal(reviewModule.classifyDocumentFailure(new Error("unexpected private path"), true).code, "local-render");
  assert.equal(
    reviewModule.readDocumentReview({
      generationReview: { code: "archive", message: "Arsip gagal", checkedAt: "2026-10-14" },
    }).code,
    "archive",
  );
  assert.equal(reviewModule.readDocumentReview({ generationReview: { code: "archive" } }), null);
});

test("an unresolved PDF blocks a new revision", () => {
  assert.equal(reviewModule.documentRevisionBlocker("generating"), true);
  assert.equal(reviewModule.documentRevisionBlocker("needs_review"), true);
  assert.equal(reviewModule.documentRevisionBlocker("ready"), false);
});

test("automatic recovery requires a recorded same-operation payload and a fresh provider key", () => {
  const base = {
    status: "needs_review",
    operationKey: "op-safe",
    templateId: "tpl-safe",
    providerDocumentId: "batch_safe",
    hasRenderData: true,
    createdAt: new Date("2026-10-14T00:00:00Z"),
    local: false,
    now: new Date("2026-10-14T00:30:00Z").getTime(),
  };
  assert.equal(reviewModule.documentRecoveryBlocker(base), null);
  assert.match(reviewModule.documentRecoveryBlocker({ ...base, providerDocumentId: null }), /Nomor proses/);
  assert.match(reviewModule.documentRecoveryBlocker({ ...base, hasRenderData: false }), /Data render/);
  assert.match(
    reviewModule.documentRecoveryBlocker({ ...base, now: new Date("2026-10-15T00:30:00Z").getTime() }),
    /Batas kunci/,
  );
  assert.equal(reviewModule.documentRecoveryBlocker({ ...base, local: true, providerDocumentId: null }), null);
});

test("transaction actions reuse the same operation when a PDF requires review", () => {
  const actions = readFileSync("src/features/operations/workflow-actions.ts", "utf8");
  const detail = readFileSync("src/app/admin/transactions/[id]/page.tsx", "utf8");
  assert.match(actions, /quotationDocumentReadiness\(transactionId\)/);
  assert.match(actions, /eq\(transactionDocuments\.status, "needs_review"\)/);
  assert.match(actions, /operationKey: document\.operationKey/);
  assert.match(detail, /quoteNeedsReview \? \(/);
  assert.match(detail, /Periksa PDF/);
  assert.match(detail, /Belum ada file untuk dipratinjau/);
});
