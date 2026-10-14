import { expect, test } from "@playwright/test";

test("production completion input stays readable and tappable", async ({ page }, testInfo) => {
  await page.goto("/admin/transactions/f993fa4d-b034-4ee8-bf99-7bfbd116200c?step=production", {
    waitUntil: "networkidle",
  });

  const form = page.getByTestId("batch-complete-form").first();
  test.skip((await form.count()) === 0, "No unfinished local production batch is available.");

  const input = form.getByRole("spinbutton", { name: "Jumlah selesai" });
  const button = form.getByRole("button", { name: "Tandai selesai" });
  const bounds = await Promise.all([form.boundingBox(), input.boundingBox(), button.boundingBox()]);
  const [formBox, inputBox, buttonBox] = bounds;

  expect(formBox).not.toBeNull();
  expect(inputBox).not.toBeNull();
  expect(buttonBox).not.toBeNull();
  expect(inputBox!.width).toBeGreaterThanOrEqual(90);
  expect(inputBox!.height).toBeGreaterThanOrEqual(44);
  expect(buttonBox!.height).toBeGreaterThanOrEqual(44);
  expect(inputBox!.x).toBeGreaterThanOrEqual(formBox!.x);
  expect(inputBox!.x + inputBox!.width).toBeLessThanOrEqual(formBox!.x + formBox!.width + 1);
  expect(buttonBox!.x + buttonBox!.width).toBeLessThanOrEqual(formBox!.x + formBox!.width + 1);
  if (buttonBox!.y > inputBox!.y) {
    expect(buttonBox!.y - (inputBox!.y + inputBox!.height)).toBeGreaterThanOrEqual(8);
  } else {
    expect(buttonBox!.x - (inputBox!.x + inputBox!.width)).toBeGreaterThanOrEqual(8);
  }
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(1);

  if (["mobile-320", "iphone-12-mini", "desktop"].includes(testInfo.project.name)) {
    await expect(form).toHaveScreenshot(`batch-complete-${testInfo.project.name}.png`);
  }
  if (testInfo.project.name === "iphone-12-mini") {
    await page.locator(".admin-shell:not(.admin-shell--portal)").evaluate((shell) => {
      (shell as HTMLElement).dataset.theme = "dark";
    });
    await expect(form).toHaveScreenshot("batch-complete-dark.png");
  }
});
