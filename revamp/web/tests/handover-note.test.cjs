/* eslint-disable @typescript-eslint/no-require-imports -- Isolated Node test loads TypeScript without a build. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    filename,
  );

const {
  acceptedAmount,
  committedAmount,
  formatHandoverNumber,
  handoverDetailsEqual,
  handoverDetailsSchema,
  handoverRenderData,
  validateHandoverDetails,
} = require(join(__dirname, "../src/features/operations/handover-note.ts"));

const base = {
  recipient: "PT Contoh",
  location: "Gudang Bandung",
  condition: "good",
  note: "",
  senderName: "",
  driverName: "",
  receiverName: "",
  items: [{ lineId: "e03d4bdf-ec54-465e-83d7-342b2d94c615", accepted: "100" }],
};

test("legacy full receipts keep meaning; partial receipts without quantities never invent full acceptance", () => {
  assert.equal(acceptedAmount("received", "100", null), 100);
  assert.equal(acceptedAmount("received_partial", "100", null), 0);
  assert.equal(acceptedAmount("received_partial", "100", "80"), 80);
  assert.equal(committedAmount("received_partial", "100", "80"), 80);
});
const lines = [{ lineId: base.items[0].lineId, quantity: "100" }];

test("nomor STB tahunan memakai bulan Romawi dan Jakarta", () => {
  assert.equal(formatHandoverNumber(32, new Date("2026-05-29T08:00:00+07:00")), "STB/AMB/032/V/2026");
  assert.throws(() => formatHandoverNumber(0, new Date()), /tidak valid/);
});

test("penerimaan 80 dari 100 mengembalikan 20 ke kapasitas kiriman pengganti", () => {
  const partial = {
    ...base,
    condition: "partial",
    note: "Kurang 20 unit",
    items: [{ ...base.items[0], accepted: "80" }],
  };
  assert.equal(handoverDetailsSchema.safeParse(partial).success, true);
  assert.equal(validateHandoverDetails(partial, lines).shortage, true);
  assert.equal(committedAmount("received_partial", "100", "80"), 80);
  assert.equal(100 - committedAmount("received_partial", "100", "80"), 20);
  assert.equal(acceptedAmount("received", "20", "20") + acceptedAmount("received_partial", "100", "80"), 100);
  assert.equal(acceptedAmount("received", "100", null), 100, "arsip lama tetap berarti diterima penuh");
  assert.equal(committedAmount("shipped", "20", null), 20);
});

test("STB menolak jumlah berlebih, duplikat, dan selisih tanpa catatan", () => {
  assert.throws(
    () => validateHandoverDetails({ ...base, items: [{ ...base.items[0], accepted: "101" }] }, lines),
    /melebihi/,
  );
  assert.throws(
    () => validateHandoverDetails({ ...base, items: [{ ...base.items[0], accepted: "80" }] }, lines),
    /Jelaskan/,
  );
  assert.throws(
    () => validateHandoverDetails({ ...base, items: [base.items[0], base.items[0]] }, lines),
    /tidak sesuai/,
  );
  assert.throws(
    () => validateHandoverDetails({ ...base, condition: "partial", note: "Catatan contoh" }, lines),
    /memerlukan jumlah/,
  );
});

test("rincian PDF cocok walau JSONB menyusun ulang properti", () => {
  const reordered = {
    items: [{ accepted: "100", lineId: base.items[0].lineId }],
    receiverName: "",
    driverName: "",
    senderName: "",
    note: "",
    condition: "good",
    location: "Gudang Bandung",
    recipient: "PT Contoh",
  };
  assert.equal(handoverDetailsEqual(base, reordered), true);
  assert.equal(handoverDetailsEqual(base, { ...reordered, items: [{ ...reordered.items[0], accepted: "80" }] }), false);
});

test("PDF membiarkan isian opsional kosong dan mengamankan teks barang", () => {
  const data = handoverRenderData({
    number: "UJI-STB",
    version: 2,
    issuedAt: new Date("2026-09-29T08:00:00+07:00"),
    customerName: "PT Contoh",
    shipmentNo: "K-1",
    deliveryNo: "SJ-1",
    poNo: "",
    deliveryOrderNo: "",
    vehiclePlate: "",
    details: base,
    lines: [
      {
        lineId: base.items[0].lineId,
        description: "Spacer <script>",
        unit: "pcs",
        quantity: "100",
        logistics: { karungCount: "", packCount: "", piecesPerPack: "", grossKg: "", netKg: "", remark: "" },
      },
    ],
    issuer: { legalName: "CV Contoh", address: "Bandung", phone: "", email: "", website: "", logoDataUri: "" },
  });
  assert.equal(data.nomor_po, "");
  assert.equal(data.nomor_polisi, "");
  assert.match(data.baris_barang, /Spacer &lt;script&gt;/);
  assert.doesNotMatch(data.baris_barang, /<script>/);
  assert.match(data.versi, /Revisi 2/);
});
