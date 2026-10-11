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
    return Response.json({ status: "ok", database: "ok" }, { headers: noStore });
  } catch {
    return Response.json({ status: "unavailable", database: "unavailable" }, { status: 503, headers: noStore });
  }
}
