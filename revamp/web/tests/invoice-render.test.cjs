/* eslint-disable @typescript-eslint/no-require-imports -- Node test fixture loads TypeScript without a build. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const Module = require("node:module");
const { join } = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const filename = join(__dirname, "../src/features/operations/invoice-render-data.ts");
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = module.paths;
loaded._compile(
  ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  filename,
);
const { invoiceRenderData } = loaded.exports;

test("HTML baris barang diizinkan tetapi teks pelanggan dan item aman", () => {
  const output = invoiceRenderData({
    number: "INV/AMB/001/IX/2026",
    date: new Date("2026-09-29T00:00:00Z"),
    dueAt: new Date("2026-10-29T00:00:00Z"),
    transactionNo: "TRX-UJI",
    title: "Spacer",
    customerName: "PT <script>alert(1)</script>",
    customerAddress: "Alamat",
    customerTaxId: "",
    poNumber: "PO-1",
    terms: "Pembayaran 14 hari",
    issuer: null,
    preview: {
      kind: "final",
      lines: [
        {
          description: "<img src=x onerror=alert(1)>",
          quantity: "1",
          unit: "pcs",
          materialName: "HDPE",
          unitPrice: "1000",
          gross: "1000",
          discount: "100",
          discountKind: "percent",
          discountValue: "10",
        },
      ],
      gross: "1000",
      discount: "100",
      subtotal: "900",
      dpp: "825",
      tax: "99",
      dpApplied: "0",
      amountDue: "999",
    },
  });
  assert.equal(output.nama_pelanggan, "PT <script>alert(1)</script>"); // Handlebars double braces escape scalar text.
  assert.equal(output.total, output.total_tagihan); // Existing dummy template remains usable.
  assert.match(output.baris_barang, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(output.baris_barang, /<img/);
  assert.match(output.baris_barang, /10%/);
  const template = readFileSync(join(__dirname, "../docs/templates/invoice-resmi-docgen.html"), "utf8");
  assert.match(template, /{{{baris_barang}}}/);
  assert.match(template, /{{{logo}}}/);
});
