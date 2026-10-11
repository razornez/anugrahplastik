import { mkdir, stat, unlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });
const connection = new URL(process.env.DATABASE_URL || "invalid:");
if (!["localhost", "127.0.0.1", "::1"].includes(connection.hostname))
  throw new Error("Backup ini hanya untuk database lokal.");
await mkdir("storage/backups", { recursive: true });
const filename = `storage/backups/visitor-report-${new Date().toISOString().replaceAll(/[:.]/g, "-")}.dump`;
const result = spawnSync(
  "pg_dump",
  [
    "-h",
    connection.hostname,
    "-p",
    connection.port || "5432",
    "-U",
    decodeURIComponent(connection.username),
    "-d",
    connection.pathname.slice(1),
    "-Fc",
    "-f",
    filename,
  ],
  {
    env: { ...process.env, PGPASSWORD: decodeURIComponent(connection.password) },
    encoding: "utf8",
  },
);
if (result.error || result.status !== 0) {
  // Remove only this invocation's incomplete generated dump, never an existing backup.
  await unlink(filename).catch(() => {});
  throw new Error("Backup gagal; seed tidak boleh dijalankan.");
}
const file = await stat(filename);
if (!file.size) throw new Error("Backup kosong.");
console.log(`Backup privat tersimpan: ${filename} (${file.size} bytes).`);
