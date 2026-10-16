/* eslint-disable @typescript-eslint/no-require-imports -- Tests load isolated TypeScript modules without a build. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
function load(file, replacements = {}, cache = new Map()) {
  const absolute = path.resolve(__dirname, "..", file);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const source = readFileSync(absolute, "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const fixtureModule = { exports: {} };
  cache.set(absolute, fixtureModule);
  const requireLocal = (id) => {
    if (replacements[id]) return replacements[id];
    if (id.startsWith(".") || id.startsWith("@/")) {
      const resolved = id.startsWith("@/")
        ? path.resolve(__dirname, "../src", id.slice(2))
        : path.resolve(path.dirname(absolute), id);
      if (resolved.endsWith(".json")) return require(resolved);
      return load(path.relative(path.resolve(__dirname, ".."), `${resolved}.ts`), replacements, cache);
    }
    return require(id);
  };
  new Function("require", "module", "exports", code)(requireLocal, fixtureModule, fixtureModule.exports);
  return fixtureModule.exports;
}
const model = load("src/features/analytics/visitor-report-model.ts");
const geo = load("src/features/analytics/request-context.ts");
const filters = { days: 7, device: "all", city: "", source: "", outcome: "" };
const sample = [
  { country: "Indonesia", region: "West Java", city: "Bandung", total: 25, forms: 3 },
  { country: "ID", region: "Jawa Barat", city: "Cimahi", total: 5, forms: 1 },
  { country: "Indonesia", region: "Papua Tengah", city: "Nabire", total: 2, forms: 0 },
  { country: "Singapore", region: "Singapore", city: "Singapore", total: 4, forms: 0 },
  { country: null, region: null, city: null, total: 3, forms: 0 },
];
test("GeoIP health reports missing configuration without guessing visitor location", async () => {
  const previousProxy = process.env.TRUST_PROXY_HEADERS;
  const previousPath = process.env.GEOIP_CITY_DB_PATH;
  try {
    delete process.env.TRUST_PROXY_HEADERS;
    delete process.env.GEOIP_CITY_DB_PATH;
    assert.equal((await geo.geoIpHealth()).ready, false);
    process.env.TRUST_PROXY_HEADERS = "true";
    process.env.GEOIP_CITY_DB_PATH = "__missing-geoip-test__.mmdb";
    assert.equal((await geo.geoIpHealth()).ready, false);
    assert.deepEqual(await geo.locationContext(new Headers()), {
      countryName: null,
      regionName: null,
      cityName: null,
    });
  } finally {
    if (previousProxy === undefined) delete process.env.TRUST_PROXY_HEADERS;
    else process.env.TRUST_PROXY_HEADERS = previousProxy;
    if (previousPath === undefined) delete process.env.GEOIP_CITY_DB_PATH;
    else process.env.GEOIP_CITY_DB_PATH = previousPath;
  }
});
test("peta menggabungkan alias eksplisit tanpa mengurangi jumlah sesi", () => {
  const rows = model.geographyBuckets(sample, "indonesia");
  assert.equal(rows[0].label, "Jawa Barat");
  assert.equal(rows[0].total, 30);
  assert.equal(rows[0].forms, 4);
  assert.equal(rows[0].cities.length, 2);
  assert.equal(rows[1].point, null);
  assert.deepEqual(model.geographySummary(sample), { total: 39, indonesia: 32, overseas: 4, unknown: 3, unmapped: 2 });
  assert.equal(
    model.geographyBuckets(sample, "world").reduce((sum, item) => sum + item.total, 0),
    39,
  );
  assert.ok(model.geographyBuckets(sample, "world").find((item) => item.key === "SGP").point);
});
test("lokasi kosong tidak ditebak dari nama kota; angka sama tetap sama", () => {
  const rows = model.geographyBuckets(
    [{ country: null, region: null, city: "Bandung", total: 4, forms: 0 }],
    "indonesia",
  );
  assert.equal(rows.length, 0);
  const tied = model.geographyBuckets(
    [
      { country: "Indonesia", region: "West Java", city: null, total: 4, forms: 0 },
      { country: "Indonesia", region: "East Java", city: null, total: 4, forms: 0 },
    ],
    "indonesia",
  );
  assert.equal(tied[0].total, tied[1].total);
  assert.deepEqual(model.geographyBuckets([], "world"), []);
});
test("filter alias mempunyai arti yang sama dengan agregasi peta", () => {
  assert.ok(model.locationAliases("Jawa Barat", "region").includes("west java"));
  assert.ok(model.locationAliases("Indonesia", "country").includes("id"));
  assert.deepEqual(model.locationAliases("Wilayah tidak dikenal", "region"), ["wilayah tidak dikenal"]);
});
test("laporan pengunjung tidak mengekspos pemilih mode contoh", () => {
  assert.equal("visitorView" in model, false);
});
test("URL mempertahankan filter dan cakupan tanpa sumber data; filter baru menghapus cursor/sesi", () => {
  const query = new URLSearchParams(
    model.visitorQuery(
      {
        ...filters,
        days: 30,
        city: "Bandung",
        country: "Indonesia",
        region: "West Java",
        source: "Google",
        device: "mobile",
      },
      "world",
    ),
  );
  assert.equal(query.get("days"), "30");
  assert.equal(query.get("city"), "Bandung");
  assert.equal(query.has("view"), false);
  assert.equal(query.get("map"), "world");
  assert.equal(query.has("session"), false);
  assert.equal(query.has("cursor"), false);
  const selected = new URLSearchParams(
    model.visitorQuery(filters, "indonesia", { session: "abc", cursor: "cursor", direction: "next" }),
  );
  assert.equal(selected.get("session"), "abc");
  assert.equal(selected.get("cursor"), "cursor");
});
test("koordinat peta adalah referensi wilayah dan tetap di dalam cakupan", () => {
  const [x, y] = model.mapPoint([110, -7], "indonesia");
  assert.ok(x > 0 && x < 900 && y > 0 && y < 400);
});
test("label wilayah yang berdekatan dipisahkan tanpa mengubah titik referensi", () => {
  const buckets = model.geographyBuckets(sample, "indonesia");
  const labels = model.layoutMapMarkers(
    [...buckets, { ...buckets[0], key: "nearby", point: [107.7, -6.9] }],
    "indonesia",
  );
  assert.ok(
    Math.hypot(labels[0].position[0] - labels[1].position[0], labels[0].position[1] - labels[1].position[1]) >= 70,
  );
  assert.deepEqual(labels[0].anchor, model.mapPoint(buckets[0].point, "indonesia"));
});

test("grafik SSR menyajikan dua seri, label langsung, tujuh baris, dan keadaan kosong tanpa garis nol", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { VisitorDailyChart } = load("src/components/visitor-daily-chart.tsx");
  const points = Array.from({ length: 7 }, (_, index) => ({
    date: `2026-09-${25 + index}`,
    sessions: index + 1,
    forms: index % 2,
  }));
  const html = renderToStaticMarkup(React.createElement(VisitorDailyChart, { points }));
  assert.equal((html.match(/<polyline /g) || []).length, 2);
  assert.equal((html.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0].match(/<tr>/g) || []).length, 7);
  assert.match(html, /visitor-chart-series--forms/);
  assert.match(html, /Angka setiap hari · <!-- -->7<!-- --> tanggal|Angka setiap hari · 7 tanggal/);
  const empty = renderToStaticMarkup(
    React.createElement(VisitorDailyChart, { points: points.map((point) => ({ ...point, sessions: 0, forms: 0 })) }),
  );
  assert.equal(empty.includes("<polyline"), false);
  assert.match(empty, /Belum ada kunjungan/);
});

test("database lokal: batas WIB, jumlah grafik/peta, alias, kelas data, event berulang, dan pagination", async (t) => {
  require("dotenv").config({ path: path.join(__dirname, "../.env.local"), quiet: true });
  if (
    !process.env.DATABASE_URL ||
    !["localhost", "127.0.0.1", "::1"].includes(new URL(process.env.DATABASE_URL).hostname)
  )
    return t.skip("Database lokal tidak tersedia.");
  const pg = require("pg");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    const { drizzle } = require("drizzle-orm/node-postgres");
    // A transaction uses one connection; serialize the report's parallel reads on that connection.
    let pending = Promise.resolve();
    const transactionClient = {
      query: (...args) => {
        const result = pending.then(() => client.query(...args));
        pending = result.catch(() => {});
        return result;
      },
    };
    const database = drizzle(transactionClient);
    const service = load("src/features/analytics/report-service.ts", {
      "@/lib/database/client": { getDatabase: () => database },
    });
    const source = "__visitor-report-test__";
    const now = new Date("2026-10-01T17:30:00Z");
    const fixtures = [
      ["before", "public", "2026-09-25T16:59:59Z", "West Java", null],
      ["first", "public", "2026-09-25T17:00:00Z", "West Java", "valid"],
      ["today", "public", "2026-10-01T17:01:00Z", "Jawa Barat", "valid"],
      ["future", "public", "2026-10-01T17:31:00Z", "West Java", "valid"],
      ["demo", "demo", "2026-10-01T17:01:00Z", "West Java", "valid"],
      ["local", "internal", "2026-10-01T17:01:00Z", "West Java", "valid"],
    ];
    const ids = {};
    for (const [key, traffic, date, region, status] of fixtures) {
      const { rows } = await client.query(
        "insert into analytics_sessions (anonymous_id,session_key,traffic_class,created_at,consented_at,source_name,city_name,country_name,region_name,outcome,form_status,landing_path) values ('__visitor-test__',$1,$2,$3,$3,$4,'Bandung','Indonesia',$5,'Form terkirim',$6,'/') returning id",
        [source + key, traffic, date, source, region, status],
      );
      ids[key] = rows[0].id;
    }
    await client.query(
      "insert into analytics_events (session_id,name,path,sequence,occurred_at) values ($1,'cta_click','/',1,'2026-09-26T00:00:00Z'),($1,'cta_click','/',2,'2026-09-26T00:01:00Z')",
      [ids.first],
    );
    const testFilters = { ...filters, source };
    const report = await service.getAnalyticsReport(testFilters, {}, "public", now);
    assert.equal(report.totals.sessions, 2);
    assert.equal(report.totals.forms, 2);
    assert.equal(report.totals.ctaClicks, 1);
    assert.equal(report.trend.length, 7);
    assert.equal(report.trend[0].date, "2026-09-26");
    assert.equal(report.trend.at(-1).date, "2026-10-02");
    assert.equal(
      report.trend.reduce((sum, point) => sum + point.sessions, 0),
      report.totals.sessions,
    );
    assert.equal(
      report.trend.reduce((sum, point) => sum + point.forms, 0),
      report.totals.forms,
    );
    assert.equal(model.geographySummary(report.geography).total, report.totals.sessions);
    const alias = await service.getAnalyticsReport(
      { ...testFilters, country: "ID", region: "Jawa Barat" },
      {},
      "public",
      now,
    );
    assert.equal(alias.totals.sessions, 2);
    assert.equal(await service.getAnalyticsJourney(ids.demo, "public", testFilters, now), null);
    assert.equal(await service.getAnalyticsJourney(ids.future, "public", testFilters, now), null);
    assert.equal(
      await service.getAnalyticsJourney(ids.first, "public", { ...testFilters, city: "Jakarta" }, now),
      null,
    );
    assert.ok(await service.getAnalyticsJourney(ids.demo, "demo", testFilters, now));
    assert.equal((await service.getAnalyticsReport(testFilters, {}, "internal", now)).totals.sessions, 1);
    assert.equal(await service.getAnalyticsJourney(ids.local, "public", testFilters, now), null);
    const thirty = await service.getAnalyticsReport({ ...testFilters, days: 30 }, {}, "public", now);
    assert.equal(thirty.trend.length, 30);
    assert.equal(thirty.trend[0].date, "2026-09-03");
    assert.equal(thirty.totals.sessions, 3);
    await client.query(
      "insert into analytics_sessions (anonymous_id,session_key,traffic_class,created_at,consented_at,source_name,landing_path) select '__visitor-test__','__visitor-page-'||n,'public','2026-10-01T00:00:00Z'::timestamptz + n*interval '1 second','2026-10-01T00:00:00Z','__visitor-page__','/' from generate_series(1,29) n",
    );
    const pageFilters = { ...filters, source: "__visitor-page__" };
    const first = await service.getAnalyticsReport(pageFilters, {}, "public", now);
    assert.equal(first.totals.sessions, 29);
    assert.equal(first.journeys.length, 25);
    assert.equal(first.hasNext, true);
    assert.equal(model.geographySummary(first.geography).total, 29);
    const next = await service.getAnalyticsReport(
      pageFilters,
      { cursor: first.nextCursor, direction: "next" },
      "public",
      now,
    );
    assert.equal(next.journeys.length, 4);
    assert.equal(next.hasNext, false);
    assert.equal(new Set([...first.journeys, ...next.journeys].map((row) => row.id)).size, 29);
    const previous = await service.getAnalyticsReport(
      pageFilters,
      { cursor: next.previousCursor, direction: "previous" },
      "public",
      now,
    );
    assert.deepEqual(
      previous.journeys.map((row) => row.id),
      first.journeys.map((row) => row.id),
    );
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});
