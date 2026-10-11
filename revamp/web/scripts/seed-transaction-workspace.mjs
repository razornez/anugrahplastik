// Local-only, idempotent visual fixtures. Never presented as actual customer orders.
import assert from "node:assert/strict";
import { config } from "dotenv";
import pg from "pg";
config({ path: ".env.local", quiet: true });
const url = new URL(process.env.DATABASE_URL);
assert(["127.0.0.1", "localhost", "::1"].includes(url.hostname), "Only local database permitted");
const pool = new pg.Pool({ connectionString: url.href });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const {
    rows: [customer],
  } = await client.query("select id from customers where code='CUS-QA-DOCGEN' and status='active'");
  const {
    rows: [admin],
  } = await client.query("select id from users where role='admin' and is_active=true order by created_at limit 1");
  assert(customer && admin, "Existing test customer and administrator required");
  let added = 0;
  for (let index = 1; index <= 28; index++) {
    const stage = index % 5;
    const reference = `QA-COMPACT-${String(index).padStart(3, "0")}`;
    const {
      rows: [transaction],
    } = await client.query(
      `insert into business_transactions (reference_no,customer_id,owner_id,title,data_class,commercial_status,payment_status,fulfilment_status,updated_at)
      values ($1,$2,$3,$4,'test',$5,$6,$7,now()-($8::int*interval '1 minute')) on conflict(reference_no) do nothing returning id`,
      [
        reference,
        customer.id,
        index % 3 === 0 ? null : admin.id,
        `[UJI COMPACT ${index}] ${index === 1 ? "Spacer conduit khusus dengan nama pekerjaan panjang untuk memeriksa keterbacaan dan pembungkusan teks pada layar kecil" : "Spacer fiktif — bukan pesanan pelanggan"}`,
        stage >= 2 ? "invoice_issued" : stage === 1 ? "po_received" : "quotation",
        stage === 0
          ? "awaiting_invoice"
          : stage === 3
            ? "payment_recorded"
            : stage === 4
              ? "verified"
              : "awaiting_payment",
        stage >= 3 ? "production" : "not_released",
        index,
      ],
    );
    if (!transaction) continue;
    added++;
    await client.query(
      `insert into transaction_lines (transaction_id,description,material_label,quantity,unit,unit_price,tax_rate,tax_method,discount_kind,discount_value,sort_order) values ($1,'[UJI] Spacer fiktif','Polypropylene',100,'pcs',10000,12,'dpp_11_12',$2,$3,0)`,
      [transaction.id, index % 2 ? "percent" : "amount", index % 2 ? "10" : "100000"],
    );
    if (stage >= 1)
      await client.query(
        `insert into transaction_documents(transaction_id,type,direction,document_no,status,payload) values ($1,'purchase_order','incoming',$2,'received','{"isDummy":true,"fixture":true}'::jsonb)`,
        [transaction.id, `${reference}-PO-UJI`],
      );
    if (stage >= 2) {
      await client.query(
        `insert into transaction_invoices(transaction_id,invoice_no,kind,amount,status,issued_at,snapshot) values ($1,$2,'dp',400000,'paid',now(),'{"fixture":true}'::jsonb),($1,$3,'final',599000,$4,now(),'{"fixture":true}'::jsonb),($1,$5,'final',999000,'cancelled',now(),'{"fixture":true}'::jsonb)`,
        [
          transaction.id,
          `${reference}-DP`,
          `${reference}-FINAL`,
          stage === 4 ? "paid" : "sent",
          `${reference}-CANCELLED`,
        ],
      );
      await client.query(
        `insert into transaction_financial_entries(transaction_id,kind,direction,amount,status,reference,occurred_at) values ($1,'customer_payment','in',400000,'verified',$2,now())`,
        [transaction.id, `${reference}-PAYMENT`],
      );
      if (stage === 3 || stage === 4)
        await client.query(
          `insert into transaction_financial_entries(transaction_id,kind,direction,amount,status,reference,occurred_at) values ($1,'customer_payment','in',$2,$3,$4,now())`,
          [
            transaction.id,
            stage === 4 ? "600000" : "599000",
            stage === 4 ? "verified" : "unverified",
            `${reference}-PAYMENT2`,
          ],
        );
    }
  }
  await client.query("COMMIT");
  console.log(`${added} explicitly classified test transactions added. No counters, API, or real orders changed.`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
