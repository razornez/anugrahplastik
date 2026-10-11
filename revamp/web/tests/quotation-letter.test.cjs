/* eslint-disable @typescript-eslint/no-require-imports -- Isolated Node test loads the TypeScript modules without a build. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const Module = require("node:module");
const { join } = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function load(relativePath, dependencies = {}) {
  const filename = join(__dirname, relativePath);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = module.paths;
  loaded.require = (name) => dependencies[name] ?? require(name);
  loaded._compile(
    ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    filename,
  );
  return loaded.exports;
}

const quoteMath = load("../src/features/operations/quote-math.ts");
const { defaultQuotationLetter, formatQuotationNumber, quotationRenderData, quotationLetterSchema } = load(
  "../src/features/operations/quotation-letter.ts",
  { "./quote-math": quoteMath },
);

test("nomor surat memakai bulan romawi Jakarta dan nomor tidak diduplikasi per revisi", () => {
  assert.equal(formatQuotationNumber(21, new Date("2026-09-29T00:00:00+07:00")), "SP/AMB/021/IX/2026");
  assert.equal(formatQuotationNumber(1, new Date("2027-01-01T00:00:00+07:00")), "SP/AMB/001/I/2027");
  assert.throws(() => formatQuotationNumber(0, new Date()), /tidak valid/);
});

test("tanggal tidak valid dan lampiran berlebih ditolak", () => {
  const letter = defaultQuotationLetter("Spacer", "Bandung");
  assert.equal(quotationLetterSchema.safeParse({ ...letter, validUntil: "2026-02-31" }).success, false);
  assert.equal(
    quotationLetterSchema.safeParse({ ...letter, attachmentIds: Array(9).fill("not-a-uuid") }).success,
    false,
  );
});

test("render surat menampilkan diskon, DPP dan hanya lampiran terpilih; HTML pelanggan aman", () => {
  const letter = {
    ...defaultQuotationLetter("Spacer <script>", "Jl. Uji & Contoh"),
    attachmentIds: ["11111111-1111-4111-8111-111111111111"],
  };
  const output = quotationRenderData({
    number: "UJI-001",
    version: 2,
    issuedAt: new Date("2026-09-29T08:00:00+07:00"),
    transactionNo: "TRX-UJI",
    customerName: "PT <script>",
    letter,
    lines: [
      {
        description: "Spacer <img src=x>",
        materialLabel: "PP & HDPE",
        mouldingLabel: "Ada",
        quantity: "2",
        unit: "set",
        unitPrice: "100000",
        taxRate: "12",
        taxMethod: "dpp_11_12",
        discountKind: "percent",
        discountValue: "10",
      },
    ],
    attachments: [
      { id: letter.attachmentIds[0], name: "Drawing <script>", category: "Drawing" },
      { id: "22222222-2222-4222-8222-222222222222", name: "Tidak terpilih", category: "Foto" },
    ],
    issuer: {
      legalName: "Penerbit",
      address: "Bandung",
      phone: "000",
      email: "a@example.invalid",
      website: "example.invalid",
      signerName: "Contoh",
      signerTitle: "Admin",
      logoDataUri: "data:image/png;base64,AA==",
    },
  });
  assert.equal(output.total_harga.replace(/\s/g, ""), "Rp200.000");
  assert.equal(output.diskon.replace(/\s/g, ""), "Rp20.000");
  assert.equal(output.nilai_setelah_diskon.replace(/\s/g, ""), "Rp180.000");
  assert.equal(output.dpp.replace(/\s/g, ""), "Rp165.000");
  assert.equal(output.pajak.replace(/\s/g, ""), "Rp19.800");
  assert.equal(output.grand_total.replace(/\s/g, ""), "Rp199.800");
  assert.match(output.baris_barang, /&lt;img src=x&gt;/);
  assert.match(output.lampiran, /Drawing &lt;script&gt;/);
  assert.doesNotMatch(output.lampiran, /Tidak terpilih/);
  assert.equal(output.penerima, "PT <script>"); // Handlebars escapes values in double braces.
  const template = readFileSync(join(__dirname, "../docs/templates/penawaran-docgen.html"), "utf8");
  assert.match(template, /{{{baris_barang}}}/);
  assert.match(template, /{{{lampiran}}}/);
});
