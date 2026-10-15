/* eslint-disable @typescript-eslint/no-require-imports -- PostgreSQL migration isolation harness. */
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { resolve } = require("node:path");
const test = require("node:test");
const pg = require("pg");
const { drizzle } = require("drizzle-orm/node-postgres");
const { migrate } = require("drizzle-orm/node-postgres/migrator");

test("migrasi transaksi 0048–0050 berjalan dua kali pada database terisolasi", async (context) => {
  require("dotenv").config({ path: resolve(__dirname, "../.env.local"), quiet: true });
  const connection = process.env.DATABASE_URL;
  if (!connection || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(connection).hostname)) {
    return context.skip("Database PostgreSQL lokal diperlukan.");
  }
  const name = `qa_transaction_migration_${randomUUID().replaceAll("-", "")}`;
  const adminUrl = new URL(connection);
  adminUrl.pathname = "/postgres";
  const isolatedUrl = new URL(connection);
  isolatedUrl.pathname = `/${name}`;
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  let created = false;
  try {
    await admin.query(`create database "${name}"`);
    created = true;
    const pool = new pg.Pool({ connectionString: isolatedUrl.toString(), max: 1 });
    try {
      await pool.query(`
        create table users(id uuid primary key);
        create table business_transactions(id uuid primary key, updated_at timestamptz);
        create table transaction_lines(id uuid primary key, transaction_id uuid not null);
        create table production_batches(id uuid primary key, transaction_id uuid not null);
        create table shipments(id uuid primary key);
        create schema drizzle;
        create table drizzle.__drizzle_migrations(id serial primary key, hash text not null, created_at bigint);
        insert into drizzle.__drizzle_migrations(hash,created_at) values('isolated-baseline-0047',1792044000000);
      `);
      const one = randomUUID();
      const two = randomUUID();
      await pool.query("insert into business_transactions(id) values($1),($2)", [one, two]);
      await pool.query("insert into transaction_lines(id,transaction_id) values($1,$2),($3,$4),($5,$4)", [
        randomUUID(),
        one,
        randomUUID(),
        two,
        randomUUID(),
      ]);
      await pool.query("insert into production_batches(id,transaction_id) values($1,$2),($3,$4)", [
        randomUUID(),
        one,
        randomUUID(),
        two,
      ]);
      const db = drizzle({ client: pool });
      const migrationsFolder = resolve(__dirname, "../drizzle");
      await migrate(db, { migrationsFolder });
      await migrate(db, { migrationsFolder });
      const result = await pool.query(
        "select transaction_id, transaction_line_id from production_batches order by transaction_id",
      );
      const mapped = new Map(result.rows.map((row) => [row.transaction_id, row.transaction_line_id]));
      assert.ok(mapped.get(one), "Batch satu item harus dipetakan otomatis");
      assert.equal(mapped.get(two), null, "Batch multi-item menunggu pemilihan Admin");
      const journal = await pool.query(
        "select count(*)::int as count from drizzle.__drizzle_migrations where created_at > 1792044000000",
      );
      assert.equal(journal.rows[0].count, 3, "Masing-masing migrasi baru tercatat tepat sekali");
    } finally {
      await pool.end();
    }
  } finally {
    if (created) await admin.query(`drop database "${name}"`);
    await admin.end();
  }
});
