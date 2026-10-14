/* eslint-disable @typescript-eslint/no-require-imports -- Node's built-in test runner loads this isolated CommonJS regression test. */
const assert = require("node:assert/strict");
const { readdirSync, readFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const { join } = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const sourceRoot = join(__dirname, "../src");
const allowedTechnicalMatches = new Set([
  "features/content/landing-content.ts",
  "features/finance/finance-report.ts",
  "components/design-list-thumbnail.tsx",
  "components/transaction-email-composer.tsx",
  "features/integrations/email-template-actions.ts",
  "features/integrations/email-templates.ts",
]);

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|html)$/.test(entry.name) ? [path] : [];
  });
}

function loadTypeScript(relative) {
  const source = readFileSync(join(sourceRoot, relative), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const instance = { exports: {} };
  new Function("module", "exports", "require", compiled)(
    instance,
    instance.exports,
    createRequire(join(sourceRoot, relative)),
  );
  return instance.exports;
}

test("copy UI tidak memakai strip sebagai pemisah kalimat atau rentang", () => {
  const violations = [];
  for (const path of sourceFiles(sourceRoot)) {
    const relative = path.slice(sourceRoot.length + 1).replaceAll("\\", "/");
    if (allowedTechnicalMatches.has(relative)) continue;
    for (const [index, line] of readFileSync(path, "utf8").split(/\r?\n/).entries()) {
      if (/(?:—|–|\s--\s|&(?:mdash|ndash);|&#(?:8211|8212);)/.test(line)) violations.push(`${relative}:${index + 1}`);
    }
  }
  assert.deepEqual(violations, []);
});

test("editor landing menolak copy dengan strip pemisah tetapi menerima kalimat biasa", () => {
  const { defaultLandingContent, hasForbiddenLandingCopySeparator, humanizeLegacyLandingCopy, landingContentSchema } =
    loadTypeScript("features/content/landing-content.ts");
  assert.equal(landingContentSchema.safeParse(defaultLandingContent).success, true);
  assert.equal(
    hasForbiddenLandingCopySeparator({
      ...defaultLandingContent,
      hero: { ...defaultLandingContent.hero, description: "Kirim sample — kami bantu evaluasi." },
    }),
    true,
  );
  assert.equal(
    humanizeLegacyLandingCopy("Part sulit dicari—serta perlu dibuat ulang."),
    "Part sulit dicari. Kami juga perlu dibuat ulang.",
  );
});

test("landing publik memakai konten bawaan ketika database tidak tersedia", async () => {
  const { readPublicContentOrFallback } = loadTypeScript("features/content/public-content-fallback.ts");
  const fallback = { title: "Konten bawaan" };
  assert.deepEqual(
    await readPublicContentOrFallback(
      async () => {
        throw new Error("database offline");
      },
      fallback,
      "landing.page",
    ),
    fallback,
  );
  assert.deepEqual(await readPublicContentOrFallback(async () => ({ title: "Database" }), fallback, "landing.page"), {
    title: "Database",
  });
});
