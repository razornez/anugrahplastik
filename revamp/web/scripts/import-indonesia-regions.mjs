import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import pg from "pg";

const SOURCE_COMMIT = "493bd1c390ca6dc8156cd3fd579394b375ab2398";
const SNAPSHOT_URL = new URL("./data/indonesia-regions-493bd1.json.gz", import.meta.url);

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  const { config } = await import("dotenv");
  config({ path: ".env.local" });
}

function levelFor(code) {
  return ["province", "regency", "district", "village"][code.split(".").length - 1];
}

function parentFor(code) {
  const parts = code.split(".");
  return parts.length === 1 ? null : parts.slice(0, -1).join(".");
}

function loadSnapshot() {
  const payload = JSON.parse(gunzipSync(readFileSync(SNAPSHOT_URL)).toString("utf8"));
  if (payload.sourceCommit !== SOURCE_COMMIT || !Array.isArray(payload.rows) || payload.rows.length < 90_000)
    throw new Error("Snapshot wilayah lokal tidak lengkap atau versinya tidak cocok.");
  return payload;
}

async function insertChunk(client, rows) {
  const values = [];
  const placeholders = rows.map(([code, name, postalCode], rowIndex) => {
    const offset = rowIndex * 6;
    values.push(code, parentFor(code), levelFor(code), name, postalCode, SOURCE_COMMIT);
    return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6})`;
  });
  await client.query(
    `insert into indonesia_regions (code,parent_code,level,name,postal_code,source_version) values ${placeholders.join(",")}
     on conflict (code) do update set parent_code=excluded.parent_code,level=excluded.level,name=excluded.name,
       postal_code=excluded.postal_code,source_version=excluded.source_version,updated_at=now()
     where (indonesia_regions.parent_code,indonesia_regions.level,indonesia_regions.name,
       indonesia_regions.postal_code,indonesia_regions.source_version) is distinct from
       (excluded.parent_code,excluded.level,excluded.name,excluded.postal_code,excluded.source_version)`,
    values,
  );
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL belum tersedia.");
  const snapshot = loadSnapshot();
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    for (let index = 0; index < snapshot.rows.length; index += 1000)
      await insertChunk(client, snapshot.rows.slice(index, index + 1000));
    await client.query("delete from indonesia_regions where source_version <> $1", [SOURCE_COMMIT]);
    await client.query(
      `insert into region_catalog_metadata (id,source_repository,source_commit,source_updated_at,imported_at)
       values (1,$1,$2,$3,now()) on conflict (id) do update set source_repository=excluded.source_repository,
       source_commit=excluded.source_commit,source_updated_at=excluded.source_updated_at,imported_at=now()
       where (region_catalog_metadata.source_repository,region_catalog_metadata.source_commit,
         region_catalog_metadata.source_updated_at) is distinct from
         (excluded.source_repository,excluded.source_commit,excluded.source_updated_at)`,
      [snapshot.sourceRepository, SOURCE_COMMIT, snapshot.sourceUpdatedAt],
    );
    await client.query("commit");
    console.log(`Imported ${snapshot.rows.length} Indonesian regions from bundled snapshot ${SOURCE_COMMIT}.`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

await main();
