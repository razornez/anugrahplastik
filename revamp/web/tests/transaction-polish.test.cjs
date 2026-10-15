/* eslint-disable @typescript-eslint/no-require-imports -- Isolated pure-function test uses TypeScript transpilation. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const Module = require("node:module");
const { resolve } = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function load(relative) {
  const filename = resolve(__dirname, "../src", relative);
  const item = new Module(filename, module);
  item.filename = filename;
  item.paths = module.paths;
  item._compile(
    ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    filename,
  );
  return item.exports;
}

const money = load("lib/rupiah-format.ts");
const stock = load("features/operations/shipment-stock.ts");
const delivery = load("features/operations/delivery-note.ts");

test("Rupiah baru bulat, paste berkelompok, dan nominal lama desimal tetap utuh", () => {
  assert.equal(money.formatRupiahInput("1000000"), "Rp 1.000.000");
  assert.equal(money.parseRupiahInput("Rp 1.000.000"), "1000000");
  assert.equal(money.formatRupiahInput("1000000.50"), "Rp 1.000.000,50");
  assert.equal(money.parseRupiahInput("-100"), null);
  assert.equal(money.parseRupiahInput("1.000.000x"), null);
});

test("stok per item mengecualikan sampel dan batch multi-item lama yang belum dipetakan", () => {
  const lines = [
    { id: "a", quantity: "100" },
    { id: "b", quantity: "20" },
  ];
  const batches = [
    { transactionLineId: "a", kind: "production", status: "completed", completedQuantity: "70" },
    { transactionLineId: "b", kind: "sample", status: "completed", completedQuantity: "20" },
    { transactionLineId: null, kind: "production", status: "completed", completedQuantity: "50" },
  ];
  const allocations = [{ lineId: "a", shipmentId: "first", quantity: "30", status: "shipped" }];
  assert.deepEqual(
    [...stock.shipmentAvailableByLine(lines, batches, allocations)],
    [
      ["a", 40],
      ["b", 0],
    ],
  );
  assert.equal(stock.shipmentAvailableByLine(lines, batches, allocations, "first").get("a"), 70);
});

test("penerimaan parsial hanya mengikat jumlah diterima dan pesan pack menyebut angka yang salah", () => {
  const lines = [{ id: "a", quantity: "100" }];
  const batches = [{ transactionLineId: "a", kind: "production", status: "completed", completedQuantity: "100" }];
  const allocations = [
    { lineId: "a", shipmentId: "first", quantity: "100", acceptedQuantity: "80", status: "received_partial" },
  ];
  assert.equal(stock.shipmentAvailableByLine(lines, batches, allocations).get("a"), 20);
  assert.match(
    delivery.shipmentPackError({ ...delivery.emptyLogistics, packCount: "2", piecesPerPack: "40" }, "100", "pcs"),
    /80 pcs.*100 pcs/,
  );
  assert.equal(
    delivery.shipmentPackError({ ...delivery.emptyLogistics, packCount: "2", piecesPerPack: "50" }, "100", "pcs"),
    null,
  );
});

test("jadwal rencana WIB berbeda dari tanggal penerbitan, dan snapshot sumber tersimpan", () => {
  const data = delivery.deliveryRenderData({
    number: "SJ/AMB/001/X/2026",
    version: 1,
    issuedAt: new Date("2026-10-14T02:00:00Z"),
    plannedShipAt: new Date("2026-10-16T03:30:00Z"),
    customerName: "PT Uji",
    recipientName: "PIC Uji",
    address: "Gudang Uji",
    poNo: "PO-1",
    details: { ...delivery.emptyDeliveryDetails, recipientContactId: "pic-1", deliveryAddressId: "gudang-1" },
    lines: [{ description: "Spacer", quantity: "10", unit: "pcs", logistics: delivery.emptyLogistics }],
    issuer: {
      legalName: "CV Uji",
      address: "Bandung",
      phone: "0",
      email: "uji@example.invalid",
      website: "",
      logoDataUri: "",
    },
  });
  assert.match(data.jadwal_pengiriman, /16 Oktober 2026.*10\.30 WIB/);
  assert.match(data.tanggal, /14 Oktober 2026/);
  assert.equal(data.penerima, "PIC Uji");
});
