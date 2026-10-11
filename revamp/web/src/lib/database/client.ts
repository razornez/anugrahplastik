import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDatabase = globalThis as unknown as { pool?: Pool };

export function getDatabase() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    return null;
  }

  const pool = globalForDatabase.pool ?? new Pool({ connectionString });

  if (process.env.NODE_ENV !== "production") {
    globalForDatabase.pool = pool;
  }

  return drizzle({ client: pool, schema });
}
