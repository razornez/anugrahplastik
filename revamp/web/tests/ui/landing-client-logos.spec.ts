import { expect, test } from "@playwright/test";

test("Klien & Mitra menampilkan logo asli dan kontrol animasi yang jelas", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");

  const section = page.locator("#ap-trust");
  await expect(section).toBeVisible();
  await section.scrollIntoViewIfNeeded();
  await expect(section.locator(".ap-mq")).toHaveCount(3);
  await expect(section.locator(".ap-partner-track:not([aria-hidden]) img")).toHaveCount(38);
  await expect(section.getByAltText("Logo PT Wijaya Karya (Persero) Tbk")).toHaveCount(2);

  const pause = section.locator(".ap-marquee-toggle");
  await expect(pause).toHaveText("Jeda animasi logo");
  await pause.click();
  await expect(pause).toHaveAttribute("aria-pressed", "true");
  await expect(section).toHaveAttribute("data-paused", "true");

  const logo = section.locator('.ap-partner-track:not([aria-hidden]) img[alt="Logo PT Wijaya Karya (Persero) Tbk"]');
  await expect
    .poll(async () =>
      logo.evaluate(async (image: HTMLImageElement) => {
        image.loading = "eager";
        await image.decode();
        return image.naturalWidth > 0;
      }),
    )
    .toBe(true);

  await expect(pause).toHaveText("Lanjutkan animasi logo");
  await pause.click();
  await expect(section).toHaveAttribute("data-paused", "false");

  await expect
    .poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
    .toBe(true);

  await section.screenshot({ path: testInfo.outputPath("client-logos.png"), animations: "disabled" });
});
