import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import pg from "pg";
import sharp from "sharp";

if (!process.env.DATABASE_URL) {
  const { default: dotenv } = await import("dotenv");
  dotenv.config({ path: ".env.local", quiet: true });
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL belum tersedia.");
const host = new URL(databaseUrl).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host) && process.env.ALLOW_PRODUCTION_LEGACY_PORTFOLIO_IMPORT !== "yes")
  throw new Error(
    "Impor portfolio hanya boleh dijalankan pada database lokal. Gunakan rilis terverifikasi untuk produksi.",
  );

const root = resolve(import.meta.dirname, "../../..");
const sourceDirectory = process.env.LEGACY_PORTFOLIO_SOURCE_DIR
  ? resolve(process.env.LEGACY_PORTFOLIO_SOURCE_DIR)
  : join(root, "img", "portfolio");
const storageRoot = process.env.PRIVATE_STORAGE_PATH
  ? isAbsolute(process.env.PRIVATE_STORAGE_PATH)
    ? process.env.PRIVATE_STORAGE_PATH
    : resolve(process.cwd(), process.env.PRIVATE_STORAGE_PATH)
  : join(process.cwd(), "storage", "private");
const mediaQuota = 500 * 1024 * 1024;
const key = "landing.page";

const details = {
  "Clip shopping bag.jpg": [
    "Clip tas belanja",
    "produk",
    "Komponen plastik custom untuk kebutuhan produk.",
    "Clip plastik untuk tas belanja",
  ],
  "Difuser gelembung udara tambak udang atau ikan.jpg": [
    "Difuser gelembung udara",
    "produk",
    "Contoh komponen plastik untuk kebutuhan peralatan budidaya.",
    "Komponen plastik difuser gelembung udara",
  ],
  "Dudukan manekin.jpg": [
    "Dudukan manekin",
    "produk",
    "Contoh komponen plastik custom sesuai bentuk kebutuhan produk.",
    "Dudukan manekin dari plastik",
  ],
  "gear.jpg": [
    "Gear plastik",
    "sparepart",
    "Contoh gear plastik untuk kebutuhan sparepart.",
    "Gear plastik untuk sparepart",
  ],
  "Inner tutup btol dan kupling rotex merah.jpg": [
    "Inner tutup botol dan coupling",
    "sparepart",
    "Komponen plastik untuk kebutuhan penutup dan coupling.",
    "Inner tutup botol dan coupling plastik",
  ],
  "komponen alat produksi.jpg": [
    "Komponen alat produksi",
    "mesin",
    "Contoh komponen plastik untuk kebutuhan alat produksi.",
    "Komponen plastik pada alat produksi",
  ],
  "Plastik hidroponic.jpg": [
    "Komponen hidroponik",
    "produk",
    "Contoh komponen plastik untuk kebutuhan sistem hidroponik.",
    "Komponen plastik hidroponik",
  ],
  "Puzzel.jpg": [
    "Komponen puzzle",
    "produk",
    "Contoh hasil produksi komponen plastik custom.",
    "Komponen puzzle plastik",
  ],
  "Pvc tutup btol.jpg": [
    "Tutup botol PVC",
    "produk",
    "Contoh tutup plastik untuk kebutuhan kemasan.",
    "Tutup botol plastik PVC",
  ],
  "Tutup jerigan.jpg": [
    "Tutup jerigen",
    "produk",
    "Contoh tutup plastik untuk kebutuhan wadah atau kemasan.",
    "Tutup jerigen plastik",
  ],
  "Tutup mamalemo dan gir.jpg": [
    "Tutup dan gear plastik",
    "sparepart",
    "Contoh komponen penutup dan gear plastik.",
    "Tutup dan gear plastik",
  ],
  "tutup produk.jpg": [
    "Tutup produk plastik",
    "produk",
    "Contoh komponen tutup plastik custom.",
    "Komponen tutup plastik",
  ],
};

function idFor(filename) {
  const digest = createHash("sha1").update(`anugrahplastik-legacy:${filename}`).digest("hex");
  return `legacy-${digest.slice(0, 12)}`;
}
function mediaIdFor(filename) {
  const digest = createHash("sha256").update(`anugrahplastik-media:${filename}`).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}
