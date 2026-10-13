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
    "./google-ads-config": { googleAdsDataSource: () => "live" },
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

test("snapshot endpoint requires HTTPS and a dedicated constant-time bearer token", async () => {
  const payload = {
    schemaVersion: 1,
    generatedAt: "2026-10-13T01:00:00.000Z",
    sourceLastSyncAt: "2026-10-13T00:00:00.000Z",
    accountTimeZone: "Asia/Jakarta",
    from: "2026-10-06",
    to: "2026-10-12",
    completeThrough: "2026-10-12",
    rows: [],
  };
  let calls = 0;
  const route = load("app/api/integrations/google-ads/snapshot/route.ts", {
    "@/features/integrations/google-ads-config": { googleAdsSnapshotToken: () => "s".repeat(48) },
    "@/features/integrations/google-ads-snapshot": {
      createGoogleAdsSnapshot: async () => {
        calls++;
        return payload;
      },
    },
  });
  const request = (url, token, forwardedProto) =>
    new Request(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...(forwardedProto ? { "x-forwarded-proto": forwardedProto } : {}),
      },
      body: JSON.stringify({ from: payload.from, to: payload.to }),
    });
  assert.equal((await route.POST(request("http://example.test", "s".repeat(48)))).status, 400);
  assert.equal((await route.POST(request("https://example.test", "wrong"))).status, 401);
  const response = await route.POST(request("http://example.test", "s".repeat(48), "https"));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.deepEqual(await response.json(), payload);
  assert.equal(calls, 1);
});

test("snapshot mode is explicit and blocks live Google refreshes", () => {
  const config = load("features/integrations/google-ads-config.ts", { "server-only": {} });
  const previous = {
    source: process.env.GOOGLE_ADS_DATA_SOURCE,
    url: process.env.GOOGLE_ADS_SNAPSHOT_URL,
    token: process.env.GOOGLE_ADS_SNAPSHOT_TOKEN,
  };
  try {
    delete process.env.GOOGLE_ADS_DATA_SOURCE;
    assert.equal(config.googleAdsDataSource(), "live");
    process.env.GOOGLE_ADS_DATA_SOURCE = "snapshot";
    process.env.GOOGLE_ADS_SNAPSHOT_URL = "http://anugrahplastik.com/api/integrations/google-ads/snapshot";
    process.env.GOOGLE_ADS_SNAPSHOT_TOKEN = "x".repeat(48);
    assert.equal(config.isGoogleAdsSnapshotConfigured(), false);
    process.env.GOOGLE_ADS_SNAPSHOT_URL = "https://anugrahplastik.com/api/integrations/google-ads/snapshot";
    assert.equal(config.isGoogleAdsSnapshotConfigured(), true);
    assert.equal(config.googleAdsSnapshotUrl(), process.env.GOOGLE_ADS_SNAPSHOT_URL);
  } finally {
    if (previous.source === undefined) delete process.env.GOOGLE_ADS_DATA_SOURCE;
    else process.env.GOOGLE_ADS_DATA_SOURCE = previous.source;
    if (previous.url === undefined) delete process.env.GOOGLE_ADS_SNAPSHOT_URL;
    else process.env.GOOGLE_ADS_SNAPSHOT_URL = previous.url;
    if (previous.token === undefined) delete process.env.GOOGLE_ADS_SNAPSHOT_TOKEN;
    else process.env.GOOGLE_ADS_SNAPSHOT_TOKEN = previous.token;
  }
  const service = readFileSync(join(__dirname, "../src/features/integrations/google-ads-service.ts"), "utf8");
  const runner = readFileSync(join(__dirname, "../src/features/integrations/sync-runner.ts"), "utf8");
  assert.match(service, /googleAdsDataSource\(\) !== "live"/);
  assert.match(runner, /googleAdsDataSource\(\) === "live"/);
});

test("marketing snapshot controls are manual, admin-only, and preserve the local report on failure", () => {
  const page = readFileSync(join(__dirname, "../src/app/admin/marketing/page.tsx"), "utf8");
  const controls = readFileSync(join(__dirname, "../src/components/google-ads-report-controls.tsx"), "utf8");
  const actions = readFileSync(join(__dirname, "../src/features/integrations/actions.ts"), "utf8");
  const snapshot = readFileSync(join(__dirname, "../src/features/integrations/google-ads-snapshot.ts"), "utf8");
  assert.match(page, /snapshotMode \|\| Boolean\(connection\?\.secretCiphertext\)/);
  assert.match(page, /canImportSnapshot=\{user\.role === "admin" && snapshotConfigured\}/);
  assert.match(controls, /Ambil snapshot production/);
  assert.match(controls, /refreshGoogleAdsSnapshot/);
  assert.match(actions, /requireRole\(\["admin"\]\)/);
  assert.match(snapshot, /database\.transaction/);
  assert.match(snapshot, /await requestGoogleAdsSnapshot\(\)/);
  assert.ok(snapshot.indexOf("await requestGoogleAdsSnapshot()") < snapshot.indexOf("database.transaction"));
  assert.match(snapshot, /delete\(googleAdsDailyReports\)/);
  assert.match(snapshot, /snapshotImportedAt/);
});

