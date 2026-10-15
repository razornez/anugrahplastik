/* eslint-disable @typescript-eslint/no-require-imports -- Local database regression harness; external providers are blocked. */
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { readFileSync } = require("node:fs");
const Module = require("node:module");
const { resolve, dirname } = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function load(filename, stubs = {}, baseline = false, cache = new Map()) {
  if (cache.has(filename)) return cache.get(filename);
  const item = new Module(filename, module);
  item.filename = filename;
  item.paths = module.paths;
  item.require = (id) =>
    stubs[id] ??
    (id.startsWith("@/")
      ? load(resolve(__dirname, "../src", `${id.slice(2)}.ts`), stubs, baseline, cache)
      : id.startsWith(".")
        ? load(resolve(dirname(filename), `${id}.ts`), stubs, baseline, cache)
        : require(id));
  let source = readFileSync(filename, "utf8");
  if (baseline && filename.replaceAll("\\", "/").endsWith("operations/actions.ts")) {
    const lock =
      "await tx.execute(sql`select id from business_transactions where id = ${target.transactionId} for update`);";
    assert(source.includes(lock), "Baseline probe must remove only the new parent lock");
    source = source.replace(lock, "/* pre-fix verification: no order-level lock */");
    const received = 'const received = moneyCents(payments?.total ?? "0");';
    assert(source.includes(received), "Baseline probe must synchronize after reading totals");
    source = source.replace(received, `${received}\nawait require("qa/payment-barrier")();`);
  }
  item._compile(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
  cache.set(filename, item.exports);
  return item.exports;
}
function form(values) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
const blankLogistics = { karungCount: "", packCount: "", piecesPerPack: "", grossKg: "", netKg: "", remark: "" };

test("Local workflow: concurrent payment, roles, cancelled invoice, partial receipt/replacement and closure", async (context) => {
  require("dotenv").config({ path: resolve(__dirname, "../.env.local"), quiet: true });
  if (
    !process.env.DATABASE_URL ||
    !["127.0.0.1", "localhost", "[::1]"].includes(new URL(process.env.DATABASE_URL).hostname)
  )
    return context.skip("Local database required");
  const { Pool } = require("pg");
  const { drizzle } = require("drizzle-orm/node-postgres");
  const schema = load(resolve(__dirname, "../src/lib/database/schema.ts"));
  const pools = [
    new Pool({ connectionString: process.env.DATABASE_URL, max: 1, options: "-c statement_timeout=15000" }),
    new Pool({ connectionString: process.env.DATABASE_URL, max: 1, options: "-c statement_timeout=15000" }),
  ];
  const transactionId = randomUUID();
  const lineId = randomUUID();
  const customerId = randomUUID();
  const payments = [randomUUID(), randomUUID()];
  let role = "admin";
  let actor;
  let waiting = 0;
  let unblock;
  const barrier = new Promise((resolve) => {
    unblock = resolve;
  });
  function database(index) {
    return drizzle({ client: pools[index], schema });
  }
  const blocked = async () => {
    throw new Error("External provider blocked in workflow QA");
  };
  const stubs = (index) => ({
    "@/lib/database/schema": schema,
    "qa/payment-barrier": async () => {
      if (++waiting === 2) unblock();
      let timer;
      try {
        await Promise.race([
          barrier,
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("Concurrent baseline probe timed out")), 7000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
    "@/lib/database/client": { getDatabase: () => database(index) },
    "@/lib/auth/session": { getSession: async () => (role ? { ...actor, role } : null) },
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": {
      redirect: (destination) => {
        throw new Error(`QA_REDIRECT:${destination}`);
      },
    },
    "./docgen": { renderDocGenPdf: blocked, assertDocGenTestTransaction: blocked, quotationTemplateReady: () => false },
  });
  try {
    actor = (
      await pools[0].query(
        "select id,name from users where role='admin' and is_active=true order by created_at limit 1",
      )
    ).rows[0];
    assert(actor, "Active local administrator required");
    await pools[0].query(
      "insert into customers(id,code,legal_name,display_name) values($1,$2,'[UJI] Audit sementara','[UJI] Audit sementara')",
      [customerId, `QA-${customerId.slice(0, 8)}`],
    );
    await pools[0].query(
      "insert into business_transactions(id,reference_no,customer_id,owner_id,title,data_class,commercial_status,fulfilment_status) values($1,$2,$3,$4,'[UJI] Audit alur sementara — bukan pelanggan','test','invoice_issued','released')",
      [transactionId, `QA-FLOW-${transactionId.slice(0, 8)}`, customerId, actor.id],
    );
    await pools[0].query(
      "insert into transaction_lines(id,transaction_id,description,quantity,unit,unit_price,tax_rate,tax_method,discount_kind,discount_value) values($1,$2,'[UJI] Spacer',100,'pcs',10,0,'none','none',0)",
      [lineId, transactionId],
    );
    await pools[0].query(
      "insert into production_batches(transaction_id,transaction_line_id,batch_no,kind,status,planned_quantity,completed_quantity,completed_at) values($1,$2,$3,'production','completed',100,100,now())",
      [transactionId, lineId, `QA-BATCH-${transactionId.slice(0, 8)}`],
    );
    for (const [suffix, amount, status, kind] of [
      ["DP", 200, "paid", "dp"],
      ["FINAL", 800, "sent", "final"],
      ["CANCEL", 900, "cancelled", "final"],
    ])
      await pools[0].query(
        "insert into transaction_invoices(transaction_id,invoice_no,kind,amount,status,issued_at) values($1,$2,$3,$4,$5,now())",
        [transactionId, `QA-${transactionId.slice(0, 8)}-${suffix}`, kind, amount, status],
      );
    for (let i = 0; i < 2; i++)
      await pools[0].query(
        "insert into transaction_financial_entries(id,transaction_id,kind,direction,amount,occurred_at,status) values($1,$2,'customer_payment','in',$3,now(),'unverified')",
        [payments[i], transactionId, i ? 600 : 400],
      );
    const filename = resolve(__dirname, "../src/features/operations/actions.ts");
    // Deliberately synchronized pre-fix probe proves the race rather than relying on timing.
    await Promise.all(
      pools.map((_, i) => load(filename, stubs(i), true).verifyTransactionPayment(form({ entryId: payments[i] }))),
    );
    assert.equal(
      (await pools[0].query("select payment_status from business_transactions where id=$1", [transactionId])).rows[0]
        .payment_status,
      "partial",
      "Pre-fix race is reproduced",
    );
    await pools[0].query(
      "update transaction_financial_entries set status='unverified',verified_by=null,verified_at=null where id=any($1::uuid[])",
      [payments],
    );
    const actions = pools.map((_, i) => load(filename, stubs(i)));
    const operationKey = randomUUID();
    const paymentInput = { transactionId, operationKey, amount: "1.00", reference: "[UJI] retry" };
    await Promise.all(actions.map((action) => action.recordTransactionPayment(form(paymentInput))));
    await actions[0].recordTransactionPayment(form({ ...paymentInput, amount: "1" }));
    const recorded = (
      await pools[0].query("select id from transaction_financial_entries where operation_key=$1", [operationKey])
    ).rows;
    assert.equal(recorded.length, 1, "Concurrent/retried payment creates one entry");
    assert.equal(
      (
        await pools[0].query("select count(*)::int n from audit_logs where entity_id=$1 and metadata->>'entryId'=$2", [
          transactionId,
          recorded[0].id,
        ])
      ).rows[0].n,
      1,
    );
    await assert.rejects(actions[0].recordTransactionPayment(form({ ...paymentInput, amount: "2" })), /isi berbeda/);
    await assert.rejects(actions[0].recordTransactionPayment(form({ ...paymentInput, operationKey: "" })));
    await pools[0].query("delete from transaction_financial_entries where operation_key=$1 and transaction_id=$2", [
      operationKey,
      transactionId,
    ]);
    await Promise.all(actions.map((action, i) => action.verifyTransactionPayment(form({ entryId: payments[i] }))));
    assert.equal(
      (await pools[0].query("select payment_status from business_transactions where id=$1", [transactionId])).rows[0]
        .payment_status,
      "verified",
    );
    await assert.rejects(actions[0].verifyTransactionPayment(form({ entryId: payments[0] })), /sudah diverifikasi/);
    await actions[0].updateTransactionTrackStatus(
      form({ transactionId, track: "payment", status: "verified", reason: "[UJI] Cocok dengan invoice terbit" }),
    );
    await assert.rejects(
      actions[0].updateTransactionTrackStatus(
        form({
          transactionId,
          track: "commercial",
          status: "completed",
          reason: "[UJI] Tidak boleh melewati pemeriksaan",
        }),
      ),
      /Gunakan tindakan Tutup/,
    );
    await assert.rejects(
      actions[0].updateTransactionTrackStatus(
        form({ transactionId, track: "fulfilment", status: "released", reason: "[UJI] Lewati pemeriksaan" }),
      ),
      /Gunakan tindakan Lepas produksi/,
    );
    for (const deniedRole of ["sales", "content", null]) {
      role = deniedRole;
      await assert.rejects(actions[0].verifyTransactionPayment(form({ entryId: payments[0] })), /tidak memiliki akses/);
      await assert.rejects(actions[0].releaseProduction(form({ transactionId })), /tidak memiliki akses/);
    }
    role = "admin";
    await pools[0].query("update business_transactions set fulfilment_status='not_released' where id=$1", [
      transactionId,
    ]);
    await assert.rejects(actions[0].releaseProduction(form({ transactionId })), /belum lengkap/);
    await actions[0].releaseProduction(
      form({ transactionId, reason: "[UJI] Pengecualian lokal: target belum ditentukan" }),
    );
    assert.equal(
      (await pools[0].query("select fulfilment_status from business_transactions where id=$1", [transactionId])).rows[0]
        .fulfilment_status,
      "released",
    );
    const workflow = load(resolve(__dirname, "../src/features/operations/workflow-actions.ts"), stubs(0));
    await assert.rejects(workflow.closeTransaction(form({ transactionId })), /belum dapat ditutup normal/);
    const shipmentId = randomUUID();
    const proofId = randomUUID();
    await pools[0].query(
      "insert into transaction_documents(id,transaction_id,type,status,document_no) values($1,$2,'bast_signed','ready','UJI-FIKTIF-80')",
      [proofId, transactionId],
    );
    await pools[0].query(
      "insert into shipments(id,transaction_id,shipment_no,status,bast_document_id,handover_details) values($1,$2,$3,'received_partial',$4,$5)",
      [shipmentId, transactionId, `QA-${shipmentId.slice(0, 8)}`, proofId, { condition: "partial" }],
    );
    await pools[0].query(
      "insert into shipment_lines(shipment_id,transaction_line_id,quantity,accepted_quantity) values($1,$2,100,80)",
      [shipmentId, lineId],
    );
    await assert.rejects(workflow.closeTransaction(form({ transactionId })), /belum dapat ditutup normal/);
    await assert.rejects(
      workflow.closeTransaction(
        form({ transactionId, exceptionReason: "[UJI] Penerimaan masih kurang dua puluh unit." }),
      ),
      /konfirmasikan tindakan tersebut/,
    );
    await assert.rejects(
      workflow.createShipment(
        form({
          transactionId,
          recipient: "[UJI] Penerima",
          address: "[UJI] Alamat lokal",
          plannedShipAt: "2026-10-15T11:00",
          items: JSON.stringify([{ lineId, quantity: "21", logistics: blankLogistics }]),
        }),
      ),
      /melebihi/,
    );
    await assert.rejects(
      workflow.createShipment(
        form({
          transactionId,
          recipient: "[UJI] Penerima",
          address: "[UJI] Alamat lokal",
          plannedShipAt: "2026-10-15T11:00",
          items: JSON.stringify([{ lineId, quantity: "20", logistics: blankLogistics }]),
        }),
      ),
      /QA_REDIRECT:.*shipment-planned/,
    );
    const replacement = (
      await pools[0].query("select id from shipments where transaction_id=$1 and status='planned'", [transactionId])
    ).rows[0];
    assert(replacement, "Exactly 20 replacement units can be planned");
    await assert.rejects(workflow.markShipmentSent(form({ shipmentId: replacement.id })), /belum siap/);
    const replacementProof = randomUUID();
    await pools[0].query(
      "insert into transaction_documents(id,transaction_id,type,status,document_no) values($1,$2,'bast_signed','ready','UJI-FIKTIF-20')",
      [replacementProof, transactionId],
    );
    await pools[0].query("update shipments set status='received',bast_document_id=$2 where id=$1", [
      replacement.id,
      replacementProof,
    ]);
    await pools[0].query("update shipment_lines set accepted_quantity=20 where shipment_id=$1", [replacement.id]);
    await assert.rejects(workflow.closeTransaction(form({ transactionId })), /QA_REDIRECT:.*closed/);
    assert.equal(
      (await pools[0].query("select fulfilment_status from business_transactions where id=$1", [transactionId])).rows[0]
        .fulfilment_status,
      "completed",
    );
    await assert.rejects(workflow.closeTransaction(form({ transactionId })), /tidak dapat ditutup/);
    await pools[0].query("update transaction_financial_entries set status='unverified' where id=$1", [payments[0]]);
    await assert.rejects(actions[0].verifyTransactionPayment(form({ entryId: payments[0] })), /sudah ditutup/);
    await assert.rejects(
      actions[0].updateTransactionTrackStatus(
        form({ transactionId, track: "commercial", status: "quotation", reason: "[UJI] Tidak boleh membuka kembali" }),
      ),
      /sudah ditutup/,
    );
    context.diagnostic(
      "Reproduced pre-fix payment race; fixed two-connection result verified. Partial 80/100 refused closure; replacement 20 accepted; total 100 permits closure. No provider called.",
    );
  } finally {
    // Remove only IDs created by this test; existing demos/customer records and official counters are untouched.
    try {
      await pools[0].query("delete from audit_logs where entity_id=$1", [transactionId]);
      await pools[0].query("delete from shipments where transaction_id=$1", [transactionId]);
      await pools[0].query("delete from business_transactions where id=$1 and data_class='test'", [transactionId]);
      await pools[0].query("delete from customers where id=$1 and code=$2", [
        customerId,
        `QA-${customerId.slice(0, 8)}`,
      ]);
    } finally {
      await Promise.all(pools.map((pool) => pool.end()));
    }
  }
});
