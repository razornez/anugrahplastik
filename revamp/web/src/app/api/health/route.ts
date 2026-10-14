import { sql } from "drizzle-orm";
import { getDatabase } from "@/lib/database/client";

const noStore = { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" };

/**
 * Loopback-only operational health probe. Nginx denies public access to this
 * route; the response intentionally exposes no environment or schema details.
 */
export async function GET() {
  const database = getDatabase();
  if (!database) return Response.json({ status: "unavailable" }, { status: 503, headers: noStore });

  try {
    await database.execute(sql`select 1`);
    await database.execute(sql`
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
    await database.execute(sql`
      select "username", "pin_hash", "temporary_pin", "pin_changed_at"
      from "users"
      limit 0
    `);
    await database.execute(sql`
      select "absolute_expires_at", "remembered", "last_active_at", "revoked_at"
      from "sessions"
      limit 0
    `);
    return Response.json({ status: "ok", database: "ok" }, { headers: noStore });
  } catch {
    return Response.json({ status: "unavailable", database: "unavailable" }, { status: 503, headers: noStore });
  }
}
