import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import dotenv from "dotenv";
import pg from "pg";
import sharp from "sharp";

dotenv.config({ path: ".env.local", quiet: true });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL lokal belum tersedia.");
if (!["localhost", "127.0.0.1", "::1"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("Rekonsiliasi aset landing hanya boleh dijalankan pada database lokal.");
}

const key = "landing.page";
const mediaQuota = 500 * 1024 * 1024;
const spacerSource =
  process.env.SPACER_DOCUMENTATION_SOURCE ??
  "C:\\Users\\iwan kurniawan\\Downloads\\WhatsApp Image 2026-09-28 at 09.31.21.jpeg";
const storageRoot = process.env.PRIVATE_STORAGE_PATH
  ? isAbsolute(process.env.PRIVATE_STORAGE_PATH)
    ? process.env.PRIVATE_STORAGE_PATH
    : resolve(process.cwd(), process.env.PRIVATE_STORAGE_PATH)
  : join(process.cwd(), "storage", "private");

const materials = [
  [
    "HD",
    "High Density",
    "Kaku untuk wadah dan komponen.",
    "/images-webp/materials/hdpe.webp",
    "Butiran dan wadah plastik HD",
  ],
  [
    "LD",
    "Low Density",
    "Lentur untuk kemasan dan pelapis.",
    "/images-webp/materials/ldpe.webp",
    "Lembaran plastik LD fleksibel",
  ],
  [
    "PVC",
    "Polyvinyl",
    "Pilihan untuk kebutuhan pipa dan fitting.",
    "/images-webp/materials/pvc.webp",
    "Sambungan pipa PVC biru",
  ],
  [
    "PP",
    "Polypropylene",
    "Serbaguna untuk wadah dan komponen.",
    "/images-webp/materials/pp.webp",
    "Wadah plastik polypropylene",
  ],
  [
    "Nilon",
    "Tahan gesek",
    "Untuk gear dan komponen bergerak.",
    "/images-webp/materials/nylon.webp",
    "Roda gigi nilon krem",
  ],
  [
    "PS",
    "Polystyrene",
    "Ringan untuk kebutuhan tertentu.",
    "/images-webp/materials/polystyrene.webp",
    "Wadah pelindung polystyrene putih",
  ],
  [
    "Acrylic",
    "Transparan",
    "Untuk bagian yang perlu terlihat jelas.",
    "/images-webp/materials/acrylic.webp",
    "Lembaran acrylic transparan",
  ],
  [
    "Spon",
    "Foam",
    "Empuk untuk pelindung dan bantalan.",
    "/images-webp/materials/foam.webp",
    "Busa kuning sebagai material spon",
  ],
  [
    "Karet",
    "Bakelit",
    "Untuk komponen sesuai kebutuhan proyek.",
    "/images-webp/materials/rubber-bakelite.webp",
    "Cincin karet dan komponen bakelit hitam",
  ],
  [
    "ABS",
    "Tahan benturan",
    "Untuk komponen yang perlu dievaluasi sesuai fungsi.",
    "/images-webp/materials/abs.webp",
    "Butiran ABS dan komponen plastik hitam",
  ],
  [
    "POM",
    "Acetal",
    "Untuk komponen presisi yang dievaluasi sesuai kebutuhan.",
    "/images-webp/materials/pom.webp",
    "Butiran POM dan komponen presisi",
  ],
  [
    "TPU",
    "Elastis",
    "Untuk komponen fleksibel yang dibahas sesuai proyek.",
    "/images-webp/materials/tpu.webp",
    "Material TPU dan komponen fleksibel",
  ],
].map(([code, name, description, imagePath, altText]) => ({ code, name, description, imagePath, altText }));

const featuredSpacer = {
  id: "spacer-underground-conduit",
  title: "Spacer for Underground Conduit",
  category: "produk",
  caption:
    "Spacer plastik custom untuk menjaga jarak dan posisi underground conduit agar jalur kabel tetap rapi saat instalasi.",
  imagePath: "/images-webp/products/frame-grid-hitam.webp",
  altText: "Spacer plastik hitam untuk underground conduit",
  isPublished: true,
  isHot: true,
};

const restoredPortfolio = [
  [
    "wadah-emboss-logo",
    "Wadah emboss logo",
    "produk",
    "Wadah plastik dengan emboss logo untuk produksi massal.",
    "/images-webp/products/wadah-cup-abu.webp",
    "Wadah cup plastik abu-abu dengan emboss logo",
  ],
  [
    "ring-tutup-pp",
    "Ring tutup PP kuning",
    "produk",
    "Tutup atau ring plastik PP warna kuning untuk produksi massal presisi.",
    "/images-webp/products/tutup-botol-kuning.webp",
    "Tutup botol plastik PP warna kuning",
  ],
  [
    "tabung-pp",
    "Tabung PP transparan",
    "produk",
    "Tabung plastik PP transparan.",
    "/images-webp/products/tabung-vial.webp",
    "Tabung vial plastik PP transparan",
  ],
  [
    "handle-tosca",
    "Handle tosca custom",
    "produk",
    "Komponen plastik tosca custom untuk kebutuhan produk.",
    "/images-webp/products/handle-tosca.webp",
    "Komponen plastik biru tosca custom",
  ],
  [
    "flange-ring",
    "Flange ring sparepart",
    "sparepart",
    "Flange ring plastik hitam untuk komponen mesin.",
    "/images-webp/products/flange-ring-hitam.webp",
    "Flange ring plastik hitam",
  ],
  [
    "gear-nilon",
    "Gear nilon",
    "sparepart",
    "Gear nilon untuk komponen mesin.",
    "/images-webp/portfolio/gear.webp",
    "Gear nilon untuk sparepart",
  ],
  [
    "komponen-presisi",
    "Komponen presisi bening",
    "sparepart",
    "Komponen plastik presisi untuk kebutuhan produk.",
    "/images-webp/products/penahan-bening.webp",
    "Komponen plastik presisi bening",
  ],
].map(([id, title, category, caption, imagePath, altText]) => ({
  id,
  title,
  category,
  caption,
  imagePath,
  altText,
  isPublished: true,
  isHot: false,
}));

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function mediaIdFor(value) {
  const digest = createHash("sha256").update(`anugrahplastik-media:${value}`).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}
async function prepareSpacerMedia(client) {
  const id = mediaIdFor("spacer-underground-conduit-documentation-2026-09-28");
  const existing = await client.query("select id from media_assets where id=$1", [id]);
  if (existing.rows[0]) return id;

  const input = await readFile(spacerSource);
  const source = sharp(input, { limitInputPixels: 24_000_000, animated: false, failOn: "error" });
  const metadata = await source.metadata();
  if (!metadata.width || !metadata.height || !["jpeg", "png", "webp"].includes(metadata.format ?? "")) {
    throw new Error("Foto dokumentasi Spacer bukan JPEG, PNG, atau WebP yang valid.");
  }
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
  const usedResult = await client.query(
    "select coalesce(sum(byte_size + coalesce(preview_byte_size, 0)), 0) as used from media_assets where scope='landing'",
  );
  if (Number(usedResult.rows[0].used) + full.length + small.length > mediaQuota)
    throw new Error("Kuota media landing 500 MB tidak mencukupi.");
  const storagePath = join("landing-media", `${id}.webp`);
  const previewPath = join("landing-media", `${id}.small.webp`);
  await mkdir(dirname(join(storageRoot, storagePath)), { recursive: true });
  await writeFile(join(storageRoot, storagePath), full, { flag: "wx", mode: 0o600 });
  await writeFile(join(storageRoot, previewPath), small, { flag: "wx", mode: 0o600 });
  const optimized = await sharp(full).metadata();
  await client.query(
    "insert into media_assets (id,path,storage_path,preview_path,alt_text,caption,mime_type,byte_size,preview_byte_size,sha256,width,height,scope,status,sort_order) values ($1,$2,$3,$4,$5,$6,'image/webp',$7,$8,$9,$10,$11,'landing','published',$12)",
    [
      id,
      `/api/media/${id}`,
      storagePath,
      previewPath,
      "Dokumentasi spacer plastik custom untuk underground conduit",
      "Dokumentasi Spacer for Underground Conduit",
      full.length,
      small.length,
      createHash("sha256").update(full).digest("hex"),
      optimized.width,
      optimized.height,
      2,
    ],
  );
  return id;
}
function reconcile(value, spacerImagePath) {
  const content = asObject(value);
  const portfolio = asObject(content.portfolio);
  const material = asObject(content.material);
  const byId = new Map(
    (Array.isArray(portfolio.items) ? portfolio.items : [])
      .filter((item) => item && typeof item === "object")
      .map((item) => [item.id, item]),
  );
  byId.set(featuredSpacer.id, { ...byId.get(featuredSpacer.id), ...featuredSpacer });
  for (const item of restoredPortfolio) if (!byId.has(item.id)) byId.set(item.id, item);
  const secondSpacer = {
    id: "spacer-underground-conduit-dokumentasi",
    title: "Spacer for Underground Conduit, Dokumentasi Produk",
    category: "produk",
    caption: "Dokumentasi spacer plastik custom untuk menjaga jarak dan posisi underground conduit saat instalasi.",
    imagePath: spacerImagePath,
    altText: "Dokumentasi spacer plastik custom untuk underground conduit",
    isPublished: true,
    isHot: true,
  };
  byId.set(secondSpacer.id, { ...byId.get(secondSpacer.id), ...secondSpacer });
  const rest = [...byId.values()].filter((item) => item.id !== featuredSpacer.id && item.id !== secondSpacer.id);
  const items = [byId.get(featuredSpacer.id), byId.get(secondSpacer.id), ...rest];
  if (items.length > 60) throw new Error(`Portfolio berisi ${items.length} item, melampaui batas aman 60.`);
  return { ...content, material: { ...material, items: materials }, portfolio: { ...portfolio, items } };
}

const client = new pg.Client({ connectionString: databaseUrl });
try {
  await client.connect();
  await client.query("begin");
  const blockResult = await client.query("select * from content_blocks where key=$1 for update", [key]);
  const block = blockResult.rows[0];
  if (!block) throw new Error("Konten halaman utama belum tersedia.");
  const spacerAssetId = await prepareSpacerMedia(client);
  const spacerImagePath = `/api/media/${spacerAssetId}`;
  const content = reconcile(block.content, spacerImagePath);
  const draft = reconcile(block.draft_content ?? block.published_content ?? block.content, spacerImagePath);
  const published = reconcile(block.published_content ?? block.content, spacerImagePath);
  const version = Number(block.version) + 1;
  const now = new Date();
  await client.query(
    "update content_blocks set content=$1,draft_content=$2,published_content=$3,status='published',version=$4,published_at=$5,updated_at=$5 where id=$6 and version=$7",
    [content, draft, published, version, now, block.id, block.version],
  );
  await client.query(
    "insert into content_revisions (content_block_id,content,version,action) values ($1,$2,$3,'publish')",
    [block.id, published, version],
  );
  await client.query("insert into audit_logs (action,entity_type,entity_id,metadata) values ($1,$2,$3,$4)", [
    "content.landing_assets_reconciled",
    "content_block",
    block.id,
    { key, version, portfolioItems: published.portfolio.items.length, materialItems: materials.length, spacerAssetId },
  ]);
  await client.query("commit");
  process.stdout.write(
    `Landing reconciled: ${published.portfolio.items.length} portfolio cards and ${materials.length} materials.\n`,
  );
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
