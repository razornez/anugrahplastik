import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL).hostname))
  throw new Error("Local database only");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const customerId = randomUUID();
const directory = resolve("storage/workflow-qa", customerId);
try {
  await pool.query(
    "insert into customers(id,code,legal_name,display_name,email,delivery_address,billing_address) values($1,$2,'[UJI] Pelanggan QA baru','[UJI] Pelanggan QA baru','workflow@example.invalid','Alamat fiktif Bandung','Alamat fiktif Bandung')",
    [customerId, `QA-${customerId.slice(0, 8)}`],
  );
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, "manifest.json"),
    JSON.stringify(
      {
        customerId,
        createdAt: new Date().toISOString(),
        purpose: "New local browser workflow fixtures; no customer email",
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(JSON.stringify({ customerId, directory }));
} finally {
  await pool.end();
}
