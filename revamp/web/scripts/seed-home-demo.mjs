import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local", quiet: true });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL lokal belum tersedia.");
const databaseHost = new URL(databaseUrl).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(databaseHost)) {
  throw new Error("Seed Beranda hanya boleh dijalankan pada database lokal.");
}

const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "seed-home-demo.sql");
const client = new pg.Client({ connectionString: databaseUrl });
try {
  await client.connect();
  await client.query(await readFile(scriptPath, "utf8"));
  const { rows } = await client.query(
    "select traffic_class, count(*)::integer as total from analytics_sessions where traffic_class in ('demo', 'public') group by traffic_class order by traffic_class",
  );
  process.stdout.write(`Seed Beranda selesai: ${JSON.stringify(rows)}\n`);
} finally {
  await client.end();
}
