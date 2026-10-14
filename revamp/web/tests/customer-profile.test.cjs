/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");

const read = (path) => readFileSync(path, "utf8");

test("customer profile schema preserves structured addresses and transaction snapshots", () => {
  const schema = read("src/lib/database/schema.ts");
  const migration = read("drizzle/0047_fair_carmella_unuscione.sql");
  assert.match(schema, /export const customerAddresses/);
  assert.match(schema, /export const indonesiaRegions/);
  assert.match(schema, /customerSnapshot: jsonb\("customer_snapshot"\)/);
  assert.match(migration, /customer_addresses_one_billing_idx/);
  assert.match(migration, /customer_addresses_one_default_delivery_idx/);
  assert.match(migration, /customer_contacts_one_primary_idx/);
  assert.match(migration, /UPDATE "business_transactions" AS transaction/);
  assert.match(migration, /'ZZ', 'Belum ditentukan'/);
});

test("region catalog is pinned and never fetched by the runtime route", () => {
  const importer = read("scripts/import-indonesia-regions.mjs");
  const route = read("src/app/api/admin/regions/route.ts");
  assert.match(importer, /493bd1c390ca6dc8156cd3fd579394b375ab2398/);
  assert.match(importer, /90_000/);
  assert.match(route, /regionOptions/);
  assert.doesNotMatch(route, /github|emsifa|fetch\(/i);
});

test("Admin and Sales manage complete customer profiles while deletion stays admin-only", () => {
  const page = read("src/app/admin/masters/[kind]/page.tsx");
  const action = read("src/features/operations/customer-profile-actions.ts");
  const dialog = read("src/components/customer-profile-dialog.tsx");
  assert.match(page, /user\.role === "sales" && rawKind === "customers"/);
  assert.match(page, /canDelete=\{user\.role === "admin"\}/);
  assert.match(action, /\["admin", "sales"\]\.includes\(user\.role\)/);
  assert.match(action, /Pilih tepat satu PIC utama/);
  assert.match(action, /normalizeIndonesiaAddress/);
  assert.match(dialog, /Alamat penagihan/);
  assert.match(dialog, /Alamat pengiriman/);
  assert.match(dialog, /Kontak \/ PIC/);
  assert.match(dialog, /admin-sheet--customer-profile/);
});

test("new transactions freeze the customer profile and document generation reads that snapshot", () => {
  const actions = read("src/features/operations/actions.ts");
  const service = read("src/features/operations/service.ts");
  const workflow = read("src/features/operations/workflow-actions.ts");
  assert.match(actions, /snapshotCustomerProfile/);
  assert.match(actions, /customerSnapshot,/);
  assert.match(service, /customerSnapshot: businessTransactions\.customerSnapshot/);
  assert.match(service, /formatCustomerAddress\(customerSnapshot\?\.billingAddress\)/);
  assert.match(workflow, /customerSnapshotView/);
  assert.match(workflow, /snapshot\?\.billingAddress/);
});

test("transaction completion edits its snapshot and updates the master only by explicit choice", () => {
  const sheet = read("src/components/customer-document-profile-sheet.tsx");
  const action = read("src/features/operations/customer-document-actions.ts");
  assert.match(sheet, /name="updateMaster"/);
  assert.match(sheet, /Perbarui juga Master Pelanggan/);
  assert.match(action, /updateMaster: formData\.get\("updateMaster"\) === "on"/);
  assert.match(action, /update\(businessTransactions\)/);
  assert.match(action, /if \(updateMaster\)/);
  assert.doesNotMatch(action, /delete\(customerContacts\)|delete\(customerAddresses\)/);
  assert.match(action, /update\(customerContacts\)/);
  assert.match(action, /update\(customerAddresses\)/);
});

test("legacy incomplete customers can save edits with field-linked errors and named delete confirmation", () => {
  const action = read("src/features/operations/customer-profile-actions.ts");
  const dialog = read("src/components/customer-profile-dialog.tsx");
  assert.match(action, /const newCustomer = !profile\.id/);
  assert.match(action, /if \(newCustomer && !profile\.billingAddress\)/);
  assert.match(action, /customerProfileComplete\(profile\)\s*\? "Data pelanggan diperbarui\."/);
  assert.match(dialog, /customer-profile-error-summary/);
  assert.match(dialog, /summaryRef\.current\?\.focus\(\)/);
  assert.match(dialog, /Yakin ingin menghapus/);
  assert.match(dialog, /masih dipakai transaksi atau file/);
});

test("PDF preview uses the real compiler and a sandbox instead of duplicate mock markup", () => {
  const editor = read("src/components/document-template-editor.tsx");
  const route = read("src/app/api/admin/document-templates/preview/route.ts");
  const compiler = read("src/features/operations/document-templates.ts");
  assert.match(editor, /document-templates\/preview/);
  assert.match(editor, /<iframe sandbox=""/);
  assert.doesNotMatch(editor, /PT Pelanggan Contoh/);
  assert.match(route, /renderAnonymousDocumentPreview/);
  assert.match(route, /cache-control": "no-store"/);
  assert.match(compiler, /\/brand\/quotation-logo\.png/);
  assert.match(compiler, /background:#102b49/);
  assert.match(compiler, /@media screen\{body\{padding:17mm 5mm 19mm!important\}\}/);
  for (const template of [
    "penawaran-docgen.html",
    "invoice-resmi-docgen.html",
    "surat-jalan-docgen.html",
    "bast-docgen.html",
  ]) {
    assert.match(read(`docs/templates/${template}`), /margin: (?:16|17)mm 5mm (?:18|19)mm;/);
  }
});
