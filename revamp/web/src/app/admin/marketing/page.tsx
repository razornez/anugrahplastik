import Link from "next/link";
import { eq } from "drizzle-orm";
import { GoogleAdsReportControls } from "@/components/google-ads-report-controls";
import { GoogleAdsTrendChart, type AdsMetric, type AdsPoint } from "@/components/google-ads-trend-chart";
import {
  adsDateInJakarta,
  getGoogleAdsCampaigns,
  getGoogleAdsOverview,
  validateGoogleAdsRange,
} from "@/features/integrations/google-ads-service";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { integrations } from "@/lib/database/schema";
import { redirect } from "next/navigation";

export const instant = false;

const number = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
const allowedMetrics: AdsMetric[] = ["impressions", "cost", "conversions", "conversionValue"];
const metricText: Record<AdsMetric, string> = {
  impressions: "Impresi",
  cost: "Biaya",
  conversions: "Konversi",
  conversionValue: "Nilai konversi",
};
const metricColor: Record<AdsMetric, string> = {
  impressions: "blue",
  cost: "red",
  conversions: "amber",
  conversionValue: "green",
};

function dateShift(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" }).format(
    new Date(`${value}T12:00:00Z`),
  );
}

function selectedValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function sumRows(rows: NonNullable<Awaited<ReturnType<typeof getGoogleAdsOverview>>>["rows"]) {
  return rows.reduce(
    (sum, row) => ({
      impressions: sum.impressions + row.impressions,
      cost: sum.cost + Number(BigInt(row.costMicros)) / 1_000_000,
      conversions: sum.conversions + Number(row.conversions),
      conversionValue: sum.conversionValue + Number(row.conversionsValue),
    }),
    { impressions: 0, cost: 0, conversions: 0, conversionValue: 0 },
  );
}

