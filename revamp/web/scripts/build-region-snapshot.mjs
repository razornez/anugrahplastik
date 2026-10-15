import { mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const SOURCE_COMMIT = "493bd1c390ca6dc8156cd3fd579394b375ab2398";
const REGION_COMMIT = "5d450ccbc94cc487f54bf2a262300efe97aa58af";
const POSTAL_COMMIT = "ba8497156c5cc9bcbfc527f7b8875d403eda2354";
const REGION_URL = `https://raw.githubusercontent.com/cahyadsn/wilayah/${REGION_COMMIT}/db/wilayah.sql`;
const POSTAL_URL = `https://raw.githubusercontent.com/cahyadsn/wilayah_kodepos/${POSTAL_COMMIT}/db/wilayah_kodepos.sql`;
const OUTPUT_URL = new URL("./data/indonesia-regions-493bd1.json.gz", import.meta.url);

function tuples(sql) {
  const rows = [];
  const pattern = /\('((?:''|[^'])*)'\s*,\s*'((?:''|[^'])*)'\)/g;
  for (const match of sql.matchAll(pattern))
    rows.push([match[1].replaceAll("''", "'"), match[2].replaceAll("''", "'")]);
  return rows;
}

async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Gagal mengambil sumber katalog wilayah (${response.status}).`);
  return response.text();
}

const [regionSql, postalSql] = await Promise.all([download(REGION_URL), download(POSTAL_URL)]);
const postal = new Map(tuples(postalSql));
const rows = tuples(regionSql).map(([code, name]) => [code, name, postal.get(code) ?? null]);
if (rows.length < 90_000 || new Set(rows.map(([code]) => code)).size !== rows.length)
  throw new Error(`Katalog wilayah tidak lengkap atau kode duplikat (${rows.length} baris).`);

const payload = {
  sourceRepository:
    "https://github.com/emsifa/api-wilayah-indonesia (upstream: cahyadsn/wilayah + cahyadsn/wilayah_kodepos)",
  sourceCommit: SOURCE_COMMIT,
  sourceUpdatedAt: "2026-09-03",
  upstreamRegionsCommit: REGION_COMMIT,
  upstreamPostalCommit: POSTAL_COMMIT,
  rows,
};
mkdirSync(new URL("./data/", import.meta.url), { recursive: true });
writeFileSync(OUTPUT_URL, gzipSync(Buffer.from(JSON.stringify(payload)), { level: 9 }));
console.log(`Built local region snapshot: ${rows.length} rows.`);
