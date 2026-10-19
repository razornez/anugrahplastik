/* eslint-disable @typescript-eslint/no-require-imports -- Isolated TypeScript modules are loaded without a build. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const { JSDOM } = require("jsdom");

const root = path.resolve(__dirname, "..");
function load(relative, cache = new Map()) {
  const absolute = path.resolve(root, relative);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const instance = { exports: {} };
  cache.set(absolute, instance);
  const compiled = ts.transpileModule(readFileSync(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const localRequire = (id) => {
    if (id.startsWith("@/")) return load(path.join("src", `${id.slice(2)}.ts`), cache);
    if (id.startsWith(".")) {
      const resolved = path.resolve(path.dirname(absolute), id);
      if (resolved.endsWith(".json")) return require(resolved);
      return load(path.relative(root, `${resolved}.ts`), cache);
    }
    return require(id);
  };
  new Function("module", "exports", "require", compiled)(instance, instance.exports, localRequire);
  return instance.exports;
}

test("first touch keeps paid click identifiers but strips referrer query and same-site referrals", () => {
  const { firstTouchEntry } = load("src/features/analytics/entry.ts");
  const page = new URL(
    "https://anugrahplastik.com/?utm_source=google&utm_medium=cpc&utm_campaign=parts&gclid=click-123#ap-contact",
  );
  const first = firstTouchEntry("session-1", page, "https://example.com/search?private=secret");
  assert.equal(first.referrer, "https://example.com/search");
  assert.equal(first.attribution.utm_campaign, "parts");
  assert.equal(first.attribution.gclid, "click-123");
  assert.equal(first.entryAnchor, "ap-contact");
  assert.equal(first.landingPath, "/");
  assert.equal(firstTouchEntry("session-1", new URL("https://anugrahplastik.com/other"), "", first), first);
  assert.equal(
    firstTouchEntry("session-2", new URL("https://anugrahplastik.com/"), "https://anugrahplastik.com/old").referrer,
    null,
  );
});

test("source distinguishes paid Google, organic, direct and external traffic", () => {
  const { trafficSource } = load("src/features/analytics/source.ts");
  assert.equal(trafficSource(null, { utm_source: "google", utm_medium: "cpc" }), "Google Ads");
  assert.equal(trafficSource(null, { gbraid: "opaque" }), "Google Ads");
  assert.equal(trafficSource("https://www.google.com/search"), "Google");
  assert.equal(trafficSource("https://anugrahplastik.com/"), "Langsung");
  assert.equal(trafficSource("https://referrer.example/path"), "referrer.example");
});

test("analytics batch validates first-touch data", () => {
  const { analyticsBatchSchema } = load("src/features/analytics/schema.ts");
  const batch = {
    anonymousId: "b21c4e43-cb6e-4d80-8a2d-4b9fd7539843",
    sessionKey: "8045f77a-c44d-45d6-aa61-a6451c61a913",
    consentVersion: "v1",
    events: [{ name: "page_view", path: "/" }],
    entry: {
      landingPath: "/",
      referrer: null,
      attribution: { utm_source: "google", gclid: "click-123" },
      landingVariant: "proof",
      entryAnchor: "ap-contact",
    },
  };
  assert.equal(analyticsBatchSchema.safeParse(batch).success, true);
  assert.equal(
    analyticsBatchSchema.safeParse({ ...batch, entry: { ...batch.entry, landingPath: "http://evil" } }).success,
    false,
  );
});

test("journey copy distinguishes automatic anchor from visitor scroll", () => {
  const { eventDetail } = load("src/features/analytics/display-labels.ts");
  assert.match(
    eventDetail({
      name: "scroll_depth",
      sectionKey: null,
      elementKey: null,
      metadata: { percent: 75, cause: "initial_anchor" },
    }),
    /75%.*bukan bukti membaca/,
  );
  assert.match(
    eventDetail({
      name: "scroll_depth",
      sectionKey: null,
      elementKey: null,
      metadata: { percent: 25, cause: "scroll" },
    }),
    /25%.*scroll halaman/,
  );
});

test("landing variants remain explicit and proof appears before the same form", () => {
  const { defaultLandingContent } = load("src/features/content/landing-content.ts");
  const { renderLandingTemplate } = load("src/features/marketing/template-source.ts");
  const control = new JSDOM(renderLandingTemplate(defaultLandingContent, "control")).window.document;
  const proof = new JSDOM(renderLandingTemplate(defaultLandingContent, "proof")).window.document;
  assert.equal(control.querySelector(".ap-contact-proof"), null);
  assert.ok(proof.querySelector(".ap-contact-proof"));
  assert.ok(proof.querySelector(".ap-contact-proof").compareDocumentPosition(proof.querySelector("#ap-form")) & 4);
  assert.ok(control.querySelector("[data-form-summary]"));
  assert.ok(control.querySelector("[data-form-whatsapp][hidden]"));
  assert.match(control.querySelector('#ap-form button[type="submit"]').textContent, /Simpan dan lanjut/);
});
