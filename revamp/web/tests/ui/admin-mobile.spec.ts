import { expect, test } from "@playwright/test";

const routes = [
  "/admin",
  "/admin/growth",
  "/admin/growth/competitors",
  "/admin/growth/opportunities",
  "/admin/marketing",
  "/admin/insights",
  "/admin/finance",
  "/admin/transactions",
  "/admin/prospects",
  "/admin/email",
  "/admin/content",
  "/admin/masters",
  "/admin/masters/customers",
  "/admin/masters/suppliers",
  "/admin/masters/materials",
  "/admin/masters/products",
  "/admin/masters/moulds",
  "/admin/masters/designs",
  "/admin/remote-desktop",
  "/admin/settings/quotation",
  "/admin/settings/invoice",
  "/admin/settings/delivery",
  "/admin/settings/handover",
  "/admin/settings/integrations",
  "/admin/settings/email-templates",
  "/admin/settings/documents",
  "/admin/settings/templates?area=pdf&kind=quotation",
  "/admin/team",
  "/admin/profile",
] as const;

async function expectStableAdminLayout(page: import("@playwright/test").Page, requireMobileInputs = true) {
  const result = await page.evaluate((checkInputSize) => {
    const root = document.documentElement;
    const overflow = root.scrollWidth - root.clientWidth;
    const brokenWords = Array.from(document.querySelectorAll("h1, h2, h3"))
      .filter((element) => (element as HTMLElement).offsetParent !== null)
      .filter((element) => {
        const style = getComputedStyle(element);
        return style.wordBreak === "break-all" || style.overflowWrap === "anywhere";
      })
      .map((element) => element.textContent?.trim());
    const smallInputs = checkInputSize
      ? Array.from(
          document.querySelectorAll(
            'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea',
          ),
        )
          .filter((element) => (element as HTMLElement).offsetParent !== null)
          .filter((element) => getComputedStyle(element).fontSize !== "0px")
          .filter((element) => Number.parseFloat(getComputedStyle(element).fontSize) < 13)
          .map((element) => (element as HTMLInputElement).name || element.tagName)
      : [];
    const maxSurfaceDepth = Array.from(document.querySelectorAll("[data-ui-surface]")).reduce((max, element) => {
      let depth = 0;
      let current: Element | null = element;
      while (current) {
        if (current.hasAttribute("data-ui-surface")) depth += 1;
        current = current.parentElement;
      }
      return Math.max(max, depth);
    }, 0);
    return { overflow, brokenWords, smallInputs, maxSurfaceDepth };
  }, requireMobileInputs);

  expect(result.overflow).toBeLessThanOrEqual(1);
  expect(result.brokenWords).toEqual([]);
  expect(result.smallInputs).toEqual([]);
  expect(result.maxSurfaceDepth).toBeLessThanOrEqual(2);
}

async function prepareAnonymousVisualState(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    document.querySelectorAll(".admin-security-banner").forEach((element) => element.remove());
    const profile = document.querySelector<HTMLAnchorElement>('.admin-sidebar a[href="/admin/profile"]');
    const name = profile?.querySelector("strong");
    const role = profile?.querySelector("small");
    if (name) name.textContent = "Admin Contoh";
    if (role) role.textContent = "Back Office";
  });
}

