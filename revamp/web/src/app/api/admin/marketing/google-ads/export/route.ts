import { and, asc, gte, inArray, lte } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { googleAdsDailyReports } from "@/lib/database/schema";
import { validateGoogleAdsRange } from "@/features/integrations/google-ads-service";

function csvCell(value: string | number) {
  let text = String(value);
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function formatMicros(value: string) {
  const micros = BigInt(value);
  const unit = BigInt("1000000");
  const whole = micros / unit;
  const fraction = (micros % unit).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export async function GET(request: Request) {
  const user = await getSession();
  if (!user || !["admin", "sales"].includes(user.role))
    return Response.json({ error: "Tidak memiliki akses." }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  if (!validateGoogleAdsRange(from, to))
    return Response.json({ error: "Rentang tanggal tidak valid." }, { status: 400 });
  const campaigns = (searchParams.get("campaigns") ?? "")
    .split(",")
    .filter((id) => /^\d{1,20}$/.test(id))
    .slice(0, 100);
  const database = getDatabase();
  if (!database) return Response.json({ error: "Database belum tersedia." }, { status: 503 });
  const conditions = [gte(googleAdsDailyReports.reportDate, from), lte(googleAdsDailyReports.reportDate, to)];
  if (campaigns.length) conditions.push(inArray(googleAdsDailyReports.campaignId, campaigns));
  const rows = await database
    .select()
    .from(googleAdsDailyReports)
    .where(and(...conditions))
    .orderBy(asc(googleAdsDailyReports.reportDate), asc(googleAdsDailyReports.campaignName));
  const output = [
    [
      "Tanggal",
      "ID Kampanye",
      "Nama kampanye",
      "Status",
      "Mata uang",
      "Impresi",
      "Klik",
      "Biaya",
      "Konversi",
      "Nilai konversi",
    ]
      .map(csvCell)
      .join(","),
    ...rows.map((row) =>
      [
        row.reportDate,
        row.campaignId,
        row.campaignName,
        row.status,
        row.currencyCode,
        row.impressions,
        row.clicks,
        formatMicros(row.costMicros),
        row.conversions,
        row.conversionsValue,
      ]
        .map(csvCell)
        .join(","),
    ),
  ].join("\r\n");
  return new Response(`\uFEFF${output}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="google-ads-${from}-${to}.csv"`,
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
    },
  });
}
