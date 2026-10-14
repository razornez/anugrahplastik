import { expect, test } from "@playwright/test";

test("transaction status is a readable badge and payment mismatch stays discoverable", async ({ page }, testInfo) => {
  test.skip(!["mobile-320", "iphone-12-mini", "desktop"].includes(testInfo.project.name));
  await page.goto("/admin/transactions", { waitUntil: "networkidle" });
  const row = page.locator("article").filter({ hasText: "Kelebihan:" }).first();
  test.skip(!(await row.count()), "Local data has no transaction with excess verified payment.");
  await row.locator('a[href^="/admin/transactions/"]').first().click();

  const badge = page.locator(".admin-page-header__actions > span");
  await expect(badge).toBeVisible();
  await expect(badge).toHaveCSS("border-style", "solid");
  const badgeSize = await badge.boundingBox();
  expect(badgeSize?.height ?? 0).toBeGreaterThanOrEqual(36);
  await expect(badge).toHaveScreenshot(`transaction-status-${testInfo.project.name}.png`);

  const inline = page.getByRole("heading", { name: /Selisih pembayaran .* belum cocok dengan invoice/ });
  await expect(inline).toBeVisible();
  await expect(page.getByText(/Pembayaran terverifikasi .* sedangkan invoice terbit/)).toBeVisible();
  await inline.locator("../..").evaluate((element) => element.scrollIntoView({ block: "start" }));
  await expect(inline.locator("../..").getByRole("link", { name: /Periksa invoice & bukti/ })).toBeInViewport();
  await expect(inline.locator("../..")).toHaveScreenshot(`transaction-payment-alert-${testInfo.project.name}.png`);
  await expect(page.getByRole("status", { name: "Pengingat selisih pembayaran" })).toBeHidden();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const reminder = page.getByRole("status", { name: "Pengingat selisih pembayaran" });
  await expect(reminder).toBeVisible();
  await expect(reminder).toHaveScreenshot(`transaction-payment-reminder-${testInfo.project.name}.png`);
  const reminderBox = await reminder.boundingBox();
  expect(reminderBox?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((reminderBox?.x ?? 0) + (reminderBox?.width ?? 0)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.locator(".admin-shell:not(.admin-shell--portal)").evaluate((shell) => {
    (shell as HTMLElement).dataset.theme = "dark";
  });
  await expect(reminder).toHaveScreenshot(`transaction-payment-reminder-dark-${testInfo.project.name}.png`);
  await reminder.getByRole("link", { name: /Periksa invoice & bukti/ }).click();
  await expect(page).toHaveURL(/step=payment.*#transaction-payment-review$/);
  await expect(page.locator("#transaction-payment-review")).toBeInViewport();
  await expect(reminder).toBeHidden();
});
