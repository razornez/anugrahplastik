/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => readFile(path.join(root, file), "utf8");

test("editorial content keeps gallery items structured and constrained", async () => {
  const source = await read("src/features/content/landing-content.ts");
  assert.match(source, /galleryCategories: z\.array\(galleryCategorySchema\)\.max\(12\)/);
  assert.match(source, /products: z\.array\(shortText\)\.min\(1\)\.max\(6\)/);
  assert.match(source, /isPublished: z\.boolean\(\)/);
  assert.match(source, /imagePath/);
});

test("content updates are role protected, version checked, and auditable", async () => {
  const source = await read("src/features/content/admin-actions.ts");
  assert.match(source, /user\.role === "admin" \|\| user\.role === "content"/);
  assert.match(source, /expectedVersion !== \(existing\?\.version \?\? 0\)/);
  assert.match(source, /content\.restore/);
  assert.match(source, /updateTag\("landing\.page"\)/);
});

test("public renderer uses internal category detail routes and escapes editorial data", async () => {
  const source = await read("src/features/marketing/template-source.ts");
  assert.match(source, /\/kategori\/\$\{escapeHtml\(item\.slug\)\}/);
  assert.match(source, /galleryCategories\.filter/);
  assert.match(source, /escapeHtml\(item\.altText\)/);
});

test("content editor has one compact breakpoint that cannot create an implicit preview column", async () => {
  const styles = await read("src/app/admin/admin-design.css");
  assert.match(styles, /Content editor has exactly one responsive layout owner/);
  assert.match(styles, /@media \(max-width: 1279px\)[\s\S]*?\.admin-shell \.landing-editor \{\s*display: block;/);
  assert.match(
    styles,
    /@media \(max-width: 1279px\)[\s\S]*?\.admin-shell \.landing-editor \.landing-editor__preview \{[\s\S]*?grid-column: auto;/,
  );
  assert.match(
    styles,
    /\.admin-shell \.landing-editor \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) minmax\(330px, 0\.7fr\)/,
  );
});

test("cached admin routes cannot change the page canvas through a parent :has selector", async () => {
  const styles = await read("src/app/admin/admin-home.css");
  assert.doesNotMatch(styles, /\.admin-main:has\(/);
});

test("editor tabs and sidebar theme controls preserve keyboard and accessible names", async () => {
  const editor = await read("src/components/landing-content-editor.tsx");
  const themePicker = await read("src/components/admin-theme-picker.tsx");
  assert.match(editor, /event\.key === "ArrowRight"/);
  assert.match(editor, /event\.key === "Home"/);
  assert.match(editor, /role="tabpanel"/);
  assert.match(themePicker, /aria-label=\{themeMeta\[option\]\.label\}/);
  assert.match(themePicker, /<ThemeIcon theme=\{option\} \/>/);
});

test("admin editor dark mode keeps its chrome token-driven while the landing preview stays faithful", async () => {
  const styles = await read("src/app/admin/admin-design.css");
  assert.match(styles, /--admin-surface-elevated:/);
  assert.match(styles, /--admin-field:/);
  assert.match(styles, /--admin-success-surface:/);
  assert.match(styles, /--admin-warning-surface:/);
  assert.match(styles, /Content editor: one token-aware visual authority over the legacy globals/);
  assert.match(styles, /\.admin-shell \.landing-editor__fields \{[\s\S]*?background: var\(--admin-surface-soft\)/);
  assert.match(styles, /\.admin-shell \.landing-editor__preview \{[\s\S]*?background: var\(--admin-surface\)/);
  assert.match(styles, /mini landing intentionally stays light/);
  assert.match(styles, /\.admin-shell \.landing-mini \{[\s\S]*?background: #ffffff/);
  assert.match(styles, /Portal content does not inherit from \.admin-shell/);
});
