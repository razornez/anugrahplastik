// Exercise the data-only migration against isolated temporary tables.
// The transaction always rolls back; no application row is changed.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });
const databaseUrl = process.env.DATABASE_URL;
assert(databaseUrl && /^postgres(?:ql)?:\/\/[^/]+@(?:127\.0\.0\.1|localhost):5432\//.test(databaseUrl));
const migration = await readFile(new URL("../drizzle/0023_remove-contract-flow.sql", import.meta.url), "utf8");
const client = new pg.Client({ connectionString: databaseUrl });

await client.connect();
try {
  await client.query("begin");
  await client.query("set local search_path to pg_temp");
  await client.query(
    "create temp table business_transactions (id integer primary key, commercial_status text not null)",
  );
  await client.query("create temp table transaction_invoices (transaction_id integer not null, status text not null)");
  await client.query(
    "create temp table transaction_documents (transaction_id integer not null, type text not null, status text not null)",
  );
  await client.query(
    "insert into business_transactions values (1, 'contract'), (2, 'contract'), (3, 'contract'), (4, 'quotation')",
  );
  await client.query("insert into transaction_invoices values (1, 'issued'), (2, 'draft')");
  await client.query(
    "insert into transaction_documents values (1, 'purchase_order', 'received'), (2, 'purchase_order', 'received'), (3, 'contract', 'ready')",
  );
  await client.query(migration);

  const { rows } = await client.query("select id, commercial_status from business_transactions order by id");
  assert.deepEqual(rows, [
    { id: 1, commercial_status: "invoice_issued" },
    { id: 2, commercial_status: "po_received" },
    { id: 3, commercial_status: "quotation" },
    { id: 4, commercial_status: "quotation" },
  ]);
  const documents = await client.query("select count(*)::integer as count from transaction_documents");
  assert.equal(documents.rows[0].count, 3);
  console.log("Migration contract → invoice/PO/quotation: OK; arsip tetap utuh.");
} finally {
  await client.query("rollback").catch(() => undefined);
  await client.end();
}
