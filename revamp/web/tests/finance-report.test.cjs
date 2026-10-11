/* eslint-disable @typescript-eslint/no-require-imports -- Isolated report module tests. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const ExcelJS = require("exceljs");
const ts = require("typescript");

function load(file, dependencies = {}) {
  const source = readFileSync(join(__dirname, "../src", file), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const instance = { exports: {} };
  new Function("module", "exports", "require", compiled)(instance, instance.exports, (name) =>
    Object.hasOwn(dependencies, name) ? dependencies[name] : name.startsWith("@/") ? {} : require(name),
  );
  return instance.exports;
}

const reportModule = load("features/finance/finance-report.ts", {
  "@/lib/database/client": { getDatabase: () => null },
  "@/lib/database/schema": {},
});

function fixture() {
  const now = new Date("2026-10-08T05:00:00.000Z");
  return {
    query: { from: "2026-10-01", to: "2026-10-08" },
    generatedAt: now,
    entries: [
      {
        entry: {
          occurredAt: now,
          status: "pending",
          direction: "out",
          amount: "125000",
          kind: "bank_movement",
          counterpartyName: "=Jangan jadi formula",
          reference: "+REF-1",
          notes: "Catatan uji",
          verifiedAt: null,
          reconciledAt: null,
        },
        accountName: "Bank Operasional",
        categoryName: "Pembelian bahan",
        supplierName: null,
        transactionReference: null,
      },
    ],
    accounts: [
      {
        id: "a",
        name: "Bank Operasional",
        bankName: "Bank Mandiri",
        accountNoMasked: "•••• 9090",
        status: "active",
        balance: 7050000,
        reconciledAt: now,
      },
    ],
    invoices: [
      {
        invoiceNo: "INV-001",
        transactionReference: "TRX-001",
        customerName: "Pelanggan Uji",
        dueAt: now,
        status: "sent",
        amount: "750000",
      },
    ],
    summary: { incoming: 0, outgoing: 0, net: 0, pendingCount: 1, rejectedCount: 0, entryCount: 1 },
  };
}

test("query ekspor memakai periode valid dan menolak rentang terbalik", () => {
  assert.deepEqual(reportModule.parseFinanceReportQuery(new URLSearchParams("from=2026-10-01&to=2026-10-08")), {
    from: "2026-10-01",
    to: "2026-10-08",
    account: undefined,
  });
  assert.throws(
    () => reportModule.parseFinanceReportQuery(new URLSearchParams("from=2026-10-09&to=2026-10-08")),
    /Tanggal awal/,
  );
  assert.throws(
    () => reportModule.parseFinanceReportQuery(new URLSearchParams("account=bukan-uuid")),
    /Filter laporan/,
  );
});

test("workbook Keuangan memiliki empat sheet dan nilai formula diperlakukan sebagai teks", async () => {
  const bytes = await reportModule.renderFinanceWorkbook(fixture());
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  assert.deepEqual(
    workbook.worksheets.map((sheet) => sheet.name),
    ["Ringkasan", "Catatan Keuangan", "Rekening", "Piutang"],
  );
  const ledger = workbook.getWorksheet("Catatan Keuangan");
  assert.equal(ledger.getCell("G5").value, "'=Jangan jadi formula");
  assert.equal(ledger.getCell("H5").value, "'+REF-1");
  assert.equal(ledger.autoFilter, "A4:M5");
});

test("PDF Keuangan valid dan tidak mengubah data laporan", async () => {
  const report = fixture();
  const before = JSON.stringify(report);
  const bytes = await reportModule.renderFinancePdf(report);
  assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), "%PDF-");
  assert.equal(JSON.stringify(report), before);
});

test("endpoint ekspor menolak role non-operasional dan memberi attachment privat", async () => {
  let user;
  let audits = 0;
  const route = load("app/api/admin/finance/export/route.ts", {
    "@/lib/auth/session": { getSession: async () => user },
    "@/lib/database/client": { getDatabase: () => ({ insert: () => ({ values: async () => audits++ }) }) },
    "@/lib/database/schema": { auditLogs: {} },
    "@/features/finance/finance-report": {
      FinanceReportInputError: reportModule.FinanceReportInputError,
      parseFinanceReportQuery: () => ({ from: "2026-10-01", to: "2026-10-08" }),
      getFinanceReport: async () => fixture(),
      renderFinancePdf: async () => Buffer.from("%PDF-test"),
      renderFinanceWorkbook: async () => Buffer.from("xlsx-test"),
    },
  });
  const request = new Request("http://localhost/api/admin/finance/export?format=xlsx");
  for (user of [null, { role: "content" }]) assert.equal((await route.GET(request)).status, 403);
  user = { id: "user-1", role: "sales" };
  const response = await route.GET(request);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-disposition"), /laporan-keuangan-2026-10-01_sampai_2026-10-08\.xlsx/);
  assert.match(response.headers.get("cache-control"), /private, no-store/);
  assert.equal(audits, 1);
});