test(
  "snapshot import replaces only its validated range atomically and is idempotent",
  {
    skip: process.env.GOOGLE_ADS_DB_TEST !== "1",
  },
  async () => {
    process.loadEnvFile(".env.local");
    const { Pool } = require("pg");
    const { drizzle } = require("drizzle-orm/node-postgres");
    const { randomUUID } = require("node:crypto");
    const schemaName = `ads_snapshot_test_${randomUUID().replaceAll("-", "")}`;
    const owner = new Pool({ connectionString: process.env.DATABASE_URL });
    const schema = load("lib/database/schema.ts");
    let pool;
    const originalFetch = global.fetch;
    try {
      await owner.query(`CREATE SCHEMA "${schemaName}"`);
      await owner.query(`CREATE TABLE "${schemaName}".integrations (LIKE public.integrations INCLUDING ALL)`);
      await owner.query(
        `CREATE TABLE "${schemaName}".google_ads_daily_reports (LIKE public.google_ads_daily_reports INCLUDING ALL)`,
      );
      pool = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schemaName}` });
      await pool.query(
        "INSERT INTO integrations (key, status, secret_ciphertext, metadata) VALUES ('google-ads', 'connected', 'keep-me', '{}')",
      );
      await pool.query(
        "INSERT INTO google_ads_daily_reports (report_date, campaign_id, campaign_name, status, currency_code, impressions, clicks, cost_micros, conversions, conversions_value) VALUES ('2026-06-01', '9', 'Outside', 'PAUSED', 'IDR', 1, 1, '1', '0', '0'), ('2026-10-06', '8', 'Stale', 'PAUSED', 'IDR', 1, 1, '1', '0', '0')",
      );
      const db = drizzle({ client: pool, schema });
      const snapshot = load("features/integrations/google-ads-snapshot.ts", {
        "server-only": {},
        "@/lib/database/client": { getDatabase: () => db },
        "@/lib/database/schema": schema,
        "./google-ads-config": {
          googleAdsDataSource: () => "snapshot",
          googleAdsSnapshotToken: () => "s".repeat(48),
          googleAdsSnapshotUrl: () => "https://anugrahplastik.com/api/integrations/google-ads/snapshot",
          isGoogleAdsSnapshotConfigured: () => true,
        },
        "./google-ads-report-model": {
          completeAdsRange: () => ({ from: "2026-07-15", to: "2026-10-12" }),
          adsDateInTimeZone: () => "2026-10-12",
        },
        "./google-ads-service": { validateGoogleAdsRange: () => true },
      });
      let invalid = false;
      global.fetch = async (_url, options) => {
        const request = JSON.parse(options.body);
        if (invalid) return Response.json({ invalid: true });
        return Response.json({
          schemaVersion: 1,
          generatedAt: "2026-10-13T01:00:00.000Z",
          sourceLastSyncAt: "2026-10-13T00:00:00.000Z",
          accountTimeZone: "Asia/Jakarta",
          from: request.from,
          to: request.to,
          completeThrough: request.to,
          rows: [
            {
              reportDate: "2026-10-06",
              campaignId: "123",
              campaignName: "GOOG_DG_LEADS_KORIDOR-INDUSTRI_2026Q4",
              status: "ENABLED",
              currencyCode: "IDR",
              impressions: 26736,
              clicks: 622,
              costMicros: "165783000000",
              conversions: "0",
              conversionsValue: "0",
              syncedAt: "2026-10-13T00:00:00.000Z",
            },
          ],
        });
      };
      const actorId = randomUUID();
      assert.deepEqual(await snapshot.importGoogleAdsSnapshot(actorId), {
        rows: 1,
        from: "2026-07-15",
        to: "2026-10-12",
      });
      await snapshot.importGoogleAdsSnapshot(actorId);
      const { rows } = await pool.query(
        "SELECT campaign_id, campaign_name FROM google_ads_daily_reports ORDER BY report_date, campaign_id",
      );
      assert.deepEqual(
        rows.map((item) => item.campaign_id),
        ["9", "123"],
      );
      assert.equal(rows[1].campaign_name, "GOOG_DG_LEADS_KORIDOR-INDUSTRI_2026Q4");
      const {
        rows: [connection],
      } = await pool.query(
        "SELECT secret_ciphertext, metadata->>'snapshotImportedAt' AS imported_at FROM integrations WHERE key='google-ads'",
      );
      assert.equal(connection.secret_ciphertext, "keep-me");
      assert.ok(connection.imported_at);
      invalid = true;
      await assert.rejects(snapshot.importGoogleAdsSnapshot(actorId), /Struktur snapshot production tidak valid/);
      assert.equal((await pool.query("SELECT count(*) AS n FROM google_ads_daily_reports")).rows[0].n, "2");
    } finally {
      global.fetch = originalFetch;
      if (pool) await pool.end();
      await owner.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await owner.end();
    }
  },
);

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
          googleAdsDataSource: () => "live",
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
