import { expect, test } from "@playwright/test";

test("inspect document customer sheet", async ({ page }, testInfo) => {
  await page.goto(
    "/admin/transactions/f993fa4d-b034-4ee8-bf99-7bfbd116200c?step=payment&returnTo=%2Fadmin%2Ftransactions",
    { waitUntil: "networkidle" },
  );
  const invoiceDisclosure = page.getByText("Buat tagihan baru", { exact: true });
  if (await invoiceDisclosure.count()) await invoiceDisclosure.click();
  const trigger = page.getByRole("button", { name: "Lengkapi sekarang" }).first();
  if (!(await trigger.count())) test.skip(true, "Local transaction no longer has a missing customer address.");
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Data dokumen pelanggan" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Data dokumen pelanggan" })).toBeInViewport();
  await expect(dialog.getByLabel("Alamat penagihan")).toBeFocused();
  const geometry = await dialog.evaluate((element) => {
    const checkbox = element.querySelector<HTMLInputElement>('input[name="updateMaster"]')!;
    const label = checkbox.closest("label")!;
    const text = label.querySelector("span")!;
    return {
      overflow: element.scrollWidth - element.clientWidth,
      checkboxWidth: checkbox.getBoundingClientRect().width,
      alignment: Math.abs(checkbox.getBoundingClientRect().top - text.getBoundingClientRect().top),
    };
  });
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  expect(geometry.checkboxWidth).toBeLessThanOrEqual(24);
  expect(geometry.alignment).toBeLessThanOrEqual(6);
  await dialog.locator(".admin-sheet__body").evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({ path: `output/document-sheet-top-${testInfo.project.name}.png` });
  await page.locator(".admin-shell:not(.admin-shell--portal)").evaluate((element) => {
    (element as HTMLElement).dataset.theme = "dark";
  });
  await expect(page.locator(".admin-shell--portal")).toHaveAttribute("data-theme", "dark");
  await expect(dialog).toHaveCSS("background-color", "rgb(37, 34, 44)");
  await page.screenshot({ path: `output/document-sheet-dark-${testInfo.project.name}.png` });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("document settings returns to the exact transaction step", async ({ page }) => {
  const detail = "/admin/transactions/f993fa4d-b034-4ee8-bf99-7bfbd116200c";
  await page.goto(`${detail}?step=quote&returnTo=%2Fadmin%2Ftransactions#transaction-step-title`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("link", { name: "Periksa kesiapan dokumen resmi" }).click();
  await expect(page).toHaveURL(/\/admin\/settings\/documents\?returnTo=/);
  await page.getByRole("link", { name: "Kembali ke transaksi" }).click();
  await expect(page).toHaveURL(new RegExp(`${detail.replaceAll("/", "\\/")}\\?step=quote.*#transaction-step-title$`));
});

test("document settings rejects an external return destination", async ({ page }) => {
  await page.goto("/admin/settings/documents?returnTo=https%3A%2F%2Fevil.example%2F", { waitUntil: "networkidle" });
  await expect(page.getByRole("link", { name: "Kembali ke transaksi" })).toHaveAttribute("href", "/admin/transactions");
});
