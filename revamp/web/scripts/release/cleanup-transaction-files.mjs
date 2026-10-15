import { rm } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import pg from "pg";

const configured = process.env.PRIVATE_STORAGE_PATH;
const root = resolve(
  configured
    ? isAbsolute(configured)
      ? configured
      : resolve(process.cwd(), configured)
    : resolve(process.cwd(), "storage/private"),
);
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL diperlukan.");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
let done = 0;
let failed = 0;
try {
  for (let index = 0; index < 50; index++) {
    await client.query("BEGIN");
    try {
      const found = await client.query(`select id, storage_path from transaction_file_cleanup_jobs
        where status in ('pending','failed') and attempts < 5
        order by created_at, id for update skip locked limit 1`);
      const job = found.rows[0];
      if (!job) {
        await client.query("COMMIT");
        break;
      }
      try {
        const absolute = resolve(root, job.storage_path);
        if (!absolute.startsWith(`${root}${sep}`)) throw new Error("Path file privat tidak aman.");
        const referenced = await client.query(
          `select
          exists(select 1 from transaction_documents where storage_path=$1) or
          exists(select 1 from finance_entry_documents where storage_path=$1) or
          exists(select 1 from product_design_files where storage_path=$1) as used`,
          [job.storage_path],
        );
        if (referenced.rows[0]?.used) throw new Error("File masih dirujuk data aktif; penghapusan ditunda.");
        await rm(absolute, { force: true });
        await client.query(
          "update transaction_file_cleanup_jobs set status='done', attempts=attempts+1, completed_at=now(), last_error=null where id=$1",
          [job.id],
        );
        done++;
      } catch (error) {
        await client.query(
          "update transaction_file_cleanup_jobs set status='failed', attempts=attempts+1, last_error=$2 where id=$1",
          [job.id, String(error instanceof Error ? error.message : error).slice(0, 300)],
        );
        failed++;
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client.end();
}
console.log(JSON.stringify({ done, failed }));
if (failed) process.exitCode = 1;