async function expectTransactionGutters(page: import("@playwright/test").Page) {
  const geometry = await page.evaluate(() => {
    const workspace = document.querySelector<HTMLElement>(".transaction-flow-focus");
    const intro = workspace?.querySelector<HTMLElement>(".transaction-flow-focus__intro");
    const firstCard = workspace?.querySelector<HTMLElement>(
      ".transaction-flow-stack > .transaction-flow-card:first-of-type",
    );
    const cardHead = workspace?.querySelector<HTMLElement>(".transaction-flow-card__head");
    const aside = document.querySelector<HTMLElement>(".transaction-flow-aside");
    const canvas = document.querySelector<HTMLElement>(".admin-main");

    if (!workspace || !intro || !firstCard || !cardHead || !aside || !canvas) return null;

    const workspaceRect = workspace.getBoundingClientRect();
    const workspaceStyle = getComputedStyle(workspace);
    const introRect = intro.getBoundingClientRect();
    const introStyle = getComputedStyle(intro);
    const firstCardRect = firstCard.getBoundingClientRect();
    const firstCardStyle = getComputedStyle(firstCard);
    const cardHeadRect = cardHead.getBoundingClientRect();
    const asideStyle = getComputedStyle(aside);
    const canvasStyle = getComputedStyle(canvas);
    const viewportWidth = document.documentElement.clientWidth;
    const workspaceBorderLeft = Number.parseFloat(workspaceStyle.borderLeftWidth || "0");
    const workspaceBorderRight = Number.parseFloat(workspaceStyle.borderRightWidth || "0");

    return {
      viewportWidth,
      outerLeft: workspaceRect.left,
      outerRight: viewportWidth - workspaceRect.right,
      introLeft: introRect.left - workspaceRect.left + Number.parseFloat(introStyle.paddingLeft || "0"),
      introRight: workspaceRect.right - introRect.right + Number.parseFloat(introStyle.paddingRight || "0"),
      cardLeft: cardHeadRect.left - workspaceRect.left,
      cardRight: workspaceRect.right - cardHeadRect.right,
      asideLeft: Number.parseFloat(asideStyle.paddingLeft || "0"),
      asideRight: Number.parseFloat(asideStyle.paddingRight || "0"),
      workspacePaddingLeft: Number.parseFloat(workspaceStyle.paddingLeft || "0"),
      workspacePaddingRight: Number.parseFloat(workspaceStyle.paddingRight || "0"),
      firstCardInsetLeft: firstCardRect.left - workspaceRect.left - workspaceBorderLeft,
      firstCardInsetRight: workspaceRect.right - firstCardRect.right - workspaceBorderRight,
      firstCardPaddingLeft: Number.parseFloat(firstCardStyle.paddingLeft || "0"),
      firstCardPaddingRight: Number.parseFloat(firstCardStyle.paddingRight || "0"),
      firstCardBackground: firstCardStyle.backgroundColor,
      canvasBackground: canvasStyle.backgroundColor,
      firstCardBorderTop: Number.parseFloat(firstCardStyle.borderTopWidth || "0"),
      firstCardRadius: Number.parseFloat(firstCardStyle.borderTopLeftRadius || "0"),
      firstCardShadow: firstCardStyle.boxShadow,
    };
  });

  expect(geometry).not.toBeNull();
  expect(geometry!.introLeft).toBeGreaterThanOrEqual(15);
  expect(geometry!.introRight).toBeGreaterThanOrEqual(15);
  expect(geometry!.cardLeft).toBeGreaterThanOrEqual(15);
  expect(geometry!.cardRight).toBeGreaterThanOrEqual(15);

  if (geometry!.viewportWidth <= 430) {
    expect(geometry!.outerLeft).toBeGreaterThanOrEqual(8);
    expect(geometry!.outerRight).toBeGreaterThanOrEqual(8);
    expect(Math.abs(geometry!.outerLeft - geometry!.outerRight)).toBeLessThanOrEqual(2);
    expect(geometry!.workspacePaddingLeft).toBe(8);
    expect(geometry!.workspacePaddingRight).toBe(8);
    expect(geometry!.firstCardInsetLeft).toBeCloseTo(8, 0);
    expect(geometry!.firstCardInsetRight).toBeCloseTo(8, 0);
    expect(geometry!.firstCardPaddingLeft).toBe(10);
    expect(geometry!.firstCardPaddingRight).toBe(10);
    expect(geometry!.asideLeft).toBe(10);
    expect(geometry!.asideRight).toBe(10);
    expect(geometry!.firstCardBackground).not.toBe("rgba(0, 0, 0, 0)");
    expect(geometry!.firstCardBackground).not.toBe(geometry!.canvasBackground);
    expect(geometry!.firstCardBorderTop).toBe(0);
    expect(geometry!.firstCardRadius).toBe(10);
    expect(geometry!.firstCardShadow).toBe("none");
  } else {
    expect(geometry!.asideLeft).toBeGreaterThanOrEqual(15);
    expect(geometry!.asideRight).toBeGreaterThanOrEqual(15);
  }
}

for (const route of routes) {
  test(`${route} has a stable responsive shell`, async ({ page }, testInfo) => {
    await page.goto(route, { waitUntil: "networkidle" });
    await expect(page.locator(".admin-shell")).toBeVisible();
    await expectStableAdminLayout(page, testInfo.project.name !== "desktop");
  });
}