function fileDetails(filename) {
  if (details[filename]) return details[filename];
  const normalized = basename(filename)
    .replace(/\.(jpe?g|webp)$/i, "")
    .replace(/[~_]+/g, " ")
    .replace(/\bprod\s*2[a-z]?\b/gi, "produk")
    .trim();
  if (/surya/i.test(filename))
    return [
      "Dokumentasi proyek Surya Pro",
      "klien",
      "Dokumentasi hasil produksi untuk kebutuhan klien.",
      "Dokumentasi produk plastik proyek Surya Pro",
    ];
  if (/respirator/i.test(filename))
    return [
      "Komponen respirator",
      "produk",
      "Contoh komponen plastik custom untuk kebutuhan produk.",
      "Komponen plastik respirator",
    ];
  if (/2018|263e|558f/i.test(filename))
    return [
      "Dokumentasi produk plastik",
      "produk",
      "Contoh hasil produksi plastik custom.",
      "Dokumentasi hasil produksi plastik custom",
    ];
  return [
    normalized || "Produk plastik custom",
    "produk",
    "Contoh hasil produksi plastik custom.",
    "Contoh produk plastik custom",
  ];
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function sourceFiles() {
  return import("node:fs/promises")
    .then(({ readdir }) => readdir(sourceDirectory, { withFileTypes: true }))
    .then((entries) =>
      entries
        .filter((entry) => entry.isFile() && !entry.name.toLowerCase().endsWith(".zip"))
        .map((entry) => entry.name)
        .sort(),
    );
}
async function optimize(filename) {
  const input = await readFile(join(sourceDirectory, filename));
  const source = sharp(input, { limitInputPixels: 24_000_000, animated: false, failOn: "error" });
  const metadata = await source.metadata();
  if (!metadata.width || !metadata.height || !["jpeg", "png", "webp"].includes(metadata.format ?? ""))
    throw new Error(`Gambar tidak valid: ${filename}`);
  const full = await sharp(input)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();
  const small = await sharp(input)
    .rotate()
    .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 78, effort: 4 })
    .toBuffer();
  const info = await sharp(full).metadata();
  return { full, small, width: info.width, height: info.height };
}
function mergePortfolio(value, legacyItems) {
  const content = object(value);
  const portfolio = object(content.portfolio);
  const current = Array.isArray(portfolio.items) ? portfolio.items : [];
  const existing = new Map(current.filter((item) => item && typeof item === "object").map((item) => [item.id, item]));
  for (const item of legacyItems) if (!existing.has(item.id)) existing.set(item.id, item);
  const spacer = existing.get("spacer-underground-conduit");
  if (spacer && typeof spacer === "object")
    existing.set("spacer-underground-conduit", { ...spacer, category: "produk", isHot: true, isPublished: true });
  for (const [id, item] of existing)
    if (id !== "spacer-underground-conduit") existing.set(id, { ...item, isHot: false });
  const items = [...existing.values()].sort((a, b) =>
    a.id === "spacer-underground-conduit" ? -1 : b.id === "spacer-underground-conduit" ? 1 : 0,
  );
  if (items.length > 60) throw new Error(`Portfolio berisi ${items.length} item, melampaui batas aman 60.`);
  return { ...content, portfolio: { ...portfolio, items } };
}

const client = new pg.Client({ connectionString: databaseUrl });
try {
  const files = await sourceFiles();
  if (files.length !== 43) throw new Error(`Inventaris berubah: diharapkan 43 gambar, ditemukan ${files.length}.`);
  await client.connect();
  await client.query("begin");
  const { rows } = await client.query("select * from content_blocks where key = $1 for update", [key]);
  const block = rows[0];
  if (!block) throw new Error("Konten landing belum tersedia.");
  const { rows: usageRows } = await client.query(
    "select coalesce(sum(byte_size + coalesce(preview_byte_size, 0)), 0) as used from media_assets where scope = 'landing'",
  );
  let used = Number(usageRows[0].used);
  const legacyItems = [];
  for (const filename of files) {
    const [title, category, caption, altText] = fileDetails(filename);
    const assetId = mediaIdFor(filename);
    const item = {
      id: idFor(filename),
      title,
      category,
      caption,
      imagePath: `/api/media/${assetId}`,
      altText,
      isPublished: true,
      isHot: false,
    };
    // The first legacy source was previously repurposed as the primary Spacer
    // card. Retain its media asset for recovery, but avoid a second public card.
    if (filename !== "2018-02-27-PHOTO-00000017.jpg") legacyItems.push(item);
    const { rows: existingRows } = await client.query("select id from media_assets where id = $1", [assetId]);
    if (existingRows[0]) continue;
    const image = await optimize(filename);
    if (used + image.full.length + image.small.length > mediaQuota)
      throw new Error("Kuota media landing 500 MB tidak mencukupi.");
    const storagePath = join("landing-media", `${assetId}.webp`);
    const previewPath = join("landing-media", `${assetId}.small.webp`);
    await mkdir(dirname(join(storageRoot, storagePath)), { recursive: true });
    await writeFile(join(storageRoot, storagePath), image.full, { flag: "wx", mode: 0o600 });
    await writeFile(join(storageRoot, previewPath), image.small, { flag: "wx", mode: 0o600 });
    await client.query(
      "insert into media_assets (id, path, storage_path, preview_path, alt_text, caption, mime_type, byte_size, preview_byte_size, sha256, width, height, scope, status, sort_order) values ($1,$2,$3,$4,$5,$6,'image/webp',$7,$8,$9,$10,$11,'landing','published',$12)",
      [
        assetId,
        `/api/media/${assetId}`,
        storagePath,
        previewPath,
        altText,
        caption,
        image.full.length,
        image.small.length,
        createHash("sha256").update(image.full).digest("hex"),
        image.width,
        image.height,
        legacyItems.length,
      ],
    );
    used += image.full.length + image.small.length;
  }
  const published = mergePortfolio(block.published_content ?? block.content, legacyItems);
  const draft = mergePortfolio(block.draft_content ?? block.published_content ?? block.content, legacyItems);
  const content = mergePortfolio(block.content, legacyItems);
  const version = Number(block.version) + 1;
  const now = new Date();
  await client.query(
    "update content_blocks set content=$1, draft_content=$2, published_content=$3, status='published', version=$4, published_at=$5, updated_at=$5 where id=$6 and version=$7",
    [content, draft, published, version, now, block.id, block.version],
  );
  await client.query(
    "insert into content_revisions (content_block_id, content, version, action) values ($1,$2,$3,'publish')",
    [block.id, published, version],
  );
  await client.query("insert into audit_logs (action, entity_type, entity_id, metadata) values ($1,$2,$3,$4)", [
    "content.legacy_portfolio_imported",
    "content_block",
    block.id,
    { key, version, sourceImages: files.length, portfolioItems: published.portfolio.items.length },
  ]);
  await client.query("commit");
  process.stdout.write(
    `Imported ${files.length} legacy images. Portfolio now has ${published.portfolio.items.length} cards.\n`,
  );
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
