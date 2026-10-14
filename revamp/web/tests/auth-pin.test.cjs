/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const Module = require("node:module");
const { join } = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const filename = join(__dirname, "../src/lib/auth/security.ts");
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = module.paths;
loaded.require = (name) => {
  if (name === "server-only") return {};
  if (name === "@/lib/database/client") return { getDatabase: () => null };
  if (name === "@/lib/database/schema") return {};
  return require(name);
};
loaded._compile(
  ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText,
  filename,
);

test("username is normalized and restricted to the agreed format", () => {
  assert.equal(loaded.exports.normalizeUsername("  Sales.Bandung  "), "sales.bandung");
  assert.equal(loaded.exports.validUsername("sales.bandung"), true);
  assert.equal(loaded.exports.validUsername("ab"), false);
  assert.equal(loaded.exports.validUsername("sales..bandung"), false);
  assert.equal(loaded.exports.validUsername("sales_bdg"), false);
});

test("weak PIN only produces a warning", () => {
  assert.match(loaded.exports.weakPinReason("123456"), /mudah ditebak/);
  assert.match(loaded.exports.weakPinReason("111111"), /berulang/);
  assert.equal(loaded.exports.weakPinReason("593107"), null);
});

test("login uses PostgreSQL rate limits and a generic credential error", () => {
  const actions = readFileSync(join(__dirname, "../src/features/auth/actions.ts"), "utf8");
  const security = readFileSync(join(__dirname, "../src/lib/auth/security.ts"), "utf8");
  assert.match(actions, /loginRateStatus/);
  assert.match(actions, /recordFailedLogin/);
  assert.match(actions, /error=credentials/);
  assert.match(actions, /loginRateStatus[\s\S]{0,180}catch[\s\S]{0,160}redirectLoginDatabaseFailure/);
  assert.match(actions, /redirectLoginDatabaseFailure[\s\S]{0,180}error=database/);
  assert.doesNotMatch(actions, /error=user-not-found|error=wrong-pin/);
  assert.doesNotMatch(actions, /user\.lockedUntil/);
  assert.doesNotMatch(security, /update\(users\)[\s\S]{0,300}lockedUntil/);
  assert.match(security, /lockedUntil:[^\n]+::timestamptz/);
});

test("session lookup fails closed instead of exposing a database runtime error", () => {
  const session = readFileSync(join(__dirname, "../src/lib/auth/session.ts"), "utf8");
  assert.match(session, /Authentication must fail closed/);
  assert.match(session, /catch\s*\{[\s\S]{0,120}return null/);
});

test("local authenticated fixtures satisfy username and absolute session constraints", () => {
  const files = [
    "scripts/check-private-pdf.mjs",
    "scripts/test-finance-e2e.mjs",
    "scripts/test-sales-denials.mjs",
    "scripts/test-stb-partial-receipt.mjs",
    "scripts/test-stb-invalid-upload.mjs",
    "scripts/test-stb-page-smoke.mjs",
  ].map((entry) => readFileSync(join(__dirname, `../${entry}`), "utf8"));
  for (const source of files) {
    if (/insert into sessions/i.test(source)) assert.match(source, /absolute_expires_at/i);
  }
  assert.match(files[1], /insert into users \(username,/i);
  assert.match(files[2], /insert into users \(username,/i);
});

test("PIN reset revokes sessions and all outstanding recovery tokens", () => {
  const actions = readFileSync(join(__dirname, "../src/features/auth/actions.ts"), "utf8");
  assert.match(actions, /eq\(authTokens\.userId, record\.userId\)/);
  assert.match(actions, /eq\(sessions\.userId, record\.userId\)/);
  assert.match(actions, /revokeEverySession/);
});

test("administrator unlock clears account and combination rate limits", () => {
  const actions = readFileSync(join(__dirname, "../src/features/workspace/team-actions.ts"), "utf8");
  assert.match(actions, /delete\(authRateLimits\)/);
  assert.match(actions, /auth\.account_unlocked/);
});
