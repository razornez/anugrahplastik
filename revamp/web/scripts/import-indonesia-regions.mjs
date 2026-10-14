import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });

const SOURCE_COMMIT = "493bd1c390ca6dc8156cd3fd579394b375ab2398";
const REGION_COMMIT = "5d450ccbc94cc487f54bf2a262300efe97aa58af";
const POSTAL_COMMIT = "ba8497156c5cc9bcbfc527f7b8875d403eda2354";
const REGION_URL = `https://raw.githubusercontent.com/cahyadsn/wilayah/${REGION_COMMIT}/db/wilayah.sql`;
const POSTAL_URL = `https://raw.githubusercontent.com/cahyadsn/wilayah_kodepos/${POSTAL_COMMIT}/db/wilayah_kodepos.sql`;

function tuples(sql) {
  const rows = [];
  const pattern = /\('((?:''|[^'])*)'\s*,\s*'((?:''|[^'])*)'\)/g;
  for (const match of sql.matchAll(pattern))
    rows.push([match[1].replaceAll("''", "'"), match[2].replaceAll("''", "'")]);
  return rows;
}

function levelFor(code) {
  return ["province", "regency", "district", "village"][code.split(".").length - 1];
}

function parentFor(code) {
  const parts = code.split(".");
  return parts.length === 1 ? null : parts.slice(0, -1).join(".");
}

async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Gagal mengambil katalog wilayah (${response.status}).`);
  return response.text();
}

async function insertChunk(client, rows) {
  const values = [];
  const placeholders = rows.map((row, rowIndex) => {
    const offset = rowIndex * 6;
    values.push(...row);
    return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6})`;
  });
  await client.query(
    `insert into indonesia_regions (code,parent_code,level,name,postal_code,source_version) values ${placeholders.join(",")}
     on conflict (code) do update set parent_code=excluded.parent_code,level=excluded.level,name=excluded.name,
       postal_code=excluded.postal_code,source_version=excluded.source_version,updated_at=now()`,
    values,
  );
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL belum tersedia.");
  const [regionSql, postalSql] = await Promise.all([download(REGION_URL), download(POSTAL_URL)]);
  const postal = new Map(tuples(postalSql));
  const rows = tuples(regionSql).map(([code, name]) => [
    code,
    parentFor(code),
    levelFor(code),
    name,
    postal.get(code) ?? null,
    SOURCE_COMMIT,
  ]);
  if (rows.length < 90_000) throw new Error(`Katalog wilayah tidak lengkap (${rows.length} baris).`);
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    for (let index = 0; index < rows.length; index += 1000) await insertChunk(client, rows.slice(index, index + 1000));
    await client.query("delete from indonesia_regions where source_version <> $1", [SOURCE_COMMIT]);
    await client.query(
      `insert into region_catalog_metadata (id,source_repository,source_commit,source_updated_at,imported_at)
       values (1,$1,$2,$3,now()) on conflict (id) do update set source_repository=excluded.source_repository,
       source_commit=excluded.source_commit,source_updated_at=excluded.source_updated_at,imported_at=now()`,
      ["https://github.com/emsifa/api-wilayah-indonesia", SOURCE_COMMIT, "2026-09-03"],
    );
    await client.query("commit");
    console.log(`Imported ${rows.length} Indonesian regions from ${SOURCE_COMMIT}.`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

await main();
