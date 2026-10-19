import { expect, test } from "@playwright/test";

const conversionId = "b21c4e43-cb6e-4d80-8a2d-4b9fd7539843";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("ap-analytics-opt-out-v1", "false"));
  await page.route("**/api/analytics/events", async (route) => {
    await route.fulfill({ status: 204 });
  });
});

test("ad entry keeps attribution and marks automatic contact-anchor scroll", async ({ page }) => {
  const batches: Array<{
    entry?: { attribution?: Record<string, string>; referrer?: string | null };
    events: Array<{ name: string; metadata?: Record<string, string | number> }>;
  }> = [];
  await page.unroute("**/api/analytics/events");
  await page.route("**/api/analytics/events", async (route) => {
    batches.push(route.request().postDataJSON());
    await route.fulfill({ status: 204 });
  });
  await page.goto("/?utm_source=google&utm_medium=cpc&utm_campaign=parts&gclid=click-123#ap-contact");
  await expect(page.locator("#ap-form")).toBeVisible();
  await expect.poll(() => batches.length, { timeout: 9_000 }).toBeGreaterThan(0);
  expect(batches[0].entry?.attribution?.utm_source).toBe("google");
  expect(batches[0].entry?.attribution?.gclid).toBe("click-123");
  expect(batches[0].entry?.referrer).toBeNull();
  const events = batches.flatMap((batch) => batch.events);
  expect(events.find((event) => event.name === "page_view")?.metadata?.entry_anchor).toBe("ap-contact");
  expect(
    events.some((event) => event.name === "scroll_depth" && event.metadata?.cause === "initial_anchor"),
    JSON.stringify(events),
  ).toBe(true);
});

test("invalid mobile form keeps input and points to each problem", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/leads", async (route) => {
    requests += 1;
    await route.fulfill({ status: 500 });
  });
  await page.goto("/#ap-contact");
  await page.locator("#ap-lead-name").fill("A");
  await page.locator("#ap-lead-phone").fill("abc");
  await page.locator("#ap-lead-message").fill("singkat");
  await page.locator('#ap-form button[type="submit"]').click();
  await expect(page.locator("[data-form-summary]")).toBeVisible();
  await expect(page.locator("[data-form-summary]")).toBeFocused();
  await expect(page.locator("#ap-lead-name-error")).toBeVisible();
  await expect(page.locator("#ap-lead-phone-error")).toBeVisible();
  await expect(page.locator("#ap-lead-message-error")).toBeVisible();
  await expect(page.locator("#ap-lead-message")).toHaveValue("singkat");
  expect(requests).toBe(0);
});

test("saved request needs an explicit WhatsApp tap and cannot double-submit", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/leads", async (route) => {
    requests += 1;
    await new Promise((resolve) => setTimeout(resolve, 750));
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, conversionId }),
    });
  });
  await page.goto("/#ap-contact");
  await page.evaluate(() =>
    window.addEventListener("ap:google-ads-lead", (event) => {
      document.documentElement.dataset.adsConversion = (
        event as CustomEvent<{ conversionId: string }>
      ).detail.conversionId;
    }),
  );
  await page.locator("#ap-lead-name").fill("Perusahaan Contoh");
  await page.locator("#ap-lead-phone").fill("081234567890");
  await page.locator("#ap-lead-message").fill("Butuh komponen plastik sesuai gambar.");
  await page.locator('#ap-form button[type="submit"]').click();
  await expect(page.locator("[data-form-status]")).toContainText("Menyimpan permintaan");
  await expect(page.locator("html")).not.toHaveAttribute("data-ads-conversion", conversionId);
  await expect(page.locator("[data-form-whatsapp]")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-ads-conversion", conversionId);
  await expect(page.locator("[data-form-whatsapp]")).toHaveAttribute("href", /wa\.me\/628122339587\?text=/);
  await expect(page.locator('#ap-form button[type="submit"]')).toBeDisabled();
  expect(requests).toBe(1);
});

