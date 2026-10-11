/* eslint-disable @typescript-eslint/no-require-imports -- Node test fixture loads TypeScript without a build. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const Module = require("node:module");
const { join } = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function load(relativePath) {
  const filename = join(__dirname, relativePath);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = module.paths;
  loaded.require = (id) => (id === "./quote-math" ? load("../src/features/operations/quote-math.ts") : require(id));
  const source = readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  loaded._compile(compiled, filename);
  return loaded.exports;
}

const { calculateDpInvoice, calculateDeliveryInvoice, formatInvoiceNumber } = load(
  "../src/features/operations/invoice-math.ts",
);
const lines = [
  {
    id: "item-1",
    description: "Spacer",
    materialName: "HDPE",
    quantity: "100",
    unit: "pcs",
    unitPrice: "10000",
    taxRate: "12",
    taxMethod: "dpp_11_12",
    discountKind: "percent",
    discountValue: "10",
  },
];

test("nomor invoice memakai counter dan bulan Romawi", () => {
  assert.equal(formatInvoiceNumber(42, 2026, 9), "INV/AMB/042/IX/2026");
  assert.throws(() => formatInvoiceNumber(0, 2026, 9));
});

test("DP, dua pengiriman, dan kredit DP tidak menagih order dua kali", () => {
  const dp = calculateDpInvoice(lines, "300000.00");
  const first = calculateDeliveryInvoice({
    lines,
    shipment: [{ lineId: "item-1", quantity: "40" }],
    previouslyBilled: [],
    dpApplied: "150000",
    priorDpApplied: "0",
    dpIssued: "300000",
    dpTax: dp.tax,
    dpDpp: dp.dpp,
    verifiedPayments: "300000",
  });
  const second = calculateDeliveryInvoice({
    lines,
    shipment: [{ lineId: "item-1", quantity: "60" }],
    previouslyBilled: [{ lineId: "item-1", quantity: "40" }],
    dpApplied: "150000",
    priorDpApplied: "150000",
    dpIssued: "300000",
    dpTax: dp.tax,
    dpDpp: dp.dpp,
    verifiedPayments: "300000",
  });
  assert.equal(first.discount, "40000.00");
  assert.equal(second.discount, "60000.00");
  assert.equal(Number(first.goodsSubtotal) + Number(first.goodsTax), Number(first.goodsTotal));
  assert.equal(Number(first.goodsTotal) - Number(first.dpApplied), Number(first.amountDue));
  assert.equal(Number(second.goodsTotal) - Number(second.dpApplied), Number(second.amountDue));
  assert.equal(Number(dp.amountDue) + Number(first.amountDue) + Number(second.amountDue), 999000);
  assert.equal(Number(dp.tax) + Number(first.tax) + Number(second.tax), 99000);
  assert.throws(() =>
    calculateDeliveryInvoice({
      lines,
      shipment: [{ lineId: "item-1", quantity: "61" }],
      previouslyBilled: [{ lineId: "item-1", quantity: "40" }],
      dpApplied: "0",
      priorDpApplied: "0",
      dpIssued: "0",
      dpTax: "0",
      dpDpp: "0",
      verifiedPayments: "0",
    }),
  );
});

test("DP tidak boleh melebihi pembayaran yang sudah diverifikasi", () => {
  const dp = calculateDpInvoice(lines, "300000");
  assert.throws(() =>
    calculateDeliveryInvoice({
      lines,
      shipment: [{ lineId: "item-1", quantity: "40" }],
      previouslyBilled: [],
      dpApplied: "150000",
      priorDpApplied: "0",
      dpIssued: "300000",
      dpTax: dp.tax,
      dpDpp: dp.dpp,
      verifiedPayments: "0",
    }),
  );
});
