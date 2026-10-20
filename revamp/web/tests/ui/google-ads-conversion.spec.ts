import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("ap-analytics-opt-out-v1", "false"));
  await page.route("**/googletagmanager.com/gtag/js?*", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/javascript", body: "/* test tag */" });
  });
});

test("Google Ads receives one event only after the lead is saved", async ({ page }) => {
  const id = "b21c4e43-cb6e-4d80-8a2d-4b9fd7539843";
  let requests = 0;
  await page.route("**/api/leads", async (route) => {
    requests += 1;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, conversionId: id }),
    });
  });
  await page.goto("/#ap-contact");
  await expect(page.locator("script[data-google-ads-tag]")).toHaveCount(1);
  await page.locator("#ap-lead-name").fill("Perusahaan Uji Internal");
  await page.locator("#ap-lead-phone").fill("081234567890");
  await page.locator("#ap-lead-message").fill("Pengujian internal konversi formulir.");
  await page.locator('#ap-form button[type="submit"]').click();
  await expect(page.locator("[data-form-whatsapp]")).toBeVisible();
  const events = await page.evaluate(() =>
    (window.dataLayer ?? [])
      .map((entry) => Array.from(entry as ArrayLike<unknown>))
      .filter((entry) => entry[0] === "event"),
  );
  expect(requests).toBe(1);
  expect(events).toHaveLength(1);
  expect(events[0][1]).toBe("conversion");
  expect(events[0][2]).toEqual({
    send_to: expect.stringMatching(/^AW-\d+\/[A-Za-z0-9_-]+$/),
    value: 1,
    currency: "IDR",
    transaction_id: id,
  });
});

test("failed save and analytics opt-out do not send a conversion", async ({ page }) => {
  await page.route("**/api/leads", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Belum tersimpan" }),
    });
  });
  await page.goto("/#ap-contact");
  await page.locator("#ap-lead-name").fill("Perusahaan Uji Internal");
  await page.locator("#ap-lead-phone").fill("081234567890");
  await page.locator("#ap-lead-message").fill("Pengujian internal konversi formulir.");
  await page.locator('#ap-form button[type="submit"]').click();
  await expect(page.locator("[data-form-status]")).toContainText("belum memberi kepastian");
  expect(
    await page.evaluate(() =>
      (window.dataLayer ?? [])
        .map((entry) => Array.from(entry as ArrayLike<unknown>))
        .filter((entry) => entry[0] === "event"),
    ),
  ).toHaveLength(0);

  await page.addInitScript(() => window.localStorage.setItem("ap-analytics-opt-out-v1", "true"));
  await page.reload();
  await expect(page.locator("script[data-google-ads-tag]")).toHaveCount(0);
});
