/* eslint-disable @typescript-eslint/no-require-imports -- The Node test runner loads a client component with mocked browser globals. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function fixture(t, initiallyAllowed = true) {
  const originalWindow = global.window;
  const originalDocument = global.document;
  t.after(() => {
    global.window = originalWindow;
    global.document = originalDocument;
  });

  const listeners = new Map();
  const storage = new Map();
  const scripts = [];
  let allowed = initiallyAllowed;
  global.window = {
    dataLayer: undefined,
    gtag: undefined,
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: (name) => listeners.delete(name),
  };
  global.document = {
    querySelector: (selector) => scripts.find((script) => selector.includes(script.dataset.googleAdsTag)) ?? null,
    createElement: () => ({
      dataset: {},
      async: false,
      src: "",
      remove() {
        scripts.splice(scripts.indexOf(this), 1);
      },
    }),
    head: { append: (script) => scripts.push(script) },
  };

  const source = readFileSync(join(__dirname, "../src/components/google-ads-conversion-tracker.tsx"), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const moduleForTest = { exports: {} };
  new Function("module", "exports", "require", compiled)(moduleForTest, moduleForTest.exports, (name) => {
    if (name === "react") return { useEffect: (effect) => effect() };
    if (name === "./analytics-consent") return { analyticsConsent: () => allowed };
    throw new Error(`Unexpected import: ${name}`);
  });
  return {
    Tracker: moduleForTest.exports.GoogleAdsConversionTracker,
    scripts,
    storage,
    dispatch: (name, detail) => listeners.get(name)?.({ detail }),
    allow: () => (allowed = true),
    commands: () => global.window.dataLayer ?? [],
    events: () =>
      global.window.dataLayer?.filter((entry) => entry[0] === "event").map((entry) => Array.from(entry)) ?? [],
  };
}

test("a saved lead sends one Google Ads event with a backend ID and no contact data", (t) => {
  const page = fixture(t);
  page.Tracker({ tagId: "AW-454861025", leadLabel: "jCaVCPLT8JkdEOHB8tgB" });
  assert.match(page.scripts[0].src, /googletagmanager\.com\/gtag\/js\?id=AW-454861025/);
  const id = "b21c4e43-cb6e-4d80-8a2d-4b9fd7539843";
  page.dispatch("ap:google-ads-lead", { conversionId: id });
  page.dispatch("ap:google-ads-lead", { conversionId: id });
  assert.deepEqual(
    page.commands().map((entry) => Object.prototype.toString.call(entry)),
    ["[object Arguments]", "[object Arguments]", "[object Arguments]"],
  );
  assert.deepEqual(page.events(), [
    [
      "event",
      "conversion",
      { send_to: "AW-454861025/jCaVCPLT8JkdEOHB8tgB", value: 1, currency: "IDR", transaction_id: id },
    ],
  ]);
  assert.equal(page.storage.get(`ap-google-ads-lead-${id}`), "1");
});

test("missing or malformed configuration never installs a tag or sends a conversion", (t) => {
  const page = fixture(t);
  page.Tracker({ tagId: "AW-placeholder", leadLabel: "test" });
  page.dispatch("ap:google-ads-lead", { conversionId: "saved-id" });
  assert.equal(page.scripts.length, 0);
  assert.equal(page.events().length, 0);
});

test("opt-out prevents tracking until the visitor enables analytics", (t) => {
  const page = fixture(t, false);
  page.Tracker({ tagId: "AW-454861025", leadLabel: "jCaVCPLT8JkdEOHB8tgB" });
  page.dispatch("ap:google-ads-lead", { conversionId: "saved-id" });
  assert.equal(page.scripts.length, 0);
  page.allow();
  page.dispatch("ap:analytics-preference");
  assert.equal(page.scripts.length, 1);
  page.dispatch("ap:google-ads-lead", { conversionId: "saved-id" });
  assert.equal(page.events().length, 1);
});

test("a failed tag download can retry queued conversions when the connection returns", (t) => {
  const page = fixture(t);
  page.Tracker({ tagId: "AW-454861025", leadLabel: "jCaVCPLT8JkdEOHB8tgB" });
  page.dispatch("ap:google-ads-lead", { conversionId: "saved-id" });
  assert.equal(page.events().length, 1);
  page.scripts[0].onerror();
  assert.equal(page.scripts.length, 0);
  page.dispatch("online");
  assert.equal(page.scripts.length, 1);
  assert.equal(page.events().length, 1);
});
