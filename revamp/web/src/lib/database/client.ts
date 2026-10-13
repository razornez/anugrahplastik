import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDatabase = globalThis as unknown as { pool?: Pool };

function resolvePoolLimit() {
  const configured = Number.parseInt(process.env.DATABASE_POOL_MAX ?? "", 10);
  return Number.isFinite(configured) && configured > 0 ? Math.min(configured, 20) : 10;
}

export function getDatabase() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    return null;
  }

  const pool =
    globalForDatabase.pool ??
    new Pool({
      connectionString,
      max: resolvePoolLimit(),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

  // Next.js can evaluate this module from multiple server bundles. Reuse one
  // pool in every environment so route navigation cannot exhaust PostgreSQL.
  globalForDatabase.pool = pool;

  return drizzle({ client: pool, schema });
}