test("dashboard compact titles stay on one line at iPhone 12 mini width", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-12-mini", "Typography assertion targets the 375 px contract.");
  await page.goto("/admin", { waitUntil: "networkidle" });
  const titles = [
    "Permintaan pelanggan terbaru",
    "Kunjungan menurut waktu",
    "Kunjungan dan permintaan",
    "Perangkat yang digunakan",
  ];
  for (const title of titles) {
    const heading = page.getByRole("heading", { name: title, exact: true });
    await expect(heading).toBeVisible();
    const lines = await heading.evaluate((element) => {
      const style = getComputedStyle(element);
      return Math.round(element.getBoundingClientRect().height / Number.parseFloat(style.lineHeight));
    });
    expect(lines, title).toBe(1);
  }
  await prepareAnonymousVisualState(page);
  await expect(page).toHaveScreenshot("dashboard-iphone-12-mini.png", { fullPage: true });
});

test("mobile shell uses the compact safe-area gutter", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-12-mini", "Gutter assertion targets the 375 px contract.");
  await page.goto("/admin", { waitUntil: "networkidle" });
  const gutter = await page.locator(".admin-main").evaluate((main) => {
    const style = getComputedStyle(main);
    return {
      left: Number.parseFloat(style.paddingLeft),
      right: Number.parseFloat(style.paddingRight),
      shellWidth: document.querySelector<HTMLElement>(".admin-shell")?.getBoundingClientRect().width ?? 0,
      viewportWidth: document.documentElement.clientWidth,
    };
  });
  expect(gutter.left).toBe(8);
  expect(gutter.right).toBe(8);
  expect(Math.abs(gutter.shellWidth - gutter.viewportWidth)).toBeLessThanOrEqual(1);
});

