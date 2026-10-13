import { expect, test } from "@playwright/test";

test("public routes do not expose the internal install identity", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();

  await page.goto(`${baseURL}/`);
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
  await expect(page.locator("html")).not.toContainText("Back Office");

  await page.goto(`${baseURL}/admin/login`);
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);

  const retiredManifest = await context.request.get(`${baseURL}/manifest.webmanifest`);
  expect(retiredManifest.status()).toBe(410);
  expect(retiredManifest.headers()["cache-control"]).toContain("no-store");

  const privateManifest = await context.request.get(`${baseURL}/api/admin/app-manifest`);
  expect(privateManifest.status()).toBe(404);
  expect(privateManifest.headers()["cache-control"]).toContain("no-store");

  const robots = await context.request.get(`${baseURL}/robots.txt`);
  const robotsText = await robots.text();
  expect(robotsText).not.toContain("/admin");
  expect(robotsText).not.toContain("/preview");

  const sitemap = await context.request.get(`${baseURL}/sitemap.xml`);
  const sitemapText = await sitemap.text();
  expect(sitemapText).not.toContain("/admin");
  expect(sitemapText).not.toContain("/preview");

  await context.close();
});

test("authenticated admin pages publish only the private scoped manifest", async ({ page }) => {
  const response = await page.goto("/admin");
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");

  const manifestLink = page.locator('link[rel="manifest"][href="/api/admin/app-manifest"]');
  await expect(manifestLink).toHaveCount(1);
  await expect(manifestLink).toHaveAttribute("crossorigin", "use-credentials");

  const manifestResponse = await page.request.get("/api/admin/app-manifest");
  expect(manifestResponse.status()).toBe(200);
  expect(manifestResponse.headers()["cache-control"]).toContain("private");
  expect(manifestResponse.headers()["cache-control"]).toContain("no-store");
  const manifest = await manifestResponse.json();
  expect(manifest.start_url).toBe("/admin");
  expect(manifest.scope).toBe("/admin/");
});