function toChartPoints(
  rows: NonNullable<Awaited<ReturnType<typeof getGoogleAdsOverview>>>["rows"],
  from: string,
  to: string,
  interval: "daily" | "weekly" | "monthly",
): AdsPoint[] {
  const daily = new Map<string, AdsPoint["values"]>();
  for (let cursor = from; cursor <= to; cursor = dateShift(cursor, 1))
    daily.set(cursor, { impressions: 0, cost: 0, conversions: 0, conversionValue: 0 });
  for (const row of rows) {
    const values = daily.get(row.reportDate);
    if (!values) continue;
    values.impressions += row.impressions;
    values.cost += Number(BigInt(row.costMicros)) / 1_000_000;
    values.conversions += Number(row.conversions);
    values.conversionValue += Number(row.conversionsValue);
  }
  const days = [...daily].map(([date, values]) => ({ date, label: dateLabel(date), values }));
  if (interval === "daily") return days;
  if (interval === "weekly") {
    const result: AdsPoint[] = [];
    for (let index = 0; index < days.length; index += 7) {
      const group = days.slice(index, index + 7);
      result.push({
        date: group[0].date,
        label: `${group[0].label}–${group.at(-1)?.label}`,
        values: group.reduce(
          (sum, point) => ({
            impressions: sum.impressions + point.values.impressions,
            cost: sum.cost + point.values.cost,
            conversions: sum.conversions + point.values.conversions,
            conversionValue: sum.conversionValue + point.values.conversionValue,
          }),
          { impressions: 0, cost: 0, conversions: 0, conversionValue: 0 },
        ),
      });
    }
    return result;
  }
  const months = new Map<string, AdsPoint>();
  for (const point of days) {
    const month = point.date.slice(0, 7);
    const existing = months.get(month);
    if (!existing)
      months.set(month, {
        ...point,
        date: month,
        label: new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(
          new Date(`${point.date}T12:00:00Z`),
        ),
      });
    else {
      existing.values.impressions += point.values.impressions;
      existing.values.cost += point.values.cost;
      existing.values.conversions += point.values.conversions;
      existing.values.conversionValue += point.values.conversionValue;
    }
  }
  return [...months.values()];
}

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSession();
  if (!user || !["admin", "sales"].includes(user.role)) redirect("/admin");
  const database = getDatabase();
  const [connection] = database
    ? await database.select().from(integrations).where(eq(integrations.key, "google-ads")).limit(1)
    : [];
  const params = await searchParams;
  const today = adsDateInJakarta();
  const fallbackTo = today;
  const fallbackFrom = adsDateInJakarta(29);
  let from = selectedValue(params.from) ?? fallbackFrom;
  let to = selectedValue(params.to) ?? fallbackTo;
  if (!validateGoogleAdsRange(from, to)) {
    from = fallbackFrom;
    to = fallbackTo;
  }
  const selectedCampaigns = (selectedValue(params.campaigns) ?? "")
    .split(",")
    .filter((id) => /^\d{1,20}$/.test(id))
    .slice(0, 100);
  const requestedMetrics = (selectedValue(params.metrics) ?? "")
    .split(",")
    .filter((value): value is AdsMetric => allowedMetrics.includes(value as AdsMetric));
  const metrics = requestedMetrics.length ? [...new Set(requestedMetrics)] : allowedMetrics;
  const intervalValue = selectedValue(params.interval);
  const interval = intervalValue === "weekly" || intervalValue === "monthly" ? intervalValue : "daily";
  const compare = selectedValue(params.compare) !== "0";
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  const previousFrom = dateShift(from, -days);
  const previousTo = dateShift(from, -1);
  const [allCurrent, current, previous, campaignOptions] = await Promise.all([
    getGoogleAdsOverview(from, to),
    getGoogleAdsOverview(from, to, selectedCampaigns),
    compare ? getGoogleAdsOverview(previousFrom, previousTo, selectedCampaigns) : Promise.resolve(null),
    getGoogleAdsCampaigns(),
  ]);
  const currentRows = current?.rows ?? [];
  const hasPreviousData = (previous?.rows.length ?? 0) > 0;
  const totals = sumRows(currentRows);
  const previousTotals = sumRows(previous?.rows ?? []);
  const money = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: current?.currencyCode ?? "IDR",
    maximumFractionDigits: 0,
  });
  const metricValues = {
    impressions: totals.impressions,
    cost: totals.cost,
    conversions: totals.conversions,
    conversionValue: totals.conversionValue,
  };
  const previousValues = {
    impressions: previousTotals.impressions,
    cost: previousTotals.cost,
    conversions: previousTotals.conversions,
    conversionValue: previousTotals.conversionValue,
  };
  const chartData = toChartPoints(currentRows, from, to, interval);
  const campaigns = new Map<
    string,
    {
      id: string;
      name: string;
      status: string;
      impressions: number;
      cost: number;
      conversions: number;
      conversionValue: number;
    }
  >();
  for (const row of allCurrent?.rows ?? []) {
    const campaign = campaigns.get(row.campaignId) ?? {
      id: row.campaignId,
      name: row.campaignName,
      status: row.status,
      impressions: 0,
      cost: 0,
      conversions: 0,
      conversionValue: 0,
    };
    campaign.impressions += row.impressions;
    campaign.cost += Number(BigInt(row.costMicros)) / 1_000_000;
    campaign.conversions += Number(row.conversions);
    campaign.conversionValue += Number(row.conversionsValue);
    campaigns.set(row.campaignId, campaign);
  }
  const campaignRows = [...campaigns.values()]
    .filter((item) => !selectedCampaigns.length || selectedCampaigns.includes(item.id))
    .sort((a, b) => b.cost - a.cost);
  const periodLabel = `${dateLabel(from)} – ${dateLabel(to)}${days === 30 && to === today ? " · 30 hari terakhir" : ""}`;

  return (
    <section className="admin-page marketing-page">
      <header className="admin-page-heading marketing-page__heading">
        <div>
          <p className="admin-eyebrow">PEMASARAN</p>
          <h1>Hasil pemasaran</h1>
          <p>Pantau kinerja iklan dan perilaku pengunjung website dalam satu ruang.</p>
        </div>
        <Link className="admin-secondary-button" href="/admin/insights">
          Laporan pengunjung
        </Link>
      </header>
      {params.synced ? (
        <p className="integration-success" role="status">
          Laporan Google Ads berhasil diperbarui untuk periode yang dipilih.
        </p>
      ) : null}
      {params.error === "range" ? (
        <p className="integration-alert" role="alert">
          Periksa rentang tanggal. Maksimal 365 hari dan tanggal akhir tidak boleh melewati hari ini.
        </p>
      ) : null}
      <article className="marketing-ads-card marketing-report-card">
        <div className="marketing-ads-card__head">
          <div>
            <p className="admin-eyebrow">GOOGLE ADS · {periodLabel}</p>
            <h2>Performa kampanye</h2>
          </div>
          <span
            className={`integration-status is-${connection?.secretCiphertext ? (connection.lastError ? "error" : "connected") : "disconnected"}`}
          >
            {connection?.secretCiphertext
              ? connection.lastError
                ? "Tersambung · Perlu perhatian"
                : "Tersambung"
              : "Belum tersambung"}
          </span>
        </div>
        {connection?.secretCiphertext ? (
          <>
            <GoogleAdsReportControls
              from={from}
              to={to}
              today={today}
              campaigns={campaignOptions}
              selectedCampaigns={selectedCampaigns}
              metrics={metrics}
              interval={interval}
              compare={compare}
            />
            <div className="marketing-kpis marketing-kpis--ads">
              {allowedMetrics.map((key) => {
                const delta = metricValues[key] - previousValues[key];
                const value =
                  key === "cost" || key === "conversionValue"
                    ? money.format(metricValues[key])
                    : number.format(metricValues[key]);
                const deltaText =
                  key === "cost" || key === "conversionValue"
                    ? money.format(Math.abs(delta))
                    : number.format(Math.abs(delta));
                return (
                  <div key={key} className={`marketing-kpi marketing-kpi--${metricColor[key]}`}>
                    <span>{metricText[key]}</span>
                    <strong>{value}</strong>
                    {compare && hasPreviousData ? (
                      <small className={delta > 0 ? "is-up" : delta < 0 ? "is-down" : "is-flat"}>
                        {delta > 0 ? "↑" : delta < 0 ? "↓" : "→"} {deltaText} dibanding periode sebelumnya
                      </small>
                    ) : compare ? (
                      <small>Belum ada data pembanding</small>
                    ) : (
                      <small>Untuk periode terpilih</small>
                    )}
                  </div>
                );
              })}
            </div>
            {!currentRows.length ? (
              <p className="ads-report-no-data" role="status">
                Google Ads belum mengembalikan data kampanye pada rentang dan filter ini. Grafik ditampilkan sebagai
                garis nol; periksa pilihan kampanye atau koneksi akun.
              </p>
            ) : null}
            <GoogleAdsTrendChart data={chartData} metrics={metrics} currency={current?.currencyCode ?? "IDR"} />
            <section className="marketing-campaigns marketing-campaigns--table">
              <div className="marketing-campaigns__heading">
                <div>
                  <h3>Kampanye</h3>
                  <p>Ringkasan hasil pada periode yang dipilih</p>
                </div>
                <span>{campaignRows.length} kampanye</span>
              </div>
              {campaignRows.length ? (
                <div className="ads-campaign-table-wrap">
                  <table className="ads-campaign-table">
                    <thead>
                      <tr>
                        <th>Kampanye</th>
                        <th>Status</th>
                        <th>Impresi</th>
                        <th>Biaya</th>
                        <th>Konversi</th>
                        <th>Nilai konversi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaignRows.map((campaign) => (
                        <tr key={campaign.id}>
                          <th scope="row">
                            <strong>{campaign.name}</strong>
                            <small>ID {campaign.id}</small>
                          </th>
                          <td>
                            <span
                              className={`ads-campaign-status ads-campaign-status--${campaign.status.toLowerCase()}`}
                            >
                              {campaign.status === "ENABLED"
                                ? "Aktif"
                                : campaign.status === "PAUSED"
                                  ? "Dijeda"
                                  : campaign.status}
                            </span>
                          </td>
                          <td>{number.format(campaign.impressions)}</td>
                          <td>{money.format(campaign.cost)}</td>
                          <td>{number.format(campaign.conversions)}</td>
                          <td>{money.format(campaign.conversionValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="marketing-campaigns__empty">Kampanye belum memiliki data pada periode ini.</p>
              )}
            </section>
            <div className="ads-report-footer">
              <p>
                Angka konversi dan nilainya mengikuti pengaturan pelacakan di Google Ads. Angka ini tidak otomatis sama
                dengan prospek valid atau transaksi.
              </p>
              <p>
                {connection.lastSyncAt ? (
                  <>
                    Data terakhir diambil{" "}
                    {new Date(connection.lastSyncAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}.
                  </>
                ) : (
                  "Belum pernah mengambil laporan."
                )}{" "}
                Rentang laporan: {days} hari.
              </p>
            </div>
            {params.error === "sync" ? (
              <p className="integration-alert" role="alert">
                Laporan belum berhasil diambil. Periksa status koneksi, lalu coba lagi.
              </p>
            ) : null}
            {connection.lastError ? <p className="integration-alert">{connection.lastError}</p> : null}
          </>
        ) : (
          <div className="integration-empty">
            <span aria-hidden="true">G</span>
            <div>
              <strong>Hubungkan akun untuk melihat hasil iklan</strong>
              <p>Laporan hanya membaca angka Google Ads dan tidak mengubah kampanye atau anggaran.</p>
            </div>
            {user.role === "admin" ? (
              <Link className="admin-primary-button" href="/admin/settings/integrations">
                Atur koneksi
              </Link>
            ) : (
              <p>Minta administrator menyambungkan akun.</p>
            )}
          </div>
        )}
      </article>
      <article className="marketing-visitor-card">
        <div>
          <p className="admin-eyebrow">WEBSITE</p>
          <h2>Perilaku pengunjung</h2>
          <p>Lihat bagian yang menarik perhatian, tombol yang sering dipilih, dan bagian tempat pengunjung berhenti.</p>
        </div>
        <Link className="admin-primary-button" href="/admin/insights">
          Buka laporan pengunjung
        </Link>
      </article>
    </section>
  );
}
