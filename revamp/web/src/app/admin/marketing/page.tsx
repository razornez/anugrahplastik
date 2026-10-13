import Link from "next/link";
import { AdminPageHeader } from "@/components/admin-page-header";
import { eq } from "drizzle-orm";
import { GoogleAdsPerformance } from "@/components/google-ads-performance";
import { MarketingWorkspaceNav } from "@/components/marketing-workspace-nav";
import {
  getGoogleAdsCampaigns,
  getGoogleAdsOverview,
  isFreshGoogleAdsProbe,
  validateGoogleAdsRange,
} from "@/features/integrations/google-ads-service";
import {
  adsDateLabel as dateLabel,
  adsDateInTimeZone,
  averageCpc,
  completeAdsRange,
  normalizeAdsMetrics,
  shiftAdsDate as dateShift,
  sumAdsRows as sumRows,
  toAdsChartPoints as toChartPoints,
} from "@/features/integrations/google-ads-report-model";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { integrations } from "@/lib/database/schema";
import {
  getGoogleAdsReportingConfigurationIssues,
  googleAdsDataSource,
  isGoogleAdsSnapshotConfigured,
  isGoogleAdsOAuthConfigured,
  isGoogleAdsReportingConfigured,
} from "@/features/integrations/google-ads-config";
import {
  getIntegrationHealth,
  getSchedulerHealth,
  INTEGRATION_HEALTH_STALE_HOURS,
} from "@/features/integrations/integration-health";
import { getLastScheduledIntegrationRun } from "@/features/integrations/sync-runner";
import { getPaidGoogleLeadFunnel } from "@/features/workspace/paid-lead-report";
import { prospectStatusLabel } from "@/features/workspace/prospect-status";
import { redirect } from "next/navigation";
import "./marketing-report.css";

export const instant = false;

const number = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

function selectedValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
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
  const metadata = (connection?.metadata ?? {}) as Record<string, unknown>;
  const dataSource = googleAdsDataSource();
  const snapshotMode = dataSource === "snapshot";
  const snapshotConfigured = isGoogleAdsSnapshotConfigured();
  const snapshotImportedAt =
    typeof metadata.snapshotImportedAt === "string" && Number.isFinite(Date.parse(metadata.snapshotImportedAt))
      ? metadata.snapshotImportedAt
      : null;
  const snapshotAge = snapshotImportedAt
    ? new Date().getTime() - Date.parse(snapshotImportedAt)
    : Number.POSITIVE_INFINITY;
  const snapshotFresh = snapshotAge <= 24 * 60 * 60_000;
  const snapshotSourceLastSyncAt =
    typeof metadata.snapshotSourceLastSyncAt === "string" ? metadata.snapshotSourceLastSyncAt : null;
  const accountTimeZone =
    typeof metadata.adsAccountTimeZone === "string" ? metadata.adsAccountTimeZone : "Asia/Jakarta";
  const today = adsDateInTimeZone(accountTimeZone);
  const { from: fallbackFrom, to: fallbackTo } = completeAdsRange(7, new Date(), accountTimeZone);
  let from = selectedValue(params.from) ?? fallbackFrom;
  let to = selectedValue(params.to) ?? fallbackTo;
  if (!validateGoogleAdsRange(from, to, accountTimeZone)) {
    from = fallbackFrom;
    to = fallbackTo;
  }
  const selectedCampaigns = (selectedValue(params.campaigns) ?? "")
    .split(",")
    .filter((id) => /^\d{1,20}$/.test(id))
    .slice(0, 100);
  const metrics = normalizeAdsMetrics(selectedValue(params.metrics));
  const intervalValue = selectedValue(params.interval);
  const interval = intervalValue === "weekly" || intervalValue === "monthly" ? intervalValue : "daily";
  const compare = selectedValue(params.compare) !== "0";
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  const previousFrom = dateShift(from, -days);
  const previousTo = dateShift(from, -1);
  const [allCurrent, current, previous, campaignOptions, paidLeadFunnel, lastAdsScheduledRunAt] = await Promise.all([
    getGoogleAdsOverview(from, to, undefined, accountTimeZone),
    getGoogleAdsOverview(from, to, selectedCampaigns, accountTimeZone),
    compare
      ? getGoogleAdsOverview(previousFrom, previousTo, selectedCampaigns, accountTimeZone)
      : Promise.resolve(null),
    getGoogleAdsCampaigns(),
    getPaidGoogleLeadFunnel(from, to),
    getLastScheduledIntegrationRun("ads"),
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
  const chartData = toChartPoints(currentRows, from, to, interval, accountTimeZone);
  const campaigns = new Map<
    string,
    {
      id: string;
      name: string;
      status: string;
      clicks: number;
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
      clicks: 0,
      impressions: 0,
      cost: 0,
      conversions: 0,
      conversionValue: 0,
    };
    campaign.clicks += row.clicks;
    campaign.impressions += row.impressions;
    campaign.cost += Number(BigInt(row.costMicros)) / 1_000_000;
    campaign.conversions += Number(row.conversions);
    campaign.conversionValue += Number(row.conversionsValue);
    campaigns.set(row.campaignId, campaign);
  }
  const campaignRows = [...campaigns.values()]
    .filter((item) => !selectedCampaigns.length || selectedCampaigns.includes(item.id))
    .sort((a, b) => b.cost - a.cost);
  const periodLabel = `${dateLabel(from, accountTimeZone)}${from.slice(0, 4) !== to.slice(0, 4) ? ` ${from.slice(0, 4)}` : ""} sampai ${dateLabel(to, accountTimeZone)} ${to.slice(0, 4)} · ${days} hari kalender (${accountTimeZone})`;
  const reportingReady = isGoogleAdsOAuthConfigured() && isGoogleAdsReportingConfigured();
  const reportingIssues = getGoogleAdsReportingConfigurationIssues();
  const adsHealth = getIntegrationHealth({
    configured: Boolean(connection?.secretCiphertext),
    configurationReady: reportingReady,
    lastError: connection?.lastError,
    lastErrorCode: typeof metadata.lastErrorCode === "string" ? metadata.lastErrorCode : null,
    lastSyncAt: connection?.lastSyncAt,
    staleAfterHours: INTEGRATION_HEALTH_STALE_HOURS.googleAds,
  });
  const probeRequired = !isFreshGoogleAdsProbe(metadata);
  const adsSchedulerHealth = getSchedulerHealth(lastAdsScheduledRunAt, new Date(), 45);
  const visibleHealth = snapshotMode
    ? {
        level: snapshotFresh ? "healthy" : snapshotImportedAt ? "attention" : "disconnected",
        label: snapshotFresh
          ? "Snapshot production"
          : snapshotImportedAt
            ? "Snapshot perlu diperbarui"
            : "Snapshot belum diambil",
      }
    : adsHealth;
  const sourceStatus = snapshotImportedAt
    ? "Snapshot production diimpor " +
      new Date(snapshotImportedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) +
      " WIB" +
      (snapshotFresh ? "." : "; ambil ulang agar data terbaru.")
    : snapshotConfigured
      ? "Belum ada snapshot lokal. Administrator dapat mengambil laporan production sekarang."
      : "Sumber snapshot production belum disiapkan pada environment lokal.";
  const hasReportSource = snapshotMode || Boolean(connection?.secretCiphertext);

  return (
    <section className="admin-page marketing-page">
      <AdminPageHeader
        className="marketing-page__heading"
        title="Kinerja Iklan Google"
        description="Pantau klik, tayangan, biaya, dan konversi pada periode yang telah lengkap."
      />
      <MarketingWorkspaceNav current="/admin/marketing" />
      {!snapshotMode && process.env.NODE_ENV === "production" && adsSchedulerHealth.level !== "healthy" ? (
        <p className="integration-alert" role="alert">
          Scheduler Google Ads {adsSchedulerHealth.label.toLowerCase()}. {adsSchedulerHealth.summary}{" "}
          <Link href="/admin/settings/integrations">Periksa koneksi layanan.</Link>
        </p>
      ) : null}
      {params.synced ? (
        <p className="integration-success" role="status">
          Laporan Google Ads berhasil diperbarui untuk periode yang dipilih.
        </p>
      ) : null}
      {selectedValue(params.snapshot) === "1" ? (
        <p className="integration-success" role="status">
          Snapshot production berhasil disimpan pada database lokal.
        </p>
      ) : null}
      {selectedValue(params.snapshot) === "error" ? (
        <p className="integration-alert" role="alert">
          Snapshot production belum dapat diambil. Data lokal sebelumnya tetap dipertahankan.
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
          <span className={`integration-status is-${visibleHealth.level}`}>{visibleHealth.label}</span>
        </div>
        {hasReportSource ? (
          <>
            <GoogleAdsPerformance
              key={[today, from, to, interval, compare, selectedCampaigns.join(","), metrics.join(",")].join(":")}
              from={from}
              to={to}
              today={today}
              completeThrough={fallbackTo}
              campaigns={campaignOptions}
              selectedCampaigns={selectedCampaigns}
              initialMetrics={metrics}
              interval={interval}
              compare={compare}
              hasPreviousData={hasPreviousData}
              data={chartData}
              hasData={currentRows.length > 0}
              totals={totals}
              previousTotals={previousTotals}
              currency={current?.currencyCode ?? "IDR"}
              canManageReports={user.role === "admin" && reportingReady}
              probeRequired={probeRequired}
              accountTimeZone={accountTimeZone}
              dataSource={dataSource}
              canImportSnapshot={user.role === "admin" && snapshotConfigured}
              sourceStatus={sourceStatus}
            />
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
                        <th>Klik</th>
                        <th>Impresi</th>
                        <th>Rata-rata CPC</th>
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
                          <td>{number.format(campaign.clicks)}</td>
                          <td>{number.format(campaign.impressions)}</td>
                          <td>{money.format(averageCpc(campaign.cost, campaign.clicks))}</td>
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
                {snapshotMode ? (
                  snapshotSourceLastSyncAt ? (
                    <>
                      Sumber production terakhir sinkron{" "}
                      {new Date(snapshotSourceLastSyncAt).toLocaleString("id-ID", {
                        timeZone: "Asia/Jakarta",
                      })}{" "}
                      WIB.
                    </>
                  ) : (
                    "Snapshot belum memiliki waktu sinkron sumber."
                  )
                ) : connection?.lastSyncAt ? (
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
            {selectedValue(params.ads) ? (
              <p className="integration-alert" role="alert">
                {adsHealth.summary} {adsHealth.recovery}
              </p>
            ) : null}
            {!snapshotMode && !reportingReady ? (
              <p className="integration-alert" role="status">
                Laporan tersimpan tetap dapat dibaca, tetapi pembaruan dinonaktifkan sampai{" "}
                {reportingIssues.map((issue) => issue.label).join(", ")} lengkap.{" "}
                {user.role === "admin" ? <Link href="/admin/settings/integrations">Buka Koneksi layanan</Link> : null}
              </p>
            ) : null}
            {!snapshotMode && connection?.lastError ? (
              <p className="integration-alert">{connection.lastError}</p>
            ) : null}
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
          <p className="admin-eyebrow">BACA BERSAMA DATA WEBSITE</p>
          <h2>Klik iklan ke kunjungan</h2>
          <p>
            Laporan pengunjung membantu melihat perilaku di website. Tanpa atribusi terpisah, satu klik iklan belum
            dapat dipastikan menjadi prospek valid.
          </p>
        </div>
        <Link className="admin-primary-button" href="/admin/insights">
          Buka laporan pengunjung
        </Link>
      </article>
      <article className="marketing-lead-funnel" aria-labelledby="marketing-lead-funnel-title">
        <div>
          <p className="admin-eyebrow">KUALITAS LEAD DARI GOOGLE ADS</p>
          <h2 id="marketing-lead-funnel-title">Formulir ke penawaran</h2>
          <p>
            Hanya lead beratribusi Google Ads pada periode ini. Ubah status di Prospek agar angka iklan tidak disamakan
            dengan penjualan.
          </p>
        </div>
        {paidLeadFunnel ? (
          <dl>
            <div>
              <dt>Formulir</dt>
              <dd>{number.format(paidLeadFunnel.total)}</dd>
            </div>
            {(["qualified", "quoted", "won"] as const).map((status) => (
              <div key={status}>
                <dt>{prospectStatusLabel(status)}</dt>
                <dd>{number.format(paidLeadFunnel.counts[status])}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="marketing-lead-funnel__empty">Database belum terhubung; kualitas lead belum dapat dihitung.</p>
        )}
        <Link className="admin-secondary-button" href="/admin/prospects?origin=incoming">
          Tinjau prospek
        </Link>
      </article>
    </section>
  );
}