test("document center and PDF template editor stay flat and readable", async ({ page }, testInfo) => {
  test.skip(
    !["iphone-12-mini", "desktop"].includes(testInfo.project.name),
    "Visual document regression runs at the primary mobile and desktop sizes.",
  );

  await page.goto("/admin/settings/documents", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Dokumen resmi" })).toBeVisible();
  await expect(page.getByText(/pengaturan belum selesai|Siap menerbitkan dokumen/)).toBeVisible();
  await expectStableAdminLayout(page, testInfo.project.name !== "desktop");
  const anonymousIdentity: Record<string, string> = {
    legalName: "CV Anugrah Plastik Contoh",
    address: "Jl. Industri Contoh No. 10, Bandung",
    phone: "022 0000 0000",
    email: "admin.contoh@example.com",
    website: "https://example.com",
    taxId: "",
    bankName: "Bank Contoh",
    bankAccountNo: "0000000000",
    bankAccountName: "Perusahaan Contoh",
    signerName: "Admin Contoh",
    signerTitle: "Administrator",
  };
  for (const [name, value] of Object.entries(anonymousIdentity)) {
    await page.locator(`[name="${name}"]`).fill(value);
  }
  await prepareAnonymousVisualState(page);
  await expect(page).toHaveScreenshot(`document-center-${testInfo.project.name}.png`, {
    fullPage: true,
    mask: [page.locator("time"), page.locator('.admin-sidebar a[href="/admin/profile"]')],
  });

  await page.goto("/admin/settings/templates?area=pdf&kind=quotation", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Penawaran", exact: true })).toBeVisible();
  await expect(page.getByText("Struktur dokumen dilindungi", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Simpan dan aktifkan" })).toBeVisible();
  await expectStableAdminLayout(page, testInfo.project.name !== "desktop");
  const kindList = await page.locator(".document-template-kind-list").evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(kindList.scrollWidth - kindList.clientWidth).toBeLessThanOrEqual(1);
  await prepareAnonymousVisualState(page);
  await expect(page).toHaveScreenshot(`document-template-${testInfo.project.name}.png`, {
    fullPage: true,
    mask: [page.locator('.admin-sidebar a[href="/admin/profile"]')],
  });
});

test("transaction navigator keeps number, title, and status in aligned rows", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-12-mini", "Navigator assertion targets the 375 px contract.");
  await page.goto("/admin/transactions", { waitUntil: "networkidle" });
  const detailHref = await page.locator('a[href*="/admin/transactions/"]').first().getAttribute("href");
  test.skip(!detailHref, "No local transaction is available for the navigator regression.");
  await page.goto(`${detailHref!.split("?")[0]}?step=quote`, { waitUntil: "networkidle" });
  const geometry = await page
    .locator(".transaction-flow-nav a")
    .first()
    .evaluate((item) => {
      const number = item.querySelector<HTMLElement>(":scope > span")!.getBoundingClientRect();
      const title = item.querySelector<HTMLElement>("strong")!.getBoundingClientRect();
      const status = item.querySelector<HTMLElement>("small")!.getBoundingClientRect();
      return {
        titleAboveStatus: title.bottom <= status.top + 1,
        numberCoversRows: number.top <= title.top && number.bottom >= status.bottom,
      };
    });
  expect(geometry.titleAboveStatus).toBe(true);
  expect(geometry.numberCoversRows).toBe(true);
});

test("ranking details remain readable without nested cards", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-12-mini", "Visual regression targets the 375 px contract.");
  await page.goto("/admin/growth/competitors", { waitUntil: "networkidle" });
  const firstDetails = page.locator(".seo-ranking-list__details").first();
  if (await firstDetails.count()) {
    await firstDetails.locator("summary").click();
    const firstRow = firstDetails.locator(".seo-score-row").first();
    await expect(firstRow).toBeVisible();
    await expect(firstRow.locator(".seo-score-row__keyword")).toBeVisible();
  }
  await expectStableAdminLayout(page);
  await prepareAnonymousVisualState(page);
  await expect(page).toHaveScreenshot("ranking-details-iphone-12-mini.png", { fullPage: true });
});

test("growth ranking keeps help inline and card content inset", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-12-mini", "Visual regression targets the 375 px contract.");
  await page.goto("/admin/growth", { waitUntil: "networkidle" });

  const categoryRow = page.locator(".growth-competitors__category-row");
  const title = categoryRow.getByRole("heading", { name: "Jasa cetak plastik · 4 kata kunci" });
  const help = categoryRow.getByLabel("Cara nilai ini dihitung");
  await expect(title).toBeVisible();
  await expect(help).toBeVisible();

  const geometry = await categoryRow.evaluate((row) => {
    const heading = row.querySelector("h3")!.getBoundingClientRect();
    const summary = row.querySelector("summary")!.getBoundingClientRect();
    const item = document.querySelector(".seo-ranking-list__item")!;
    const link = item.querySelector(".seo-ranking-list__link")!;
    const strong = link.querySelector("strong")!.getBoundingClientRect();
    const domain = link.querySelector("small")!.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const itemStyle = getComputedStyle(item);
    return {
      sameRow: Math.abs(heading.y + heading.height / 2 - (summary.y + summary.height / 2)),
      inlineGap: summary.x - heading.right,
      paddingLeft: Number.parseFloat(itemStyle.paddingLeft),
      contentInset: strong.x - itemRect.x,
      identityIsStacked: domain.y >= strong.bottom,
    };
  });

  expect(geometry.sameRow).toBeLessThanOrEqual(2);
  expect(geometry.inlineGap).toBeGreaterThanOrEqual(0);
  expect(geometry.inlineGap).toBeLessThanOrEqual(12);
  expect(geometry.paddingLeft).toBeGreaterThanOrEqual(12);
  expect(geometry.contentInset).toBeGreaterThanOrEqual(50);
  expect(geometry.identityIsStacked).toBe(true);
  await prepareAnonymousVisualState(page);
  await expect(page).toHaveScreenshot("growth-ranking-summary-iphone-12-mini.png", { fullPage: true });
});

test.describe("transaction steps", () => {
  for (const step of ["quote", "order", "payment", "production", "delivery", "handover"]) {
    test(`${step} stays flat and readable`, async ({ page }, testInfo) => {
      await page.goto("/admin/transactions", { waitUntil: "networkidle" });
      const detailHref = await page.locator('a[href*="/admin/transactions/"]').first().getAttribute("href");
      test.skip(!detailHref, "No local transaction is available for the detail regression.");
      const detailPath = detailHref!.split("?")[0];
      await page.goto(`${detailPath}?step=${step}`, { waitUntil: "networkidle" });
      await expect(page.locator(".transaction-flow-focus")).toHaveAttribute("data-ui-surface", "workspace");
      await expectStableAdminLayout(page, testInfo.project.name !== "desktop");
      await expectTransactionGutters(page);
      if (testInfo.project.name === "iphone-12-mini") {
        if (step === "quote") {
          const quoteDetails = page.locator("details.transaction-flow-details").filter({
            has: page.locator(".transaction-quote-editor"),
          });
          if (!(await quoteDetails.getAttribute("open"))) await quoteDetails.locator("summary").click();
        }
        await prepareAnonymousVisualState(page);
        await expect(page).toHaveScreenshot(`transaction-${step}-iphone-12-mini.png`, { fullPage: true });
      }
    });
  }
});

test("quote editor is compact without shrinking form controls", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-12-mini", "Density contract targets the 375 px viewport.");
  await page.goto("/admin/transactions", { waitUntil: "networkidle" });
  const detailHref = await page.locator('a[href*="/admin/transactions/"]').first().getAttribute("href");
  test.skip(!detailHref, "No local transaction is available for the quote density regression.");
  const detailPath = detailHref!.split("?")[0];
  await page.goto(`${detailPath}?step=quote`, { waitUntil: "networkidle" });

  const details = page.locator("details.transaction-flow-details").filter({
    has: page.locator(".transaction-quote-editor"),
  });
  if (!(await details.getAttribute("open"))) await details.locator("summary").click();

  const density = await page.locator(".transaction-quote-editor").evaluate((form) => {
    const labels = Array.from(form.querySelectorAll("label")).filter(
      (element) => (element as HTMLElement).offsetParent !== null,
    );
    const controls = Array.from(
      form.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea'),
    ).filter((element) => (element as HTMLElement).offsetParent !== null);
    const firstInput = controls[0] as HTMLElement | undefined;
    const firstLabel = labels[0] as HTMLElement | undefined;
    const rect = form.getBoundingClientRect();
    return {
      height: rect.height,
      inputFontSize: firstInput ? Number.parseFloat(getComputedStyle(firstInput).fontSize) : 0,
      inputFontWeight: firstInput ? Number.parseFloat(getComputedStyle(firstInput).fontWeight) : 0,
      inputHeight: firstInput?.getBoundingClientRect().height ?? 0,
      labelFontSize: firstLabel ? Number.parseFloat(getComputedStyle(firstLabel).fontSize) : 0,
      columns: getComputedStyle(form.querySelector(".transaction-quote-editor__line")!).gridTemplateColumns,
    };
  });

  expect(density.height).toBeLessThanOrEqual(1624);
  expect(density.inputFontSize).toBe(13);
  expect(density.inputFontWeight).toBeLessThanOrEqual(500);
  expect(density.inputHeight).toBeGreaterThanOrEqual(44);
  expect(density.labelFontSize).toBeLessThanOrEqual(14);
  expect(density.columns).toContain("repeat(2");
});

