/* eslint-disable @typescript-eslint/no-require-imports -- Compile pure TypeScript fixtures without a build. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const Module = require("node:module");
const { resolve, dirname } = require("node:path");
const test = require("node:test");
const ts = require("typescript");
function load(filename, stubs = {}) {
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = module.paths;
  loaded.require = (id) =>
    stubs[id] ??
    (id.startsWith("@/")
      ? load(resolve(__dirname, "../src", `${id.slice(2)}.ts`))
      : id.startsWith(".")
        ? load(resolve(dirname(filename), `${id}.ts`))
        : require(id));
  loaded._compile(
    ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    filename,
  );
  return loaded.exports;
}
const { transactionWorkspace, transactionStepStates, productionBatchProgress, workspaceMoney } = load(
  resolve(__dirname, "../src/features/operations/transaction-workspace.ts"),
);
const line = {
  description: "[UJI] Spacer",
  quantity: "100",
  unit: "pcs",
  unitPrice: "10000.00",
  taxRate: "12",
  taxMethod: "dpp_11_12",
  discountKind: "percent",
  discountValue: "10",
};
function input(patch = {}) {
  return {
    header: {
      title: "[UJI] Pekerjaan fiktif",
      quoteLetter: null,
      customerBillingAddress: null,
      commercialStatus: "quotation",
      fulfilmentStatus: "not_released",
    },
    lines: [line],
    invoices: [],
    entries: [],
    documents: [],
    batches: [],
    shipments: [],
    ...patch,
  };
}
const paid = (amount, status = "verified") => ({ amount, status, direction: "in", kind: "customer_payment" });

test("No invoice is not paid; quote uses shared discounts and tax", () => {
  const result = transactionWorkspace(input());
  assert.equal(result.quote, "999000.00");
  assert.equal(result.paymentLabel, "Belum ada invoice");
  assert.equal(result.step, "quote");
});
test("DP and net final invoices subtract payments once, cancelled invoices excluded", () => {
  const result = transactionWorkspace(
    input({
      invoices: [
        { amount: "400000.00", status: "paid" },
        { amount: "599000.00", status: "sent" },
        { amount: "999000.00", status: "cancelled" },
      ],
      entries: [paid("400000.00"), paid("10000.00", "unverified")],
    }),
  );
  assert.equal(result.invoice, "999000.00");
  assert.equal(result.outstanding, "599000.00");
  assert.equal(result.pendingPayment, true);
  assert.equal(result.step, "production");
});
test("Paid invoices remain issued and overpayments separate", () => {
  const result = transactionWorkspace(
    input({ invoices: [{ amount: "0.30", status: "paid" }], entries: [paid("0.10"), paid("0.20"), paid("0.01")] }),
  );
  assert.equal(result.outstanding, "0.00");
  assert.equal(result.overpayment, "0.01");
  assert.equal(result.paymentLabel, "Invoice terbit lunas");
  assert.equal(result.step, "production");
});
test("Payment verification is visible while fulfilment continues", () => {
  const result = transactionWorkspace(
    input({
      header: { ...input().header, fulfilmentStatus: "production" },
      batches: [{ kind: "production", status: "completed", plannedQuantity: "100", completedQuantity: "100" }],
      entries: [paid("100000.00", "unverified")],
    }),
  );
  assert.equal(result.step, "delivery");
  assert.equal(result.pendingPayment, true);
});
test("Legacy taxes and corrupt financial values require review", () => {
  assert.equal(transactionWorkspace(input({ lines: [{ ...line, taxMethod: "legacy" }] })).quote, null);
  const result = transactionWorkspace(input({ invoices: [{ amount: "invalid", status: "issued" }] }));
  assert.equal(result.invoice, null);
  assert.equal(result.outstanding, null);
  assert.equal(result.paymentLabel, "Perlu ditinjau");
});
test("Step labels do not confuse partial payment, release or shipment with completion", () => {
  const partial = input({
    header: { ...input().header, fulfilmentStatus: "production" },
    invoices: [{ amount: "100.00", status: "issued" }],
    entries: [paid("20.00")],
    batches: [{ status: "completed" }],
    shipments: [{ status: "received_partial" }],
  });
  const states = transactionStepStates(partial);
  assert.equal(states.payment.label, "Dibayar sebagian");
  assert.equal(states.payment.kind, "progress");
  assert.equal(states.production.kind, "progress");
  assert.equal(states.delivery.kind, "progress");
  assert.equal(states.handover.kind, "attention");
  assert.equal(states.handover.label, "Ada selisih penerimaan");
  partial.entries.push({ ...paid("80.00"), status: "unverified" });
  assert.equal(transactionStepStates(partial).payment.label, "Menunggu verifikasi");
  partial.entries[1].status = "verified";
  assert.equal(transactionStepStates(partial).payment.label, "Invoice terbit lunas");
  assert.equal(transactionStepStates(partial).payment.kind, "complete");
});
test("Production checklist follows completed regular batches, not transaction closure", () => {
  const released = { ...input().header, fulfilmentStatus: "production" };
  const batch = { kind: "production", status: "completed", plannedQuantity: "100", completedQuantity: "100" };
  const complete = input({
    header: released,
    batches: [batch, { ...batch, kind: "sample", plannedQuantity: "10", completedQuantity: "10" }],
  });
  assert.equal(transactionStepStates(complete).production.kind, "complete");
  assert.equal(transactionWorkspace(complete).step, "delivery");
  assert.equal(
    transactionStepStates(input({ header: released, batches: [] })).production.label,
    "Belum ada batch produksi",
  );
  assert.equal(
    transactionStepStates(input({ header: released, batches: [{ ...batch, kind: "sample" }] })).production.kind,
    "progress",
  );
  assert.equal(
    transactionStepStates(input({ header: released, batches: [{ ...batch, completedQuantity: "90" }] })).production
      .kind,
    "progress",
  );
  assert.equal(
    transactionStepStates(input({ header: released, batches: [batch, { ...batch, status: "planned" }] })).production
      .label,
    "1 batch/sampel belum selesai",
  );
  assert.equal(productionBatchProgress([batch, { ...batch, status: "cancelled" }]).complete, true);
});
test("Empty, unknown financial data, signed receipt and closed/cancelled labels remain honest", () => {
  const empty = transactionStepStates(input());
  assert.equal(empty.payment.label, "Belum ada invoice");
  assert.equal(empty.production.label, "Belum dilepas");
  assert.equal(empty.delivery.label, "Belum ada pengiriman");
  assert.equal(empty.handover.label, "Menunggu bukti terima");
  assert.equal(
    transactionStepStates(input({ invoices: [{ amount: "bad", status: "issued" }] })).payment.label,
    "Perlu ditinjau",
  );
  assert.equal(transactionStepStates(input({ shipments: [{ status: "received" }] })).handover.kind, "progress");
  const closed = transactionStepStates(input({ header: { ...input().header, fulfilmentStatus: "completed" } }));
  assert.equal(closed.handover.kind, "complete");
  assert.equal(closed.production.kind, "progress");
  const cancelled = transactionStepStates(input({ header: { ...input().header, commercialStatus: "cancelled" } }));
  assert(Object.values(cancelled).every((item) => item.kind === "waiting" && item.label === "Arsip transaksi"));
});
test("Nominal discount, exact cents, verified inbound payments only", () => {
  const result = transactionWorkspace(
    input({
      lines: [{ ...line, discountKind: "amount", discountValue: "50000" }],
      invoices: [{ amount: "100.20", status: "overdue" }],
      entries: [
        paid("0.10"),
        paid("0.20"),
        { ...paid("90.00"), direction: "out" },
        { ...paid("90.00"), kind: "expense" },
      ],
    }),
  );
  assert.equal(result.quote, "1054500.00");
  assert.equal(result.received, "0.30");
  assert.equal(result.outstanding, "99.90");
  assert.equal(workspaceMoney("1000000.01"), "Rp 1.000.000,01");
  assert.equal(workspaceMoney(null), "Perlu ditinjau");
});
test("PO advances to invoice; sent/received partial shipments advance to STB, not completion", () => {
  assert.equal(
    transactionWorkspace(input({ documents: [{ type: "purchase_order", status: "ready", version: 1, payload: null }] }))
      .step,
    "payment",
  );
  const result = transactionWorkspace(
    input({
      header: { ...input().header, fulfilmentStatus: "shipping" },
      batches: [{ kind: "production", status: "completed", plannedQuantity: "100", completedQuantity: "100" }],
      shipments: [{ status: "received_partial" }],
    }),
  );
  assert.equal(result.step, "handover");
  assert.equal(result.action, "Unggah STB bertanda tangan");
});
test("Unfinished production stays in production, not delivery", () => {
  assert.equal(
    transactionWorkspace(
      input({ header: { ...input().header, fulfilmentStatus: "production" }, batches: [{ status: "in_progress" }] }),
    ).step,
    "production",
  );
});
test("Quotation snapshots compare business fields, not database IDs", () => {
  const { calculateQuote } = load(resolve(__dirname, "../src/features/operations/quote-math.ts"));
  const { readQuotationLetter } = load(resolve(__dirname, "../src/features/operations/quotation-letter.ts"));
  const storedLine = { ...line, materialLabel: "PP", mouldingLabel: "0" };
  const base = input({ lines: [{ ...storedLine, id: "database-only", transactionId: "database-only" }] });
  base.documents = [
    {
      type: "quotation",
      version: 1,
      status: "ready",
      payload: { quote: calculateQuote([storedLine]), letter: readQuotationLetter(null, base.header.title, "") },
    },
  ];
  assert.equal(transactionWorkspace(base).currentQuote, true);
  assert.equal(transactionWorkspace(base).step, "order");
  base.lines[0].unitPrice = "20000.00";
  assert.equal(transactionWorkspace(base).currentQuote, false);
});
test("Local grouped page never exposes test transactions", async (context) => {
  require("dotenv").config({ path: resolve(__dirname, "../.env.local"), quiet: true });
  if (
    !process.env.DATABASE_URL ||
    !["localhost", "127.0.0.1", "::1"].includes(new URL(process.env.DATABASE_URL).hostname)
  )
    return context.skip("Local database required");
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try {
    const { getTransactionPage } = load(resolve(__dirname, "../src/features/operations/service.ts"));
    const result = await getTransactionPage({ view: "test", search: "UJI COMPACT" });
    assert.equal(result.rows.length, 0);
  } finally {
    process.env.NODE_ENV = previous;
    if (global.pool) {
      await global.pool.end();
      delete global.pool;
    }
  }
});
test("Operations access accepts admin/sales and rejects content editors on the server", async () => {
  let user = { id: "fixture", name: "Fixture", role: "admin" };
  const access = load(resolve(__dirname, "../src/features/operations/access.ts"), {
    "@/lib/auth/session": { getSession: async () => user },
    "next/navigation": {
      redirect: () => {
        throw new Error("DENIED");
      },
    },
  });
  assert.equal((await access.requireOperationsAccess()).role, "admin");
  user = { ...user, role: "sales" };
  assert.equal((await access.requireOperationsAccess()).role, "sales");
  await assert.rejects(access.requireOperationsOwner(), /DENIED/);
  user = { ...user, role: "content" };
  await assert.rejects(access.requireOperationsAccess(), /DENIED/);
  user = null;
  await assert.rejects(access.requireOperationsAccess(), /DENIED/);
});
