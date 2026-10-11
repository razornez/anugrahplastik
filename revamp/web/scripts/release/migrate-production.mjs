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
  console.log("Database migrations completed.");
} catch {
  console.error("Database migrations failed. The release has not been activated.");
  process.exitCode = 1;
} finally {
  await pool.end();
}
