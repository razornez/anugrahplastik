#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(await readFile(resolve(scriptDirectory, "client-logo-catalog.json"), "utf8"));
const apply = process.argv.includes("--apply");
const expectedVersion = Number(process.env.CLIENT_LOGO_EXPECTED_VERSION);

if (!Array.isArray(catalog) || catalog.length !== 38 || new Set(catalog.map((item) => item.slug)).size !== 38) {
  throw new Error("Katalog logo harus berisi tepat 38 merek unik.");
}
if (catalog.some((item) => !/^[a-z0-9-]+$/.test(item.slug) || !item.name?.trim())) {
  throw new Error("Nama atau slug katalog logo tidak valid.");
}
for (const item of catalog) {
  await stat(resolve(process.cwd(), "public", "images-webp", "clients", `${item.slug}.webp`));
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL wajib tersedia.");
if (apply && process.env.CLIENT_LOGO_RELEASE_CONFIRM !== "publish-client-logos-v1") {
  throw new Error("Penerbitan membutuhkan CLIENT_LOGO_RELEASE_CONFIRM=publish-client-logos-v1.");
}
if (apply && (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1)) {
  throw new Error("CLIENT_LOGO_EXPECTED_VERSION wajib sama dengan versi konten production yang diaudit.");
}

const partners = catalog.map(({ name, slug }) => ({
  name,
  subtitle: "",
  imagePath: `/images-webp/clients/${slug}.webp`,
  altText: `Logo ${name}`,
  isFeatured: false,
}));
const patchPartners = (content) => ({
  ...content,
  trust: { ...content.trust, partners },
});

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const { rows } = await client.query(
    "select id, content, draft_content, published_content, version from content_blocks where key = $1 for update",
    ["landing.page"],
  );
  const current = rows[0];
  if (!current?.published_content || typeof current.published_content !== "object") {
    throw new Error("Konten landing production yang telah diterbitkan tidak ditemukan.");
  }
  const unchanged = JSON.stringify(current.published_content.trust?.partners) === JSON.stringify(partners);
  if (!apply || unchanged) {
    await client.query("ROLLBACK");
    console.log(
      JSON.stringify({
        mode: apply ? "already-published" : "dry-run",
        currentVersion: current.version,
        logos: partners.length,
      }),
    );
    process.exitCode = 0;
  } else {
    if (current.version !== expectedVersion)
      throw new Error("Versi landing berubah. Audit ulang sebelum menerbitkan logo.");
    const published = patchPartners(current.published_content);
    const draft = patchPartners(current.draft_content ?? current.published_content);
    const legacy = patchPartners(current.content ?? current.published_content);
    const updated = await client.query(
      `update content_blocks set content=$1::jsonb, draft_content=$2::jsonb,
       published_content=$3::jsonb, version=version+1, status='published',
       published_at=now(), updated_at=now() where id=$4 and version=$5 returning version`,
      [JSON.stringify(legacy), JSON.stringify(draft), JSON.stringify(published), current.id, current.version],
    );
    if (updated.rowCount !== 1) throw new Error("Versi landing berubah sebelum logo diterbitkan.");
    await client.query(
      `insert into content_revisions (content_block_id, content, version, action)
       values ($1, $2::jsonb, $3, 'publish')`,
      [current.id, JSON.stringify(published), updated.rows[0].version],
    );
    await client.query(
      `insert into audit_logs (action, entity_type, entity_id, metadata)
       values ('content.publish_partner_logos', 'content_block', $1, $2::jsonb)`,
      [current.id, JSON.stringify({ key: "landing.page", version: updated.rows[0].version, logos: partners.length })],
    );
    await client.query("COMMIT");
    console.log(JSON.stringify({ mode: "published", version: updated.rows[0].version, logos: partners.length }));
  }
} catch (error) {
  await client.query("ROLLBACK");
  console.error(error instanceof Error ? error.message : "Penerbitan logo gagal.");
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
