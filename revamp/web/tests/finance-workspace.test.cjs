/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("workspace Keuangan menjaga kontrak mobile dan tema token", () => {
  const css = read("src/app/admin/finance/finance.module.css");
  const page = read("src/app/admin/finance/page.tsx");
  const composer = read("src/app/admin/finance/finance-composer.tsx");
  const sidebar = read("src/components/admin-sidebar.tsx");

  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /\.filters,\s*\.twoColumn,\s*\.formGrid/);
  assert.match(css, /\.summary\s*\{\s*grid-template-columns: 1fr 1fr;/);
  assert.match(css, /@media \(max-width: 400px\)[\s\S]*grid-template-columns: 1fr;/);
  assert.match(css, /var\(--admin-/);
  assert.match(page, /aria-label="Ringkasan keuangan"/);
  assert.match(composer, /Catat transaksi/);
  assert.match(composer, /Pilih kategori “Payroll”/);
  assert.match(composer, /value="payroll">Payroll/);
  assert.doesNotMatch(composer, /Catat payroll/);
  assert.match(composer, /Dialog\.Content/);
  assert.match(composer, /container=\{portalContainer \?\? undefined\}/);
  assert.match(css, /\.dialogBackdrop[\s\S]*?z-index: 1000/);
  assert.match(
    css,
    /\.dialogContent[\s\S]*?background: var\(--admin-surface-elevated, var\(--admin-surface, #ffffff\)\)/,
  );
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?\.dialogContent[\s\S]*?inset: auto 0 0;/);
  assert.match(page, /id="piutang"/);
  assert.doesNotMatch(page, /href="#payroll"/);
  assert.match(sidebar, /href: "\/admin\/finance", label: "Keuangan"/);
  assert.match(sidebar, /"\/admin\/finance"/);
});

test("Piutang Keuangan selalu dibatasi ke transaksi production", () => {
  const service = read("src/features/finance/service.ts");
  assert.match(service, /eq\(businessTransactions\.dataClass, "production"\)/);
  assert.doesNotMatch(service, /dataClass, "test"/);
});
