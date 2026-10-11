/* eslint-disable @typescript-eslint/no-require-imports -- Isolated TypeScript modules for Node's test runner. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function load(file, dependencies = {}) {
  const source = readFileSync(join(__dirname, "../src", file), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const instance = { exports: {} };
  new Function("module", "exports", "require", compiled)(instance, instance.exports, (name) =>
    Object.hasOwn(dependencies, name)
      ? dependencies[name]
      : name.startsWith("@/") || name.startsWith("./")
        ? {}
        : require(name),
  );
  return instance.exports;
}
const model = load("features/integrations/google-ads-report-model.ts");
const { placeAdsChartLabels } = load("features/integrations/google-ads-chart-layout.ts");
const row = (date, clicks, cost, impressions = 10) => ({
  reportDate: date,
  clicks,
  costMicros: String(cost * 1_000_000),
  impressions,
  conversions: "0.5",
  conversionsValue: "1000",
});

test("presets end yesterday in Jakarta, including the midnight boundary and leap day", () => {
  const now = new Date("2026-10-01T17:00:00Z");
  assert.deepEqual(model.completeAdsRange(7, now), { from: "2026-09-25", to: "2026-10-01" });
  assert.deepEqual(model.completeAdsRange(7, new Date("2026-10-01T16:59:59Z")), {
    from: "2026-09-24",
    to: "2026-09-30",
  });
  assert.deepEqual(model.completeAdsRange(7, new Date("2024-03-01T01:00:00Z")), {
    from: "2024-02-23",
    to: "2024-02-29",
  });
  for (const days of [7, 30, 90]) {
    const range = model.completeAdsRange(days, now);
    assert.equal(model.toAdsChartPoints([], range.from, range.to, "daily").length, days);
  }
});

test("CPC is weighted total cost divided by total clicks, not the mean of daily CPC", () => {
  const rows = [row("2026-09-30", 4, 49842, 42), row("2026-10-01", 2, 28348, 23)];
  const totals = model.sumAdsRows(rows);
  assert.equal(totals.clicks, 6);
  assert.equal(totals.impressions, 65);
  assert.equal(totals.cost, 78190);
  assert.equal(totals.averageCpc, 78190 / 6);
  assert.equal(totals.conversions, 1);
  assert.equal(model.averageCpc(12, 0), 0);
  const points = model.toAdsChartPoints(rows, "2026-09-25", "2026-10-01", "daily");
  assert.equal(points.length, 7);
  assert.equal(points[0].values.clicks, 0);
  for (const metric of ["clicks", "impressions", "cost", "conversions", "conversionValue"])
    assert.equal(
      points.reduce((sum, point) => sum + point.values[metric], 0),
      totals[metric],
    );
  assert.equal(
    model.toAdsChartPoints(rows, "2026-09-25", "2026-10-01", "weekly")[0].values.averageCpc,
    totals.averageCpc,
  );
  assert.equal(model.toAdsChartPoints(rows, "2026-09-25", "2026-10-01", "monthly").length, 2);
});

test("chart labels remain separated and inside mobile bounds, even when four series share a peak", () => {
  const labels = Array.from({ length: 7 }, (_, day) =>
    Array.from({ length: 4 }, (_, slot) => ({
      id: `${day}-${slot}`,
      text: slot > 1 ? "Rp14,2 rb" : "42",
      x: 38 + (day / 6) * 184,
      y: 50,
      slot,
    })),
  ).flat();
  const positioned = placeAdsChartLabels(labels, 260, 300);
  assert.equal(positioned.length, labels.length);
  positioned.forEach((label, index) => {
    assert.ok(label.labelX - label.textWidth / 2 >= 0);
    assert.ok(label.labelX + label.textWidth / 2 <= 260);
    for (const other of positioned.slice(index + 1))
      assert.ok(
        Math.abs(label.labelY - other.labelY) >= 19 ||
          Math.abs(label.labelX - other.labelX) >= (label.textWidth + other.textWidth) / 2 + 4,
      );
  });
});

test("legacy metric URLs retain valid choices, while invalid and duplicate choices are removed", () => {
  assert.deepEqual(model.normalizeAdsMetrics(undefined), ["clicks", "impressions", "averageCpc", "cost"]);
  assert.deepEqual(model.normalizeAdsMetrics("impressions,cost,conversions,conversionValue"), [
    "impressions",
    "cost",
    "conversions",
    "conversionValue",
  ]);
  assert.deepEqual(model.normalizeAdsMetrics("conversions,conversions,bad"), [
    "conversions",
    "clicks",
    "impressions",
    "averageCpc",
  ]);
});

test("only admins can trigger provider refreshes", async () => {
  let user;
  let calls = 0;
  const actions = load("features/integrations/actions.ts", {
    "@/lib/auth/session": { getSession: async () => user },
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": {
      redirect: (url) => {
        throw new Error(`redirect:${url}`);
      },
    },
    "./google-ads-service": {
      syncGoogleAdsOncePerJakartaDay: async () => {
        calls++;
        return "updated";
      },
      validateGoogleAdsRange: () => true,
      syncGoogleAdsReportRange: async () => {
        calls++;
      },
    },
    "./google-ads-report-model": model,
  });
  for (user of [null, { role: "content" }])
    await assert.rejects(actions.refreshGoogleAdsIfDue(), /tidak memiliki akses/);
  assert.equal(calls, 0);
  user = { role: "admin" };
  assert.equal(await actions.refreshGoogleAdsIfDue(), "updated");
  user = { role: "sales" };
  await assert.rejects(actions.refreshGoogleAdsIfDue(), /tidak memiliki akses/);
  const form = new FormData();
  form.set("from", "2026-09-25");
  form.set("to", "2026-10-01");
  form.set("metrics", "clicks,impressions,averageCpc,cost");
  await assert.rejects(actions.refreshGoogleAdsRange(form), /tidak memiliki akses/);
});

test("marketing filters never auto-refresh Google Ads from a browser render", () => {
  const performance = readFileSync(join(__dirname, "../src/components/google-ads-performance.tsx"), "utf8");
  const controls = readFileSync(join(__dirname, "../src/components/google-ads-report-controls.tsx"), "utf8");
  assert.doesNotMatch(performance, /refreshGoogleAdsIfDue|useEffect/);
  assert.match(controls, /Terapkan filter/);
  assert.match(controls, /Verifikasi akses API/);
  assert.match(controls, /Perbarui laporan sekarang/);
});

test("CSV keeps accurate CPC and rejects unauthenticated and content-editor access", async () => {
  let user;
  const rows = [
    { ...row("2026-10-01", 2, 25), campaignId: "1", campaignName: "=Danger", status: "ENABLED", currencyCode: "IDR" },
  ];
  const route = load("app/api/admin/marketing/google-ads/export/route.ts", {
    "@/lib/auth/session": { getSession: async () => user },
    "@/lib/database/schema": load("lib/database/schema.ts"),
    "@/lib/database/client": {
      getDatabase: () => ({ select: () => ({ from: () => ({ where: () => ({ orderBy: async () => rows }) }) }) }),
    },
    "@/features/integrations/google-ads-service": { validateGoogleAdsRange: () => true },
    "@/features/integrations/google-ads-report-model": model,
  });
  const request = new Request("http://localhost/api/admin/marketing/google-ads/export?from=2026-09-25&to=2026-10-01");
  for (user of [null, { role: "content" }]) assert.equal((await route.GET(request)).status, 403);
  user = { role: "sales" };
  const response = await route.GET(request);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /private, no-store/);
  const csv = await response.text();
  assert.match(csv, /"Rata-rata CPC"/);
  assert.match(csv, /"12.5"/);
  assert.match(csv, /"'=Danger"/);
});

test(
  "shared daily claim is atomic in PostgreSQL and failure preserves stored reports",
  {
    skip: process.env.GOOGLE_ADS_DB_TEST !== "1",
  },
  async () => {
    process.loadEnvFile(".env.local");
    const { Pool } = require("pg");
    const { drizzle } = require("drizzle-orm/node-postgres");
    const { randomUUID } = require("node:crypto");
    const schemaName = `ads_test_${randomUUID().replaceAll("-", "")}`;
    const owner = new Pool({ connectionString: process.env.DATABASE_URL });
    const schema = load("lib/database/schema.ts");
    let pool;
    const originalFetch = global.fetch;
    const originalId = process.env.GOOGLE_ADS_CLIENT_ID;
    const originalSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    const originalCustomerId = process.env.GOOGLE_ADS_CUSTOMER_ID;
    const originalLoginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
    const originalDeveloperToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    try {
      await owner.query(`CREATE SCHEMA "${schemaName}"`);
      await owner.query(`CREATE TABLE "${schemaName}".integrations (LIKE public.integrations INCLUDING ALL)`);
      await owner.query(
        `CREATE TABLE "${schemaName}".google_ads_daily_reports (LIKE public.google_ads_daily_reports INCLUDING ALL)`,
      );
      pool = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schemaName}` });
      await pool.query(
        "INSERT INTO integrations (key, secret_ciphertext, metadata) VALUES ('google-ads', 'test-only', $1)",
        [
          JSON.stringify({
            keep: true,
            lastProbeCode: "success",
            lastProbeAt: new Date().toISOString(),
            adsAccountTimeZone: "Asia/Jakarta",
          }),
        ],
      );
      const db = drizzle({ client: pool, schema });
      const service = load("features/integrations/google-ads-service.ts", {
        "server-only": {},
        "@/lib/database/client": { getDatabase: () => db },
        "@/lib/database/schema": schema,
        "./google-ads-report-model": model,
        "./secrets": { decryptSecret: () => ({ refreshToken: "test-only" }) },
        "./google-ads-config": {
          googleAdsCustomerId: () => process.env.GOOGLE_ADS_CUSTOMER_ID,
          googleAdsDeveloperToken: () => process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
          googleAdsLoginCustomerId: () => process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
          isGoogleAdsReportingConfigured: () => true,
        },
      });
      process.env.GOOGLE_ADS_CLIENT_ID = "test-only";
      process.env.GOOGLE_ADS_CLIENT_SECRET = "test-only";
      process.env.GOOGLE_ADS_CUSTOMER_ID = "6738895829";
      process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID = "1234567890";
      process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "test-only-developer-token";
      let reportCalls = 0;
      let fail = false;
      global.fetch = async (url) => {
        if (url.includes("oauth2")) return Response.json({ access_token: "test-only" });
        reportCalls++;
        if (fail) return new Response("", { status: 503 });
        return Response.json([
          {
            results: [
              {
                campaign: { id: "1", name: "Test", status: "ENABLED" },
                customer: { currencyCode: "IDR" },
                segments: { date: model.adsDateInJakarta(3) },
                metrics: { clicks: "2", impressions: "10", costMicros: "2000000", conversions: 0, conversionsValue: 0 },
              },
            ],
          },
        ]);
      };
      const now = new Date(`${model.adsDateInJakarta(2)}T01:00:00Z`);
      const results = await Promise.all(Array.from({ length: 8 }, () => service.syncGoogleAdsOncePerJakartaDay(now)));
      assert.equal(results.filter((result) => result === "updated").length, 1);
      assert.equal(reportCalls, 1);
      assert.equal(await service.syncGoogleAdsOncePerJakartaDay(now), "not-due");
      fail = true;
      const retryDay = new Date(now.getTime() + 86400000);
      assert.equal(await service.syncGoogleAdsOncePerJakartaDay(retryDay), "error");
      assert.equal(await service.syncGoogleAdsOncePerJakartaDay(new Date(retryDay.getTime() + 14 * 60_000)), "not-due");
      assert.equal(await service.syncGoogleAdsOncePerJakartaDay(new Date(retryDay.getTime() + 15 * 60_000)), "error");
      assert.equal(await service.syncGoogleAdsOncePerJakartaDay(new Date(retryDay.getTime() + 30 * 60_000)), "error");
      const {
        rows: [beforeExhaustion],
      } = await pool.query("SELECT metadata FROM integrations WHERE key='google-ads'");
      assert.equal(beforeExhaustion.metadata.adsAutoFailureCount, 3);
      assert.equal(beforeExhaustion.metadata.adsAutoFailureDate, model.adsDateInJakarta(0, retryDay));
      assert.equal(
        await service.syncGoogleAdsOncePerJakartaDay(new Date(retryDay.getTime() + 45 * 60_000)),
        "retry-exhausted",
      );
      assert.equal(reportCalls, 4);
      const {
        rows: [connection],
      } = await pool.query("SELECT metadata, last_error FROM integrations WHERE key='google-ads'");
      assert.equal(connection.metadata.keep, true);
      assert.equal(connection.metadata.adsAutoSuccessDate, model.adsDateInJakarta(0, now));
      assert.equal(connection.metadata.adsAutoFailureCount, 3);
      assert.match(connection.last_error, /gagal/);
      assert.equal((await pool.query("SELECT count(*) AS n FROM google_ads_daily_reports")).rows[0].n, "1");
    } finally {
      global.fetch = originalFetch;
      if (originalId === undefined) delete process.env.GOOGLE_ADS_CLIENT_ID;
      else process.env.GOOGLE_ADS_CLIENT_ID = originalId;
      if (originalSecret === undefined) delete process.env.GOOGLE_ADS_CLIENT_SECRET;
      else process.env.GOOGLE_ADS_CLIENT_SECRET = originalSecret;
      if (originalCustomerId === undefined) delete process.env.GOOGLE_ADS_CUSTOMER_ID;
      else process.env.GOOGLE_ADS_CUSTOMER_ID = originalCustomerId;
      if (originalLoginCustomerId === undefined) delete process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
      else process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID = originalLoginCustomerId;
      if (originalDeveloperToken === undefined) delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
      else process.env.GOOGLE_ADS_DEVELOPER_TOKEN = originalDeveloperToken;
      if (pool) await pool.end();
      // Only the uniquely named schema created by this test is disposable.
      await owner.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await owner.end();
    }
  },
);
