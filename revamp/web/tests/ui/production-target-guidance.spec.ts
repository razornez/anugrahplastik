import { expect, test } from "@playwright/test";

test("missing production target explains the fix at the same step", async ({ page }, testInfo) => {
  await page.goto("/admin/transactions/f993fa4d-b034-4ee8-bf99-7bfbd116200c?step=production", {
    waitUntil: "networkidle",
  });

  const checklist = page.locator(".transaction-flow-checklist");
  const target = checklist.locator("li").filter({ hasText: "Target pekerjaan ditentukan" });
  test.skip((await target.count()) === 0, "The local transaction is unavailable.");
  test.skip((await target.getByText("Belum lengkap").count()) === 0, "This transaction already has a target date.");

  await expect(target.getByText("Tanggal target pekerjaan belum diisi.")).toBeVisible();
  await target.getByRole("link", { name: "Isi tanggal target" }).click();

  const dateInput = page.getByLabel("Tanggal target pekerjaan");
  await expect(dateInput).toBeInViewport();
  await expect(dateInput).toHaveAttribute("required", "");
  await expect(page.getByText("Invoice dan PDF yang sudah terbit tidak berubah.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Simpan tanggal" })).toBeVisible();
  const form = page.locator("#production-target");
  const floatingReminder = page.getByRole("status", { name: "Pengingat selisih pembayaran" });
  await expect(floatingReminder).toBeHidden();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  const clippedStatuses = await checklist.locator("li > strong").evaluateAll(
    (statuses) =>
      statuses.filter((status) => {
        const list = status.closest("ul");
        return list && status.getBoundingClientRect().right > list.getBoundingClientRect().right + 1;
      }).length,
  );
  expect(clippedStatuses).toBe(0);

  if (["mobile-320", "iphone-12-mini", "desktop"].includes(testInfo.project.name)) {
    await expect(checklist).toHaveScreenshot(`production-target-checklist-${testInfo.project.name}.png`);
    await expect(form).toHaveScreenshot(`production-target-form-${testInfo.project.name}.png`);
  }
  if (testInfo.project.name === "iphone-12-mini") {
    await page.locator(".admin-shell:not(.admin-shell--portal)").evaluate((shell) => {
      (shell as HTMLElement).dataset.theme = "dark";
    });
    await expect(form).toHaveScreenshot("production-target-form-dark.png");
  }
});
