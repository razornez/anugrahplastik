/* eslint-disable @typescript-eslint/no-require-imports -- Isolated TypeScript modules and local database tests. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
function load(file, replacements = {}, cache = new Map()) {
  const absolute = path.resolve(__dirname, "..", file);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const code = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const fixture = { exports: {} };
  cache.set(absolute, fixture);
  const localRequire = (id) => {
    if (replacements[id]) return replacements[id];
    if (id.startsWith("@/") || id.startsWith(".")) {
      const resolved = id.startsWith("@/")
        ? path.resolve(__dirname, "../src", id.slice(2))
        : path.resolve(path.dirname(absolute), id);
      return load(path.relative(path.resolve(__dirname, ".."), `${resolved}.ts`), replacements, cache);
    }
    return require(id);
  };
  new Function("require", "module", "exports", code)(localRequire, fixture, fixture.exports);
  return fixture.exports;
}
const model = load("src/features/analytics/business-discovery-model.ts");
test("frasa dinormalisasi, area dibatasi, dan cache tujuh hari tidak diperpanjang oleh reload", () => {
  assert.equal(
    model.normalizeBusinessQuery("  PERUSAHAAN   manufaktur  ", "bandung").queryKey,
    "bandung:perusahaan manufaktur",
  );
  assert.throws(() => model.normalizeBusinessQuery("plastik", "wilayah-rekaan"));
  assert.throws(() => model.normalizeBusinessQuery("ab", "bandung"));
  const now = new Date("2026-10-02T00:00:00Z");
  assert.equal(model.businessCacheFresh(new Date(now - 7 * 86400000 + 1), now), true);
  assert.equal(model.businessCacheFresh(new Date(now - 7 * 86400000), now), false);
  assert.equal(model.businessCacheFresh(new Date(now.getTime() + 1), now), false);
});
test("hasil hanya metadata publik; identitas stabil dideduplikasi dan URL berbahaya ditolak", () => {
  const rows = model.parseBusinessResults(
    {
      search_metadata: { status: "Success" },
      local_results: [
        {
          title: "Pabrik contoh",
          place_id: "ChIJ_example123",
          website: "https://example.com",
          phone: "021123",
          email: "not-stored@example.com",
          rating: 5,
        },
        { title: "Pabrik duplikat", place_id: "ChIJ_example123" },
        { title: "Tanpa identitas", website: "javascript:alert(1)" },
        { title: "CID", data_cid: "12345678" },
        {},
        null,
      ],
    },
    "Bandung",
  );
  assert.equal(rows.length, 3);
  assert.equal(rows[1].stableId, null);
  assert.equal(rows[1].website, null);
  assert.equal(rows[2].stableId, "cid:12345678");
  assert.equal("rating" in rows[0], false);
  assert.equal("email" in rows[0], false);
  assert.match(rows[0].mapsUrl, /query_place_id=ChIJ_example123/);
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,abc",
    "https://127.0.0.1",
    "http://0x7f000001",
    "https://user:secret@example.com",
    "http://localhost",
    "https://[::1]",
  ])
    assert.equal(model.safeBusinessWebsite(url), null);
  assert.deepEqual(model.parseBusinessResults({ local_results: [] }, "Bandung"), []);
  assert.throws(
    () => model.parseBusinessResults({ error: "api_key=SECRET_TEST" }, "Bandung"),
    (error) => !error.message.includes("SECRET_TEST"),
  );
  assert.throws(() => model.parseBusinessResults({ local_results: {} }, "Bandung"));
});
test("empat permintaan berbagi batas 40 dan tidak memakai cadangan SEO/tren", () => {
  assert.equal(model.businessBudget(0, 0, 30).available, 4);
  assert.equal(model.businessBudget(8, 1, 30).available, 2);
  assert.equal(model.businessBudget(40, 0, 0).available, 0);
  assert.equal(model.businessBudget(10, 4, 0).available, 0);
  assert.equal(model.businessBudget(10, 3, 29).available, 1);
});
test("filter hasil berjalan lokal tanpa mencampur area atau status", () => {
  const rows = [
    { name: "Pabrik A", category: "Manufaktur", address: "Bandung", areas: ["bandung"], status: "new" },
    { name: "Pabrik B", areas: ["bekasi"], status: "relevant" },
  ];
  assert.equal(model.filterBusinessCandidates(rows, "bandung", "new", "MANUFAKTUR").length, 1);
  assert.equal(model.filterBusinessCandidates(rows, "bekasi", "new", "").length, 0);
});
test("aksi server menolak role konten, pencarian sales, dan penambahan tanpa konfirmasi", async () => {
  let role = "content";
  let calls = 0;
  const actions = load("src/features/analytics/business-discovery-actions.ts", {
    "@/lib/auth/session": { getSession: async () => ({ role, id: "test" }) },
    "next/cache": { revalidatePath() {} },
    "./business-discovery-service": {
      runBusinessSearch: async () => {
        calls++;
      },
      addBusinessProspect: async () => {
        calls++;
      },
      reviewBusinessCandidate: async () => {
        calls++;
      },
    },
  });
  const form = new FormData();
  form.set("operation", "search");
  form.set("confirmed", "yes");
  assert.match((await actions.businessDiscoveryAction({}, form)).message, /admin\/sales/);
  role = "sales";
  assert.match((await actions.businessDiscoveryAction({}, form)).message, /administrator/);
  form.set("operation", "add");
  form.delete("confirmed");
  assert.match((await actions.businessDiscoveryAction({}, form)).message, /konfirmasi/);
  assert.equal(calls, 0);
});
test("Postgres lokal: konkurensi kuota, cache, deduplikasi, riwayat, penugasan dan penambahan ganda", async (t) => {
  require("dotenv").config({ path: path.join(__dirname, "../.env.local"), quiet: true });
  if (
    !process.env.DATABASE_URL ||
    !["127.0.0.1", "localhost", "::1"].includes(new URL(process.env.DATABASE_URL).hostname)
  )
    return t.skip("Hanya database lokal.");
  const { Pool } = require("pg");
  const { randomUUID } = require("node:crypto");
  const { drizzle } = require("drizzle-orm/node-postgres");
  const schema = `business_test_${randomUUID().replaceAll("-", "")}`;
  assert.match(schema, /^business_test_[a-f0-9]{32}$/);
  const setup = new Pool({ connectionString: process.env.DATABASE_URL });
  let pool;
  try {
    await setup.query(`CREATE SCHEMA "${schema}"`);
    for (const table of [
      "users",
      "leads",
      "audit_logs",
      "growth_serp_usage",
      "growth_market_signals",
      "growth_seo_audits",
      "growth_business_searches",
      "growth_business_candidates",
      "growth_business_matches",
    ])
      await setup.query(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
    pool = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
    const database = drizzle(pool);
    const service = load("src/features/analytics/business-discovery-service.ts", {
      "@/lib/database/client": { getDatabase: () => database },
    });
    const actor = randomUUID();
    const content = randomUUID();
    await pool.query(
      "INSERT INTO users (id,username,name,email,password_hash,role,is_active) VALUES ($1,'test.admin','Test admin','admin@example.invalid','not-a-login','admin',true),($2,'test.content','Test content','content@example.invalid','not-a-login','content',true)",
      [actor, content],
    );
    const now = new Date("2026-10-02T00:00:00Z");
    const claims = await Promise.all(
      Array.from({ length: 5 }, () => service.claimBusinessSearch("perusahaan manufaktur", "bandung", actor, now)),
    );
    assert.equal(claims.filter((row) => row.status === "claimed").length, 1);
    assert.equal(claims.filter((row) => row.status === "running").length, 4);
    const claim = claims.find((row) => row.status === "claimed");
    const items = model.parseBusinessResults(
      {
        local_results: [
          {
            title: "TEST ONLY perusahaan",
            place_id: "ChIJ_test_place_123",
            type: "Manufaktur",
            website: "https://example.com",
          },
          { title: "TEST ONLY identitas kosong" },
        ],
      },
      "Bandung",
    );
    await service.saveBusinessResults(claim.id, items, actor, now);
    assert.equal((await service.claimBusinessSearch("PERUSAHAAN manufaktur", "bandung", actor, now)).status, "cached");
    const [stable] = (await pool.query("SELECT * FROM growth_business_candidates WHERE stable_id IS NOT NULL")).rows;
    const [unstable] = (await pool.query("SELECT * FROM growth_business_candidates WHERE stable_id IS NULL")).rows;
    await assert.rejects(service.addBusinessProspect(unstable.id, actor, actor), /stabil/);
    await assert.rejects(service.addBusinessProspect(stable.id, content, actor), /admin\/sales/);
    const ids = await Promise.all([
      service.addBusinessProspect(stable.id, actor, actor),
      service.addBusinessProspect(stable.id, actor, actor),
    ]);
    assert.equal(ids[0], ids[1]);
    const [lead] = (await pool.query("SELECT * FROM leads")).rows;
    assert.equal(lead.source, model.businessSource);
    assert.equal(lead.assigned_user_id, actor);
    assert.equal(lead.email, null);
    assert.match(lead.message, /belum menghubungi/);
    const second = await service.claimBusinessSearch("pabrik", "bekasi", actor, now);
    await service.saveBusinessResults(second.id, [{ ...items[0], name: "TEST ONLY nama diperbarui" }], actor, now);
    assert.equal(
      (await pool.query("SELECT count(*)::int total FROM growth_business_candidates WHERE stable_id IS NOT NULL"))
        .rows[0].total,
      1,
    );
    assert.equal(
      (await pool.query("SELECT status FROM growth_business_candidates WHERE id=$1", [stable.id])).rows[0].status,
      "relevant",
    );
    assert.equal(
      (
        await pool.query(
          "SELECT snapshot->>'name' name FROM growth_business_matches WHERE search_id=$1 AND candidate_id=$2",
          [claim.id, stable.id],
        )
      ).rows[0].name,
      items[0].name,
    );
    const board = await service.getBusinessBoard(now);
    assert.equal(board.available, true);
    assert.deepEqual(
      new Set(board.candidates.find((row) => row.id === stable.id).areas),
      new Set(["bandung", "bekasi"]),
    );
    const next = await Promise.allSettled(
      ["cimahi", "jakarta", "depok"].map((city) => service.claimBusinessSearch("pabrik", city, actor, now)),
    );
    assert.equal(next.filter((row) => row.status === "fulfilled").length, 2);
    assert.equal(next.filter((row) => row.status === "rejected").length, 1);
    assert.equal((await pool.query("SELECT used FROM growth_serp_usage WHERE month_key='2026-10'")).rows[0].used, 4);
    const originalFetch = global.fetch;
    const originalKey = process.env.SERPAPI_API_KEY;
    const originalLimit = (await pool.query("SELECT used FROM growth_serp_usage WHERE month_key='2026-10'")).rows[0]
      .used;
    try {
      // Only the isolated test schema is adjusted; no real request or provider credit is used.
      await pool.query("UPDATE growth_business_searches SET month_key='2020-01' WHERE status='running'");
      await pool.query("UPDATE growth_serp_usage SET used=2 WHERE month_key='2026-10'");
      process.env.SERPAPI_API_KEY = "TEST_ONLY_KEY";
      let requests = 0;
      global.fetch = async (url) => {
        requests++;
        assert.equal(url.hostname, "serpapi.com");
        assert.equal(url.searchParams.get("engine"), "google_maps");
        assert.equal(url.searchParams.has("start"), false);
        assert.equal(url.searchParams.has("next_page_token"), false);
        return new Response(JSON.stringify({ error: "TEST_ONLY_KEY source diagnostic" }));
      };
      const message = await service.runBusinessSearch("uji kegagalan", "bogor", actor, now);
      assert.equal(requests, 1);
      assert.match(message, /belum berhasil/);
      assert.equal(message.includes("TEST_ONLY_KEY"), false);
      assert.equal(
        (await pool.query("SELECT count(*)::int total FROM growth_business_candidates WHERE stable_id IS NOT NULL"))
          .rows[0].total,
        1,
      );
      const [failed] = (await pool.query("SELECT error FROM growth_business_searches WHERE phrase='uji kegagalan'"))
        .rows;
      assert.equal(failed.error.includes("TEST_ONLY_KEY"), false);
      assert.equal((await pool.query("SELECT used FROM growth_serp_usage WHERE month_key='2026-10'")).rows[0].used, 3);
      global.fetch = async () => {
        requests++;
        throw new Error("Never request while cache is fresh");
      };
      await service.runBusinessSearch("perusahaan manufaktur", "bandung", actor, now);
      assert.equal(requests, 1);
    } finally {
      global.fetch = originalFetch;
      if (originalKey === undefined) delete process.env.SERPAPI_API_KEY;
      else process.env.SERPAPI_API_KEY = originalKey;
      await pool.query("UPDATE growth_serp_usage SET used=$1 WHERE month_key='2026-10'", [originalLimit]);
    }
    // A fresh month still cannot spend the reserve when the shared 40-search cap is exhausted.
    await pool.query("INSERT INTO growth_serp_usage (month_key,used) VALUES ('2026-11',40)");
    await assert.rejects(
      service.claimBusinessSearch("pabrik", "bogor", actor, new Date("2026-11-01T00:00:00Z")),
      /Jatah/,
    );
  } finally {
    if (pool) await pool.end();
    // The exact generated schema belongs solely to this test; no application rows are deleted.
    await setup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await setup.end();
  }
});
