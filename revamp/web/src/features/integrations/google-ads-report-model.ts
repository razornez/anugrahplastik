export const adsMetricOptions = [
  "clicks",
  "impressions",
  "averageCpc",
  "cost",
  "conversions",
  "conversionValue",
] as const;
export type AdsMetric = (typeof adsMetricOptions)[number];
export type AdsPoint = { date: string; label: string; values: Record<AdsMetric, number> };
export type AdsReportRow = {
  reportDate: string;
  clicks: number;
  impressions: number;
  costMicros: string;
  conversions: string;
  conversionsValue: string;
};
export const defaultAdsMetrics: AdsMetric[] = ["clicks", "impressions", "averageCpc", "cost"];

export function adsDateInTimeZone(timeZone: string, daysAgo = 0, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return new Date(Date.UTC(year, month - 1, day - daysAgo)).toISOString().slice(0, 10);
}

export function adsDateInJakarta(daysAgo = 0, now = new Date()) {
  return adsDateInTimeZone("Asia/Jakarta", daysAgo, now);
}

export function completeAdsRange(days = 7, now = new Date(), timeZone = "Asia/Jakarta") {
  return { from: adsDateInTimeZone(timeZone, days, now), to: adsDateInTimeZone(timeZone, 1, now) };
}

export function normalizeAdsMetrics(value: string | undefined): AdsMetric[] {
  const selected = (value ?? "")
    .split(",")
    .filter((metric): metric is AdsMetric => adsMetricOptions.includes(metric as AdsMetric));
  return [...new Set([...selected, ...defaultAdsMetrics])].slice(0, 4);
}

export function averageCpc(cost: number, clicks: number) {
  return clicks > 0 ? cost / clicks : 0;
}

export function shiftAdsDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function adsDateLabel(value: string, timeZone = "Asia/Jakarta") {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone }).format(
    new Date(`${value}T12:00:00Z`),
  );
}

export function sumAdsRows(rows: AdsReportRow[]): AdsPoint["values"] {
  const totals = rows.reduce(
    (sum, row) => ({
      clicks: sum.clicks + row.clicks,
      impressions: sum.impressions + row.impressions,
      cost: sum.cost + Number(BigInt(row.costMicros)) / 1_000_000,
      conversions: sum.conversions + Number(row.conversions),
      conversionValue: sum.conversionValue + Number(row.conversionsValue),
    }),
    { clicks: 0, impressions: 0, cost: 0, conversions: 0, conversionValue: 0 },
  );
  return { ...totals, averageCpc: averageCpc(totals.cost, totals.clicks) };
}

export function toAdsChartPoints(
  rows: AdsReportRow[],
  from: string,
  to: string,
  interval: "daily" | "weekly" | "monthly",
  timeZone = "Asia/Jakarta",
): AdsPoint[] {
  const dates: string[] = [];
  for (let cursor = from; cursor <= to; cursor = shiftAdsDate(cursor, 1)) dates.push(cursor);
  const groups = new Map<string, { dates: string[]; rows: AdsReportRow[] }>();
  dates.forEach((date, index) => {
    const key =
      interval === "monthly" ? date.slice(0, 7) : interval === "weekly" ? dates[Math.floor(index / 7) * 7] : date;
    const group = groups.get(key) ?? { dates: [], rows: [] };
    group.dates.push(date);
    groups.set(key, group);
  });
  rows.forEach((row) => {
    const index = dates.indexOf(row.reportDate);
    if (index < 0) return;
    const key =
      interval === "monthly"
        ? row.reportDate.slice(0, 7)
        : interval === "weekly"
          ? dates[Math.floor(index / 7) * 7]
          : row.reportDate;
    groups.get(key)?.rows.push(row);
  });
  return [...groups].map(([date, group]) => ({
    date,
    label:
      interval === "monthly"
        ? new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric", timeZone }).format(
            new Date(`${group.dates[0]}T12:00:00Z`),
          )
        : interval === "weekly"
          ? `${adsDateLabel(group.dates[0], timeZone)}–${adsDateLabel(group.dates.at(-1)!, timeZone)}`
          : adsDateLabel(date, timeZone),
    values: sumAdsRows(group.rows),
  }));
}