for (const [name, route] of [
  ["finance", "/admin/finance"],
  ["content", "/admin/content"],
  ["email", "/admin/email"],
  ["design-files", "/admin/masters/designs"],
] as const) {
  test(`${name} keeps the compact mobile typography`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "iphone-12-mini", "Visual regression targets the 375 px contract.");
    await page.goto(route, { waitUntil: "networkidle" });
    await expectStableAdminLayout(page);
    await prepareAnonymousVisualState(page);
    await expect(page).toHaveScreenshot(`${name}-iphone-12-mini.png`, {
      fullPage: true,
      mask: [page.locator("time")],
    });
  });
}

test("3D upload keeps the business relation optional", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-12-mini", "Upload assertion targets the 375 px contract.");
  await page.goto("/admin/masters/designs", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Unggah file 3D" }).click();
  const dialog = page.locator(".design-upload-dialog");
  const relation = dialog.getByLabel("Tautkan ke (opsional)");
  await expect(relation).toBeVisible();
  await expect(relation).not.toHaveAttribute("required", "");
  await expect(dialog.getByText("Bisa ditambahkan nanti.", { exact: true })).toBeVisible();
});

test("3D viewer controls stay above the mobile gesture hint", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-12-mini", "Viewer assertion targets the 375 px contract.");
  await page.goto("/admin/masters/designs", { waitUntil: "networkidle" });
  const detailHref = await page.locator('a[aria-label^="Lihat detail"]').first().getAttribute("href");
  test.skip(!detailHref, "No local 3D file is available for the viewer regression.");
  await page.goto(detailHref!, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".design-viewer__toolbar")).toBeVisible();

  const geometry = await page.evaluate(() => {
    const toolbar = document.querySelector<HTMLElement>(".design-viewer__toolbar")!.getBoundingClientRect();
    const hint = document.querySelector<HTMLElement>(".design-viewer__hint")!.getBoundingClientRect();
    const buttons = Array.from(document.querySelectorAll<HTMLElement>(".design-viewer__toolbar button")).map((button) =>
      button.getBoundingClientRect(),
    );
    return {
      gap: hint.top - toolbar.bottom,
      centerDelta: Math.abs(toolbar.left + toolbar.width / 2 - window.innerWidth / 2),
      buttonSizes: buttons.map(({ width, height }) => ({ width, height })),
    };
  });

  expect(geometry.gap).toBeGreaterThanOrEqual(8);
  expect(geometry.centerDelta).toBeLessThanOrEqual(1);
  expect(geometry.buttonSizes.every(({ width, height }) => width === 44 && height === 44)).toBe(true);
  await expect(page.getByText("Tarik untuk putar · Cubit untuk zoom", { exact: true })).toBeVisible();
});
