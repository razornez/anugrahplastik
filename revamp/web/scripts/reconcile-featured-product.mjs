import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local", quiet: true });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL lokal belum tersedia.");

const host = new URL(databaseUrl).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  throw new Error("Rekonsiliasi produk unggulan hanya boleh dijalankan pada database lokal.");
}

const key = "landing.page";
const featuredProduct = {
  id: "spacer-underground-conduit",
  title: "Spacer for Underground Conduit",
  // Category is the stable filter ID, not its display label.
  category: "produk",
  caption:
    "Spacer plastik custom untuk menjaga jarak dan posisi underground conduit agar jalur kabel tetap rapi saat instalasi.",
  isHot: true,
};

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function reconcileContent(value) {
  const content = object(value);
  const portfolio = object(content.portfolio);
  if (!Array.isArray(portfolio.items) || portfolio.items.length === 0) return { content, changed: false };

  let matched = false;
  let changed = false;
  const items = portfolio.items.map((item, index) => {
    const current = object(item);
    const isLegacyGrid =
      current.id === "rangka-grid" ||
      String(current.title || "")
        .trim()
        .toLowerCase() === "rangka grid custom";
    const shouldFeature = isLegacyGrid || (!matched && index === 0);
    if (shouldFeature) matched = true;
    const next = {
      ...current,
      // Spacer is intentionally the single featured product. Older drafts
      // could carry stale flags from an experimental editor build.
      isHot: false,
      ...(shouldFeature ? featuredProduct : {}),
    };
    if (JSON.stringify(next) !== JSON.stringify(current)) changed = true;
    return next;
  });

  return { content: { ...content, portfolio: { ...portfolio, items } }, changed };
}

const client = new pg.Client({ connectionString: databaseUrl });
try {
  await client.connect();
  await client.query("begin");
  const { rows } = await client.query(
    "select id, content, draft_content, published_content, version from content_blocks where key = $1 for update",
    [key],
  );
  const block = rows[0];
  if (!block) throw new Error("Konten halaman utama belum tersedia.");

  const content = reconcileContent(block.content);
  const draft = reconcileContent(block.draft_content ?? block.published_content ?? block.content);
  const published = reconcileContent(block.published_content ?? block.content);
  if (!content.changed && !draft.changed && !published.changed) {
    await client.query("rollback");
    process.stdout.write("Produk unggulan sudah sesuai. Tidak ada perubahan.\n");
  } else {
    const version = Number(block.version) + 1;
    const currentContent = content.changed ? content.content : published.content;
    const now = new Date();
    await client.query(
      `update content_blocks
       set content = $1, draft_content = $2, published_content = $3, status = 'published', version = $4, published_at = $5, updated_at = $5
       where id = $6 and version = $7`,
      [currentContent, draft.content, published.content, version, now, block.id, block.version],
    );
    await client.query(
      "insert into content_revisions (content_block_id, content, version, action) values ($1, $2, $3, $4)",
      [block.id, published.content, version, "publish"],
    );
    await client.query("insert into audit_logs (action, entity_type, entity_id, metadata) values ($1, $2, $3, $4)", [
      "content.featured_product_reconciled",
      "content_block",
      block.id,
      { key, version, productId: featuredProduct.id },
    ]);
    await client.query("commit");
    process.stdout.write(`Produk unggulan diterbitkan pada revisi ${version}.\n`);
  }
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
