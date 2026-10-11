/* eslint-disable @typescript-eslint/no-require-imports -- Isolated Node test loads TypeScript without a build. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const Module = require("node:module");
const { join } = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const filename = join(__dirname, "../src/features/operations/delivery-note.ts");
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = module.paths;
loaded._compile(
  ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  filename,
);
const {
  deliveryDetailsSchema,
  deliveryRenderData,
  emptyDeliveryDetails,
  emptyLogistics,
  formatDeliveryNumber,
  shipmentLogisticsSchema,
  validateShipmentLogistics,
} = loaded.exports;

test("nomor surat jalan resmi memakai bulan romawi Jakarta", () => {
  assert.equal(formatDeliveryNumber(32, new Date("2026-05-29T08:00:00+07:00")), "SJ/AMB/032/V/2026");
  assert.equal(formatDeliveryNumber(1, new Date("2027-01-01T00:00:00+07:00")), "SJ/AMB/001/I/2027");
  assert.throws(() => formatDeliveryNumber(0, new Date()), /tidak valid/);
});

test("kemasan dan berat opsional, tetapi nilai negatif serta rincian tak cocok ditolak", () => {
  assert.equal(shipmentLogisticsSchema.safeParse(emptyLogistics).success, true);
  assert.equal(deliveryDetailsSchema.safeParse(emptyDeliveryDetails).success, true);
  assert.equal(shipmentLogisticsSchema.safeParse({ ...emptyLogistics, grossKg: "-1" }).success, false);
  assert.throws(
    () => validateShipmentLogistics({ ...emptyLogistics, grossKg: "9", netKg: "10" }, "100", "pcs"),
    /bruto/,
  );
  assert.throws(
    () => validateShipmentLogistics({ ...emptyLogistics, packCount: "2", piecesPerPack: "40" }, "100", "pcs"),
    /Jumlah pack/,
  );
  assert.doesNotThrow(() =>
    validateShipmentLogistics({ ...emptyLogistics, packCount: "2", piecesPerPack: "50" }, "100", "pcs"),
  );
  assert.doesNotThrow(() =>
    validateShipmentLogistics({ ...emptyLogistics, packCount: "2", piecesPerPack: "40" }, "100", "set"),
  );
});

test("render surat mempertahankan isian kosong dan mengamankan HTML barang", () => {
  const data = deliveryRenderData({
    number: "UJI-001",
    version: 2,
    issuedAt: new Date("2026-09-29T08:00:00+07:00"),
    customerName: "PT Contoh",
    recipientName: "PT Contoh",
    address: "Bandung",
    poNo: "",
    details: emptyDeliveryDetails,
    lines: [
      {
        description: "Barang <script>",
        quantity: "100.000",
        unit: "pcs",
        logistics: { ...emptyLogistics, packCount: "2", piecesPerPack: "50" },
      },
    ],
    issuer: {
      legalName: "CV Contoh",
      address: "Bandung",
      phone: "000",
      email: "uji@example.invalid",
      website: "contoh.invalid",
      logoDataUri: "data:image/png;base64,abc",
    },
  });
  assert.equal(data.nomor_po, "");
  assert.equal(data.nomor_do, "");
  assert.match(data.baris_barang, /Barang &lt;script&gt;/);
  assert.doesNotMatch(data.baris_barang, /<script>/);
  assert.match(data.baris_barang, /100 pcs/);
  assert.match(data.baris_barang, /2 × 50 pcs\/pack/);
  assert.match(data.versi, /Revisi 2/);
});
