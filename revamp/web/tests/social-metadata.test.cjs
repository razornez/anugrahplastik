/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const sharp = require("sharp");

const root = join(__dirname, "..");
const socialImage = join(root, "public", "brand", "anugrah-plastik-social-logo-v1.png");

test("metadata sosial memakai gambar logo resmi dengan ukuran Open Graph", async () => {
  const metadata = await sharp(socialImage).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 630);

  const metadataSource = readFileSync(join(root, "src", "features", "marketing", "site-metadata.ts"), "utf8");
  assert.match(metadataSource, /anugrah-plastik-social-logo-v1\.png/);
  assert.match(metadataSource, /summary_large_image/);
  assert.match(metadataSource, /Logo resmi Anugrah Plastik/);
});

test("ikon monogram AP lama tidak lagi menjadi fallback aplikasi", async () => {
  assert.equal(existsSync(join(root, "src", "app", "icon.tsx")), false);

  for (const [file, size] of [
    ["anugrah-plastik-icon-192.png", 192],
    ["anugrah-plastik-icon-512.png", 512],
    ["anugrah-plastik-apple-touch-icon.png", 180],
  ]) {
    const metadata = await sharp(join(root, "public", "brand", file)).metadata();
    assert.equal(metadata.format, "png");
    assert.equal(metadata.width, size);
    assert.equal(metadata.height, size);
  }
});
