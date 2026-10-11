/* eslint-disable @typescript-eslint/no-require-imports -- Node's built-in test runner loads this isolated CommonJS fixture. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const Module = require("node:module");
const { join } = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function loadTypeScript(relativePath) {
  const filename = join(__dirname, relativePath);
  const source = readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = module.paths;
  loaded._compile(compiled, filename);
  return loaded.exports;
}

const { calculateQuote, quoteSnapshotMatches } = loadTypeScript("../src/features/operations/quote-math.ts");
const { invoiceCountsAsIssued, invoiceStatusLabel } = loadTypeScript(
  "../src/features/operations/transaction-status.ts",
);

test("harga dasar dan pajak dihitung terpisah tanpa pembulatan floating point", () => {
  const quote = calculateQuote([
    { description: "Spacer conduit", quantity: "2.5", unit: "pcs", unitPrice: "1000.00", taxRate: "11" },
    { description: "Jasa contoh", quantity: "1", unit: "paket", unitPrice: "100.50", taxRate: "0" },
  ]);
  assert.equal(quote.subtotal, "2600.50");
  assert.equal(quote.tax, "275.00");
  assert.equal(quote.total, "2875.50");
  assert.equal(quote.lines[0].subtotal, "2500.00");
});

test("jumlah sangat kecil dibulatkan ke sen terdekat", () => {
  const quote = calculateQuote([
    { description: "Sampel", quantity: "0.001", unit: "pcs", unitPrice: "15.00", taxRate: "0" },
  ]);
  assert.equal(quote.total, "0.02");
});

test("snapshot penawaran dari JSONB cocok meskipun urutan properti berubah", () => {
  const lines = [{ description: "Spacer", quantity: "2.000", unit: "pcs", unitPrice: "1000.00", taxRate: "0.00" }];
  const stored = JSON.parse(JSON.stringify(calculateQuote(lines)));
  const reordered = {
    tax: stored.tax,
    lines: stored.lines.map((line) => Object.fromEntries(Object.entries(line).reverse())),
    total: stored.total,
    dpp: stored.dpp,
    discount: stored.discount,
    gross: stored.gross,
    subtotal: stored.subtotal,
  };
  assert.equal(quoteSnapshotMatches(reordered, lines), true);
  assert.equal(quoteSnapshotMatches(reordered, [{ ...lines[0], unitPrice: "2000.00" }]), false);
});

test("diskon rupiah dan persen mengurangi dasar pajak sebelum PPN", () => {
  const quote = calculateQuote([
    {
      description: "Barang A",
      quantity: "2",
      unit: "pcs",
      unitPrice: "100000",
      taxRate: "12",
      taxMethod: "dpp_11_12",
      discountKind: "amount",
      discountValue: "20000",
    },
    {
      description: "Barang B",
      quantity: "1",
      unit: "pcs",
      unitPrice: "100000",
      taxRate: "12",
      taxMethod: "dpp_11_12",
      discountKind: "percent",
      discountValue: "10",
    },
  ]);
  assert.equal(quote.gross, "300000.00");
  assert.equal(quote.discount, "30000.00");
  assert.equal(quote.subtotal, "270000.00");
  assert.equal(quote.dpp, "247500.00");
  assert.equal(quote.tax, "29700.00");
  assert.equal(quote.total, "299700.00");
});

test("angka pada invoice contoh dihitung dengan DPP nilai lain", () => {
  const quote = calculateQuote([
    {
      description: "Produk contoh",
      quantity: "13089",
      unit: "pcs",
      unitPrice: "3100",
      taxRate: "12",
      taxMethod: "dpp_11_12",
      discountKind: "none",
      discountValue: "0",
    },
  ]);
  assert.equal(quote.subtotal, "40575900.00");
  assert.equal(quote.dpp, "37194575.00");
  assert.equal(quote.tax, "4463349.00");
  assert.equal(quote.total, "45039249.00");
});

test("nilai tidak valid dan pajak di atas 100 persen ditolak", () => {
  assert.throws(() => calculateQuote([]));
  assert.throws(() =>
    calculateQuote([{ description: "X", quantity: "1", unit: "pcs", unitPrice: "100", taxRate: "101" }]),
  );
  assert.throws(() =>
    calculateQuote([{ description: "X", quantity: "0", unit: "pcs", unitPrice: "100", taxRate: "0" }]),
  );
});

test("status invoice lama tetap dihitung sebagai tagihan terbit", () => {
  for (const status of ["issued", "sent", "partial", "paid", "overdue"]) {
    assert.equal(invoiceCountsAsIssued(status), true);
  }
  for (const status of ["draft", "cancelled"]) {
    assert.equal(invoiceCountsAsIssued(status), false);
  }
  assert.equal(invoiceStatusLabel("sent"), "Sudah dikirim");
  assert.equal(invoiceStatusLabel("partial"), "Dibayar sebagian");
});
