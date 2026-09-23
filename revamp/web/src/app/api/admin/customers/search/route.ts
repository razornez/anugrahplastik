import { and, asc, eq, ilike, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { customers } from "@/lib/database/schema";

const resultLimit = 12;

export async function GET(request: Request) {
  const user = await getSession();
  if (!user || (user.role !== "admin" && user.role !== "sales")) {
    return NextResponse.json({ message: "Akses ditolak." }, { status: 403 });
  }

  const database = getDatabase();
  if (!database) return NextResponse.json({ message: "Data belum tersedia." }, { status: 503 });

  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 80) ?? "";
  const term = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
  const where = query
    ? and(eq(customers.status, "active"), or(ilike(customers.displayName, term), ilike(customers.code, term)))
    : eq(customers.status, "active");

  const matches = await database
    .select({ id: customers.id, code: customers.code, name: customers.displayName })
    .from(customers)
    .where(where)
    .orderBy(asc(customers.displayName))
    .limit(resultLimit);

  return NextResponse.json({ customers: matches }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
