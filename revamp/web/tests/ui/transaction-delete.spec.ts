import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import pg from "pg";

const transactionId = randomUUID();
const customerId = randomUUID();
const documentId = randomUUID();
const invoiceId = randomUUID();
const batchId = randomUUID();
const shipmentId = randomUUID();
const reference = `QA-DELETE-${transactionId.slice(0, 8)}`;
let created = false;

test.beforeAll(async () => {
  const connection = process.env.DATABASE_URL;
  if (!connection || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(connection).hostname)) return;
  const client = new pg.Client({ connectionString: connection });
  await client.connect();
  try {
    await client.query(
      "insert into customers(id,code,legal_name,display_name) values($1,$2,'PT QA Anonim','PT QA Anonim')",
      [customerId, reference],
    );
    await client.query(
      "insert into business_transactions(id,reference_no,customer_id,title,data_class) values($1,$2,$3,'[UJI] Hapus dummy','test')",
      [transactionId, reference, customerId],
    );
    await client.query(
      "insert into transaction_documents(id,transaction_id,type,direction,status,document_no,storage_path) values($1,$2,'quotation','outbound','ready',$3,$4)",
      [documentId, transactionId, `${reference}-SP`, `qa/${documentId}.pdf`],
    );
    await client.query(
      "insert into transaction_invoices(id,transaction_id,invoice_no,kind,amount) values($1,$2,$3,'dp',1000)",
      [invoiceId, transactionId, `${reference}-INV`],
    );
    await client.query(
      "insert into production_batches(id,transaction_id,batch_no,kind,status,planned_quantity) values($1,$2,$3,'sample','planned',1)",
      [batchId, transactionId, `${reference}-SPL`],
    );
    await client.query("insert into shipments(id,transaction_id,shipment_no,status) values($1,$2,$3,'planned')", [
      shipmentId,
      transactionId,
      `${reference}-SJ`,
    ]);
    created = true;
  } finally {
    await client.end();
  }
});

test.afterAll(async () => {
  if (!created || !process.env.DATABASE_URL) return;
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("delete from audit_logs where entity_type='transaction' and entity_id=$1", [transactionId]);
    await client.query("delete from business_transactions where id=$1 and data_class='test'", [transactionId]);
    await client.query("delete from transaction_file_cleanup_jobs where storage_path=$1", [`qa/${documentId}.pdf`]);
    await client.query("delete from customers where id=$1 and code=$2", [customerId, reference]);
  } finally {
    await client.end();
  }
});

test("dokumen belum pasti memblokir penghapusan", async ({ page }) => {
  test.skip(!created, "Database lokal diperlukan.");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("update transaction_documents set status='needs_review' where id=$1", [documentId]);
    await page.goto(`/admin/transactions/${transactionId}?step=quote`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Hapus permanen…" }).click();
    const dialog = page.getByRole("dialog", { name: `Hapus permanen ${reference}?` });
    await expect(dialog).toContainText("PDF atau email masih berstatus belum pasti");
    await expect(dialog.getByRole("button", { name: "Hapus permanen", exact: true })).toBeDisabled();
  } finally {
    await client.query("update transaction_documents set status='ready' where id=$1", [documentId]);
    await client.end();
  }
});

test("Admin menghapus transaksi dummy dengan konfirmasi dan audit", async ({ page }) => {
  test.skip(!created, "Database lokal diperlukan.");
  await page.goto(`/admin/transactions/${transactionId}?step=quote`, { waitUntil: "networkidle" });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Arsipkan transaksi" }).click();
  await expect(page).toHaveURL(/\/admin\/transactions(?:\?|$)/);
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const archived = await client.query("select archived_at from business_transactions where id=$1", [transactionId]);
    expect(archived.rows[0].archived_at).not.toBeNull();
  } finally {
    await client.end();
  }
  await page.goto(`/admin/transactions/${transactionId}?step=quote`, { waitUntil: "networkidle" });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Pulihkan transaksi" }).click();
  await expect(page).toHaveURL(/\/admin\/transactions(?:\?|$)/);
  await page.goto(`/admin/transactions/${transactionId}?step=quote`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Hapus permanen…" }).click();
  const dialog = page.getByRole("dialog", { name: `Hapus permanen ${reference}?` });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Email terkirim tidak bisa ditarik kembali");
  await expect(dialog).toContainText("File privat");
  await dialog.getByRole("textbox", { name: "Ketik nomor transaksi untuk konfirmasi" }).fill(reference);
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Hapus permanen", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/transactions(?:\?|$)/);
  const verification = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await verification.connect();
  try {
    const row = await verification.query("select count(*)::int as count from business_transactions where id=$1", [
      transactionId,
    ]);
    expect(row.rows[0].count).toBe(0);
    const audit = await verification.query(
      "select count(*)::int as count from audit_logs where entity_id=$1 and action='transaction.deleted_permanently'",
      [transactionId],
    );
    expect(audit.rows[0].count).toBe(1);
    const queue = await verification.query("select status from transaction_file_cleanup_jobs where storage_path=$1", [
      `qa/${documentId}.pdf`,
    ]);
    expect(queue.rows[0]?.status).toBe("pending");
  } finally {
    await verification.end();
  }
});
