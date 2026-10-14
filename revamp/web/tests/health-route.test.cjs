/* eslint-disable @typescript-eslint/no-require-imports -- Isolated route-handler module test. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function loadHealth(getDatabase) {
  const source = readFileSync(join(__dirname, "../src/app/api/health/route.ts"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const instance = { exports: {} };
  new Function("module", "exports", "require", compiled)(instance, instance.exports, (name) => {
    if (name === "drizzle-orm") return { sql: (strings) => strings.join("") };
    if (name === "@/lib/database/client") return { getDatabase };
    return require(name);
  });
  return instance.exports;
}

test("health route reports an unavailable database without details", async () => {
  const route = loadHealth(() => null);
  const response = await route.GET();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: "unavailable" });
  assert.match(response.headers.get("cache-control"), /no-store/);
});

test("health route only exposes a minimal healthy result", async () => {
  let queryCount = 0;
  const route = loadHealth(() => ({
    execute: async () => {
      queryCount += 1;
      return [];
    },
  }));
  const response = await route.GET();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", database: "ok" });
  assert.equal(queryCount, 4, "health must verify connectivity and the authentication schema");
});

test("health route returns no provider error when the query fails", async () => {
  const route = loadHealth(() => ({ execute: async () => Promise.reject(new Error("database password leaked")) }));
  const response = await route.GET();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: "unavailable", database: "unavailable" });
});

test("health route rejects a database with a missing authentication schema", async () => {
  let queryCount = 0;
  const route = loadHealth(() => ({
    execute: async () => {
      queryCount += 1;
      if (queryCount === 2) throw new Error('relation "auth_rate_limits" does not exist');
      return [];
    },
  }));
  const response = await route.GET();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: "unavailable", database: "unavailable" });
});
