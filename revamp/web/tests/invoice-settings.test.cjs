/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const actions = readFileSync(join(__dirname, "../src/features/operations/document-settings-actions.ts"), "utf8");
const page = readFileSync(join(__dirname, "../src/app/admin/settings/documents/page.tsx"), "utf8");

test("invoice settings return validation errors instead of throwing Zod runtime errors", () => {
  assert.match(actions, /profileSchema\.safeParse/);
  assert.doesNotMatch(actions, /profileSchema\.parse/);
  assert.match(actions, /error=validation/);
  assert.match(actions, /error=counter-validation/);
  assert.match(page, /integration-error/);
});

test("invoice logo is selected visually from official assets instead of a typed server path", () => {
  assert.match(page, /className="document-logo-picker"/);
  assert.match(page, /name="logoPath"[\s\S]{0,80}required[\s\S]{0,80}type="radio"/);
  assert.match(page, /<Image/);
  assert.match(page, /\/brand\/quotation-logo\.png/);
  assert.match(page, /Pilih salah satu logo resmi/);
  assert.doesNotMatch(page, /Path logo yang disetujui/);
  assert.doesNotMatch(page, /name="logoPath"[\s\S]{0,80}type="text"/);
});
