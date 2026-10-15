import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import pg from "pg";

const id = randomUUID();
const customerId = randomUUID();
const documentId = randomUUID();
const reference = `QA-EMAIL-${id.slice(0, 8)}`;
let created = false;

test.beforeAll(async () => {
  const connection = process.env.DATABASE_URL;
  if (!connection || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(connection).hostname)) return;
  const client = new pg.Client({ connectionString: connection });
  await client.connect();
  try {
    await client.query(
      "insert into customers(id,code,legal_name,display_name,email) values($1,$2,'PT Uji Anonim','PT Uji Anonim',$3)",
      [customerId, reference, "razornez@gmail.com"],
    );
    await client.query(
      "insert into business_transactions(id,reference_no,customer_id,title,data_class) values($1,$2,$3,'[UJI] Tata letak composer','test')",
      [id, reference, customerId],
    );
    await client.query(
      "insert into transaction_documents(id,transaction_id,type,direction,status,version,document_no,storage_path,payload) values($1,$2,'quotation','outbound','ready',1,$3,$4,$5)",
      [documentId, id, `${reference}-SP`, `qa/${documentId}.pdf`, { isDummy: true }],
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
    await client.query("delete from audit_logs where entity_type='transaction' and entity_id=$1", [id]);
    await client.query("delete from business_transactions where id=$1 and data_class='test'", [id]);
    await client.query("delete from customers where id=$1 and code=$2", [customerId, reference]);
  } finally {
    await client.end();
  }
});

test("composer drawer respects viewport, theme and zoom", async ({ page }, testInfo) => {
  test.skip(!created, "A local test database is required.");
  await page.goto(`/admin/transactions/${id}?step=quote`, { waitUntil: "networkidle" });
  const trigger = page.getByRole("button", { name: "Kirim email" }).first();
  test.skip(!(await trigger.count()), "An active quotation email template is required.");
  await trigger.click();
  const composer = page.getByRole("dialog", { name: "Kirim email" });
  await expect(composer).toBeVisible();
  const metrics = await composer.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const footer = element.querySelector("footer")?.getBoundingClientRect();
    return {
      left: box.left,
      right: box.right,
      viewport: innerWidth,
      footerBottom: footer?.bottom ?? 0,
      viewportHeight: innerHeight,
    };
  });
  expect(metrics.left).toBeGreaterThanOrEqual(-1);
  expect(metrics.right).toBeLessThanOrEqual(metrics.viewport + 1);
  expect(metrics.footerBottom).toBeLessThanOrEqual(metrics.viewportHeight + 1);
  await page.screenshot({ path: testInfo.outputPath(`composer-${testInfo.project.name}.png`) });
  if (["mobile-320", "iphone-12-mini", "desktop"].includes(testInfo.project.name)) {
    await page.locator(".admin-shell:not(.admin-shell--portal)").evaluate((element) => {
      (element as HTMLElement).dataset.theme = "dark";
    });
    await expect(composer).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`composer-dark-${testInfo.project.name}.png`) });
  }
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  await expect(composer).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("daftar dokumen di sidebar sempit tidak memecah tombol per huruf", async ({ page }, testInfo) => {
  test.skip(!created, "A local test database is required.");
  await page.goto(`/admin/transactions/${id}?step=quote`, { waitUntil: "networkidle" });
  await page.getByText(/^Semua dokumen \(/).click();
  const aside = page.locator(".transaction-flow-aside .transaction-flow-documents");
  await expect(aside).toBeVisible();
  const trigger = aside.getByRole("button", { name: "Kirim email" });
  await expect(trigger).toBeVisible();
  const size = await trigger.boundingBox();
  expect(size!.width).toBeGreaterThanOrEqual(112);
  expect(size!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: testInfo.outputPath(`document-sidebar-${testInfo.project.name}.png`) });
});
