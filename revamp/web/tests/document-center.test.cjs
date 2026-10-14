/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");

const read = (path) => readFileSync(path, "utf8");

test("document center owns identity, counters, and readiness", () => {
  const page = read("src/app/admin/settings/documents/page.tsx");
  assert.match(page, /Identitas penerbit/);
  assert.match(page, /Nomor urut/);
  assert.match(page, /Template Dokumen PDF/);
  assert.match(page, /Simpan dan aktifkan/);
  assert.match(page, /Siap menerbitkan dokumen/);
  assert.doesNotMatch(page, /dummy|readiness flag|provider mode/i);
});

test("legacy document settings routes redirect to one center", () => {
  for (const name of ["quotation", "invoice", "delivery", "handover"]) {
    const page = read(`src/app/admin/settings/${name}/page.tsx`);
    assert.match(page, /redirect\("\/admin\/settings\/documents/);
  }
});

test("email and PDF template areas remain independent", () => {
  const email = read("src/app/admin/settings/email-templates/page.tsx");
  const pdf = read("src/app/admin/settings/templates/page.tsx");
  assert.match(email, />\s*Email\s*</);
  assert.match(email, />\s*Dokumen PDF\s*</);
  assert.match(pdf, /DocumentTemplateEditor/);
  assert.doesNotMatch(pdf, /EmailTemplateSettingsEditor/);
});

test("PDF versions are immutable and active through a catalog pointer", () => {
  const migration = read("drizzle/0046_document_template_catalog.sql");
  const service = read("src/features/operations/document-templates.ts");
  assert.match(migration, /document_template_versions/);
  assert.match(migration, /document_template_catalogs/);
  assert.match(migration, /active_version_id/);
  assert.match(service, /status: "failed"/);
  assert.match(service, /status: "active"/);
  assert.match(service, /Kontrak variabel dokumen berubah/);
  assert.match(service, /v1\/batches/);
  assert.match(service, /%PDF-/);
});

test("PDF editor imports only browser-safe shared metadata", () => {
  const editor = read("src/components/document-template-editor.tsx");
  assert.match(editor, /document-template-shared/);
  assert.doesNotMatch(editor, /document-templates"/);
  assert.match(editor, /useFormStatus/);
  assert.match(editor, /aria-busy=\{pending\}/);
  assert.match(editor, /disabled=\{pending\}/);
});

test("transaction page avoids a global draft-provider banner", () => {
  const page = read("src/app/admin/transactions/[id]/page.tsx");
  assert.doesNotMatch(page, /DocGen masih memakai template DRAF CONTOH/);
  assert.match(page, /Nomor dibuat otomatis saat PDF diterbitkan/);
  assert.match(page, /Terbitkan PDF/);
  assert.match(page, /Buat revisi PDF/);
});

test("local PDF renderer uses the active structured template", () => {
  const renderer = read("src/features/operations/local-qa-renderer.ts");
  const worker = read("scripts/render-qa-pdf.mjs");
  assert.match(renderer, /getActiveDocumentTemplate/);
  assert.match(renderer, /compileDocumentTemplate/);
  assert.match(worker, /input\.templateHtml/);
});

test("VPS artifact carries official sources and uses an all-or-nothing initial publisher", () => {
  const packager = read("scripts/release/package-linux.sh");
  const publisher = read("scripts/release/publish-document-templates.mjs");
  assert.match(packager, /docs\/templates/);
  assert.match(packager, /publish-document-templates\.mjs/);
  assert.match(publisher, /publish-official-v1/);
  assert.match(publisher, /Smoke PDF/);
  assert.match(publisher, /await client\.query\("begin"\)/);
  assert.match(publisher, /await client\.query\("commit"\)/);
  assert.match(publisher, /await client\.query\("rollback"\)/);
  assert.doesNotMatch(publisher, /sendMail|nodemailer|SMTP/);
});