test("failed connection shows a clear fallback without clearing the draft", async ({ page }) => {
  await page.route("**/api/leads", async (route) => route.abort("failed"));
  await page.goto("/#ap-contact");
  await page.locator("#ap-lead-name").fill("Perusahaan Contoh");
  await page.locator("#ap-lead-phone").fill("081234567890");
  await page.locator("#ap-lead-message").fill("Butuh komponen plastik sesuai gambar.");
  await page.locator('#ap-form button[type="submit"]').click();
  await expect(page.locator("[data-form-status]")).toContainText("Koneksi terputus");
  await expect(page.locator("[data-form-whatsapp]")).toBeVisible();
  await expect(page.locator("#ap-lead-message")).toHaveValue("Butuh komponen plastik sesuai gambar.");
});

test("non-JSON server failure explains uncertain save instead of showing a parser error", async ({ page }) => {
  await page.route("**/api/leads", async (route) =>
    route.fulfill({ status: 502, contentType: "text/html", body: "<h1>Bad Gateway</h1>" }),
  );
  await page.goto("/#ap-contact");
  await page.locator("#ap-lead-name").fill("Perusahaan Contoh");
  await page.locator("#ap-lead-phone").fill("081234567890");
  await page.locator("#ap-lead-message").fill("Butuh komponen plastik sesuai gambar.");
  await page.locator('#ap-form button[type="submit"]').click();
  await expect(page.locator("[data-form-status]")).toContainText("belum memberi kepastian penyimpanan");
  await expect(page.locator("[data-form-whatsapp]")).toBeVisible();
});

test("control and proof URLs render without horizontal overflow", async ({ page }) => {
  for (const width of [320, 375, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    for (const variant of ["control", "proof"] as const) {
      await page.goto(`/?ap_variant=${variant}#ap-contact`);
      await expect(page.locator("#ap-form")).toBeVisible();
      await expect(page.locator(".ap-contact-proof")).toHaveCount(variant === "proof" ? 1 : 0);
      const overflow = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth - window.innerWidth,
        offenders: [...document.querySelectorAll("body *")]
          .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1)
          .slice(0, 5)
          .map((element) => ({
            tag: element.tagName,
            className: element.className,
            right: element.getBoundingClientRect().right,
          })),
      }));
      expect(overflow.width, `${width}px ${variant}: ${JSON.stringify(overflow.offenders)}`).toBeLessThanOrEqual(1);
      if (width === 390 || width === 1440)
        await page.locator("#ap-contact").screenshot({ path: `output/playwright/landing-${variant}-${width}.png` });
    }
  }
});

test("FAQ hero and questions do not overlap on narrow screens", async ({ page }) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    await page.goto("/#ap-faq");
    await page.evaluate(() => document.fonts.ready);
    const boxes = await page.evaluate(() => {
      const intro = document.querySelector(".ap-faq-intro")!.getBoundingClientRect();
      const questions = document.querySelector(".ap-faq-list")!.getBoundingClientRect();
      return {
        intro: { x: intro.x, y: intro.y, width: intro.width, height: intro.height },
        questions: { x: questions.x, y: questions.y },
      };
    });
    const { intro, questions } = boxes;
    if (width <= 900) {
      expect(questions.y, `${width}px FAQ vertical spacing`).toBeGreaterThanOrEqual(intro.y + intro.height + 16);
    } else expect(questions.x, `${width}px FAQ columns`).toBeGreaterThanOrEqual(intro.x + intro.width + 16);
    await page.locator(".ap-faq-q").first().click();
    await expect(page.locator(".ap-faq-a").first()).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator(".ap-faq-a")
          .first()
          .evaluate((answer) => answer.clientHeight >= answer.scrollHeight),
      )
      .toBe(true);
    if (width === 390) await page.locator("#ap-faq").screenshot({ path: "output/playwright/landing-faq-390.png" });
  }
});
