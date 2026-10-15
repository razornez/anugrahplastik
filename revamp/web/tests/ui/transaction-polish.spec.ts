import { expect, test } from "@playwright/test";

const detail = "/admin/transactions/f993fa4d-b034-4ee8-bf99-7bfbd116200c";

test("document rows, email composer, delivery and handover stay readable", async ({ page }, testInfo) => {
  for (const step of ["quote", "delivery", "handover"] as const) {
    await page.goto(`${detail}?step=${step}`, { waitUntil: "networkidle" });
    test.skip(page.url().includes("/admin/login"), "Local Admin session is unavailable.");
    const rows = page.locator(".transaction-flow-documents article");
    if (await rows.count()) {
      const geometry = await rows.first().evaluate((row) => {
        const box = row.getBoundingClientRect();
        const buttons = [...row.querySelectorAll<HTMLElement>("button, a")].map((item) => item.getBoundingClientRect());
        return { width: box.width, buttons: buttons.map((item) => ({ width: item.width, height: item.height })) };
      });
      expect(geometry.width).toBeGreaterThan(190);
      for (const button of geometry.buttons) expect(button.height).toBeGreaterThanOrEqual(44);
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`${step}-${testInfo.project.name}.png`), fullPage: true });
    if (step === "delivery") {
      const form = page.locator(".transaction-shipment-form").first();
      if (await form.count()) {
        await expect(form.locator('input[name="plannedShipAt"]')).toBeVisible();
        await expect(form.locator('textarea[name="address"]')).toBeVisible();
      }
    }
    if (step === "quote") {
      const send = page.getByRole("button", { name: /^Kirim email$/ }).first();
      if (await send.count()) {
        await send.click();
        const composer = page.getByRole("dialog", { name: "Kirim email" });
        await expect(composer).toBeVisible();
        const bounds = await composer.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.x).toBeGreaterThanOrEqual(-1);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(testInfo.project.use.viewport?.width ?? 1440);
        await page.screenshot({ path: testInfo.outputPath(`email-composer-${testInfo.project.name}.png`) });
      }
    }
  }
});

test("nominal groups digits while keeping canonical form value", async ({ page }) => {
  await page.goto(`${detail}?step=payment`, { waitUntil: "networkidle" });
  test.skip(page.url().includes("/admin/login"), "Local Admin session is unavailable.");
  const field = page.locator('input[placeholder="Rp 0"]').first();
  test.skip(!(await field.count()), "The local payment form is unavailable.");
  await field.fill("1000000");
  await expect(field).toHaveValue("Rp 1.000.000");
  const raw = await field.locator("xpath=preceding-sibling::input[@type='hidden']").inputValue();
  expect(raw).toBe("1000000");
});

test("sidebar meminta konfirmasi untuk draft dan memulihkan nominal setelah kembali", async ({ page }) => {
  await page.goto(`${detail}?step=payment`, { waitUntil: "networkidle" });
  test.skip(page.url().includes("/admin/login"), "Local Admin session is unavailable.");
  const field = page.locator('input[placeholder="Rp 0"]').first();
  test.skip(!(await field.count()), "The local payment form is unavailable.");
  await field.fill("1234567");
  const desktopMenu = page.getByRole("navigation", { name: "Menu back office" });
  const menu = (await desktopMenu.isVisible())
    ? desktopMenu
    : page.getByRole("navigation", { name: "Navigasi mobile" });
  await menu.getByRole("link", { name: "Transaksi" }).click();
  const dialog = page.getByRole("dialog", { name: "Draft belum disimpan" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Pindah, draft tetap tersimpan di perangkat" }).click();
  await expect(page).toHaveURL(/\/admin\/transactions(?:\?|$)/);
  await page.goto(`${detail}?step=payment`, { waitUntil: "networkidle" });
  await expect(page.getByText("Draft form belum disimpan dipulihkan.")).toBeVisible();
  await expect(field).toHaveValue("Rp 1.234.567");
  await expect(field.locator("xpath=preceding-sibling::input[@type='hidden']")).toHaveValue("1234567");
  await page.getByRole("button", { name: "Buang draft" }).click();
});
