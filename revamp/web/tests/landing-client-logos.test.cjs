/* eslint-disable @typescript-eslint/no-require-imports -- Node's test runner loads isolated CommonJS modules. */
const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const { join } = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");
const ts = require("typescript");

const root = join(__dirname, "..");
const catalog = require("../scripts/release/client-logo-catalog.json");

function loadTypeScript(relativePath) {
  const path = join(root, relativePath);
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const instance = { exports: {} };
  new Function("module", "exports", "require", compiled)(instance, instance.exports, createRequire(path));
  return instance.exports;
}

test("DOCX client catalog has 38 unique deployable logos", () => {
  assert.equal(catalog.length, 38);
  assert.equal(new Set(catalog.map((item) => item.slug)).size, 38);
  assert.equal(
    catalog.some((item) => item.sourceImage === 31),
    false,
  );
  for (const item of catalog) {
    assert.match(item.name, /\S/);
    assert.equal(existsSync(join(root, "public/images-webp/clients", `${item.slug}.webp`)), true, item.slug);
  }
});

test("public trust marquee renders the editable logos without the example names", () => {
  const { defaultLandingContent, landingContentSchema } = loadTypeScript("src/features/content/landing-content.ts");
  const { renderLandingTemplate } = loadTypeScript("src/features/marketing/template-source.ts");
  assert.equal(landingContentSchema.safeParse(defaultLandingContent).success, true);
  const html = renderLandingTemplate(defaultLandingContent);
  const document = new JSDOM(html).window.document;
  const trust = document.querySelector("#ap-trust");
  assert.ok(trust);
  assert.equal(trust.querySelectorAll(".ap-mq").length, 3);
  assert.equal(trust.querySelectorAll(".ap-partner-track:not([aria-hidden]) img").length, 38);
  assert.equal(trust.querySelectorAll(".ap-partner-track[aria-hidden] img").length, 38);
  assert.equal(trust.querySelectorAll(".ap-client-logo img[alt^='Logo ']").length, 76);
  assert.equal(trust.textContent.includes("NUSANTARA TEKSTIL"), false);
  assert.equal(trust.textContent.includes("logo bersifat ilustratif"), false);
  assert.ok(trust.querySelector(".ap-marquee-toggle"));
});

test("release publisher preserves other landing fields and requires a matching version", () => {
  const source = readFileSync(join(root, "scripts/release/publish-client-logos.mjs"), "utf8");
  assert.match(source, /CLIENT_LOGO_RELEASE_CONFIRM/);
  assert.match(source, /CLIENT_LOGO_EXPECTED_VERSION/);
  assert.match(source, /for update/);
  assert.match(source, /trust: \{ \.\.\.content\.trust, partners \}/);
  assert.match(source, /content_revisions/);
});
