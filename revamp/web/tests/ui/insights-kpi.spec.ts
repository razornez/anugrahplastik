import { expect, test } from "@playwright/test";

test("empat KPI Insights lokal tetap satu baris tanpa overflow", async ({ page }, testInfo) => {
  await page.goto("/admin/insights", { waitUntil: "networkidle" });
  test.skip(page.url().includes("/admin/login"), "Local Admin session is unavailable.");
  await expect(page.getByText("Data lokal")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Aktivitas website" })).toBeVisible();
  const cards = page.locator(".visitor-stat-row article");
  await expect(cards).toHaveCount(4);
  await expect(page.locator(".visitor-stat-row .admin-sr-only")).toHaveCount(4);
  const surface = await page
    .locator(".visitor-stat-row")
    .evaluate((element) => getComputedStyle(element).backgroundImage);
  expect(surface).toContain("gradient");
  expect(await cards.nth(2).evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  const tops = await cards.evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  await expect(page.locator(".visitor-interaction-detail")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  ).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath(`insights-kpi-${testInfo.project.name}.png`), fullPage: true });
  await page.locator(".visitor-stat-row").screenshot({
    path: testInfo.outputPath(`insights-kpi-focused-${testInfo.project.name}.png`),
    style: ".admin-bottom-nav, nextjs-portal { visibility: hidden !important; }",
  });
  const longNumber = cards.first().locator("strong");
  await longNumber.evaluate((element) => {
    element.querySelector(".visitor-kpi-full")!.textContent = "1.000.000";
    element.querySelector(".visitor-kpi-compact")!.textContent = "1 jt";
  });
  const longNumberOverflow = await longNumber.evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(longNumberOverflow).toBeLessThanOrEqual(1);
  await page.locator(".admin-shell").evaluate((element) => {
    (element as HTMLElement).dataset.theme = "dark";
  });
  await expect(cards).toHaveCount(4);
  await page.locator(".visitor-stat-row").screenshot({
    path: testInfo.outputPath(`insights-kpi-dark-${testInfo.project.name}.png`),
    style: ".admin-bottom-nav, nextjs-portal { visibility: hidden !important; }",
  });
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  ).toBeLessThanOrEqual(1);
});
