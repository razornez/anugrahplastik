import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import pg from "pg";

const transactionId = randomUUID();
const customerId = randomUUID();
const lineId = randomUUID();
const batchId = randomUUID();
const contactId = randomUUID();
const addressId = randomUUID();
const reference = `QA-SHIP-${transactionId.slice(0, 8)}`;
let created = false;

test.beforeAll(async () => {
  const connection = process.env.DATABASE_URL;
  if (!connection || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(connection).hostname)) return;
  const client = new pg.Client({ connectionString: connection });
  await client.connect();
  try {
    const snapshot = {
      version: 1,
      capturedAt: new Date().toISOString(),
      customerId,
      name: "PT QA Pengiriman",
      taxId: "",
      contacts: [
        {
          id: contactId,
          name: "Ibu Dewi",
          position: "Gudang",
          email: "dewi@example.invalid",
          phone: "",
          isPrimary: true,
        },
      ],
      billingAddress: null,
      deliveryAddresses: [
        {
          id: addressId,
          kind: "delivery",
          label: "Gudang utama",
          countryCode: "ID",
          countryName: "Indonesia",
          addressLine: "Jl. Industri Contoh No. 10",
          provinceCode: "32",
          provinceName: "Jawa Barat",
          regencyCode: "3273",
          regencyName: "Bandung",
          districtCode: "",
          districtName: "",
          villageCode: "",
          villageName: "",
          postalCode: "40111",
          isDefault: true,
          isStructured: true,
        },
      ],
      selectedDeliveryAddressId: addressId,
    };
    await client.query(
      "insert into customers(id,code,legal_name,display_name) values($1,$2,'PT QA Pengiriman','PT QA Pengiriman')",
      [customerId, reference],
    );
    await client.query(
      "insert into business_transactions(id,reference_no,customer_id,title,data_class,fulfilment_status,customer_snapshot) values($1,$2,$3,'[UJI] Kemasan pengiriman','test','production',$4)",
      [transactionId, reference, customerId, snapshot],
    );
    await client.query(
      "insert into transaction_lines(id,transaction_id,description,quantity,unit,unit_price) values($1,$2,'Spacer contoh',100,'pcs',1000)",
      [lineId, transactionId],
    );
    await client.query(
      "insert into production_batches(id,transaction_id,transaction_line_id,batch_no,kind,status,planned_quantity,completed_quantity) values($1,$2,$3,$4,'production','completed',100,100)",
      [batchId, transactionId, lineId, `${reference}-PRD`],
    );
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
    await client.query("delete from shipments where transaction_id=$1", [transactionId]);
    await client.query("delete from business_transactions where id=$1 and data_class='test'", [transactionId]);
    await client.query("delete from customers where id=$1 and code=$2", [customerId, reference]);
  } finally {
    await client.end();
  }
});

test("kemasan salah dijelaskan dekat item, lalu pengiriman disimpan sekali dengan snapshot", async ({ page }) => {
  test.skip(!created, "Database lokal diperlukan.");
  await page.goto(`/admin/transactions/${transactionId}?step=delivery`, { waitUntil: "networkidle" });
  const form = page.locator(".transaction-shipment-form").first();
  await expect(form.getByLabel("Jumlah dikirim: Spacer contoh")).toHaveValue("100");
  await expect(form.getByLabel("Pilih PIC dari data transaksi")).toHaveValue(contactId);
  await expect(form.getByLabel("Pilih alamat dari data transaksi")).toHaveValue(addressId);
  await form.getByLabel("Pack / plastik").fill("2");
  await form.getByLabel("Isi per pack (pcs)").fill("40");
  await expect(form.getByRole("alert")).toContainText("80 pcs");
  await expect(form.getByRole("button", { name: "Siapkan pengiriman" })).toBeDisabled();
  await form.getByLabel("Isi per pack (pcs)").fill("50");
  await expect(form.getByRole("alert")).toHaveCount(0);
  await form.getByRole("button", { name: "Siapkan pengiriman" }).click();
  await expect(page.getByText("Pengiriman tersimpan")).toBeVisible();
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await expect
      .poll(async () => {
        const count = await client.query("select count(*)::int as count from shipments where transaction_id=$1", [
          transactionId,
        ]);
        return count.rows[0].count;
      })
      .toBe(1);
    const result = await client.query(
      "select s.planned_ship_at,s.shipped_at,s.recipient_name,s.delivery_address,s.delivery_details,l.quantity from shipments s join shipment_lines l on l.shipment_id=s.id where s.transaction_id=$1",
      [transactionId],
    );
    expect(result.rowCount).toBe(1);
    expect(result.rows[0].planned_ship_at).not.toBeNull();
    expect(result.rows[0].shipped_at).toBeNull();
    expect(result.rows[0].recipient_name).toBe("Ibu Dewi");
    expect(result.rows[0].delivery_address).toContain("Jl. Industri Contoh No. 10");
    expect(result.rows[0].delivery_details.recipientContactId).toBe(contactId);
    expect(result.rows[0].delivery_details.deliveryAddressId).toBe(addressId);
    expect(Number(result.rows[0].quantity)).toBe(100);
  } finally {
    await client.end();
  }
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByText("Draft belum disimpan dipulihkan.")).toHaveCount(0);
});
