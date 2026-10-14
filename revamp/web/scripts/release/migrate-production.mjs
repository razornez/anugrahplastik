#!/usr/bin/env node

import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required for the production migration runner.");
  process.exit(2);
}

const migrationsFolder = resolve(process.cwd(), "drizzle");
const pool = new pg.Pool({ connectionString, max: 1 });

try {
  await migrate(drizzle({ client: pool }), { migrationsFolder });
  await pool.query(`
    select
      "key_hash",
      "user_id",
      "attempts",
      "window_started_at",
      "locked_until",
      "updated_at"
    from "auth_rate_limits"
    limit 0
  `);
  await pool.query(`
    select "username", "pin_hash", "temporary_pin", "pin_changed_at"
    from "users"
    limit 0
  `);
  await pool.query(`
    select "absolute_expires_at", "remembered", "last_active_at", "revoked_at"
    from "sessions"
    limit 0
  `);
  await pool.query(`
    select "kind", "active_version_id", "updated_at"
    from "document_template_catalogs"
    limit 0
  `);
  await pool.query(`
    select "kind", "version", "config", "compiled_checksum", "provider_template_id", "status"
    from "document_template_versions"
    limit 0
  `);
  console.log("Database migrations and authentication schema checks completed.");
} catch {
  console.error("Database migrations failed. The release has not been activated.");
  process.exitCode = 1;
} finally {
  await pool.end();
}
