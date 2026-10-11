/* eslint-disable @typescript-eslint/no-require-imports -- Node's built-in test runner uses CommonJS fixtures. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const templates = [
  ["penawaran-docgen.html", "nomor_penawaran", "SURAT PENAWARAN"],
  ["invoice-resmi-docgen.html", "nomor_invoice", "{{jenis_tagihan}}"],
  ["surat-jalan-docgen.html", "nomor_surat_jalan", "SURAT JALAN"],
  ["bast-docgen.html", "nomor_stb", "BERITA ACARA SERAH TERIMA BARANG"],
];

for (const [filename, numberField, heading] of templates) {
  test(`${filename} memakai kop, penanda pratinjau, dan nomor halaman yang seragam`, () => {
    const html = readFileSync(join(__dirname, "../docs/templates", filename), "utf8");
    assert.match(html, /<html lang="id">/);
    assert.match(html, /size: A4/);
    assert.match(html, /CV\. ANUGRAHPLASTIK MANDIRI BANDUNG/);
    assert.match(html, /Spesialis injeksi plastik, spare part, rubber, logam, dan lain-lain/);
    assert.match(html, /@top-center/);
    assert.match(html, /counter\(page\)/);
    assert.ok(html.includes(`{{${numberField}}}`));
    assert.ok(html.includes(heading));
    assert.match(html, /{{#if isDummy}}[\s\S]*?DRAF CONTOH - BUKAN DOKUMEN RESMI[\s\S]*?{{\/if}}/);
    assert.match(html, /{{#if isPreview}}[\s\S]*?PRATINJAU DESAIN[\s\S]*?{{\/if}}/);
    assert.match(html, /{{{baris_barang}}}/);
  });
}
