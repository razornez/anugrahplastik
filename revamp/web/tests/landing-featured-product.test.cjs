/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => readFile(path.join(root, file), "utf8");

test("featured portfolio product keeps the original landing card and visible fire badge", async () => {
  const [source, template, content, script, styles] = await Promise.all([
    read("src/features/marketing/template-source.ts"),
    read("src/features/marketing/template-light.html"),
    read("src/features/content/landing-content.ts"),
    read("scripts/reconcile-featured-product.mjs"),
    read("src/app/landing-template.css"),
  ]);
  assert.doesNotMatch(source, /replaceSection\(/);
  assert.doesNotMatch(source, /renderPortfolioSection/);
  assert.match(template, /ap-pcard__hot/);
  assert.match(template, /Produk unggulan/);
  assert.match(template, /Spacer for Underground Conduit/);
  assert.match(content, /isHot: typeof record\.isHot === "boolean" \? record\.isHot : false/);
  assert.match(script, /Spacer for Underground Conduit/);
  assert.match(script, /content\.featured_product_reconciled/);
  assert.match(styles, /\.ap-pcard__hot svg/);
});
