import { and, count, eq, gte, lt } from "drizzle-orm";
import { getDatabase } from "@/lib/database/client";
import { leads } from "@/lib/database/schema";
import { prospectStatuses, type ProspectStatus } from "./prospect-status";

function jakartaStart(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError("Tanggal laporan tidak valid.");
  const [year, month, day] = date.split("-").map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    throw new RangeError("Tanggal laporan tidak valid.");
  }
  return new Date(`${date}T00:00:00+07:00`);
}

export async function getPaidGoogleLeadFunnel(from: string, to: string) {
  const database = getDatabase();
  if (!database) return null;
  const start = jakartaStart(from);
  const end = jakartaStart(to);
  end.setUTCDate(end.getUTCDate() + 1);
  if (end <= start) throw new RangeError("Rentang laporan tidak valid.");

  const rows = await database
    .select({ status: leads.status, total: count() })
    .from(leads)
    .where(
      and(
        eq(leads.source, "google / cpc"),
        eq(leads.dataClass, "production"),
        gte(leads.createdAt, start),
        lt(leads.createdAt, end),
      ),
    )
    .groupBy(leads.status);
  const counts = Object.fromEntries(prospectStatuses.map((status) => [status, 0])) as Record<ProspectStatus, number>;
  rows.forEach((row) => {
    if (prospectStatuses.includes(row.status as ProspectStatus))
      counts[row.status as ProspectStatus] = Number(row.total);
  });
  return { total: Object.values(counts).reduce((sum, value) => sum + value, 0), counts };
}
