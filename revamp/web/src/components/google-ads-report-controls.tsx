"use client";

import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  refreshGoogleAdsRange,
  refreshGoogleAdsSnapshot,
  runGoogleAdsAccessProbe,
} from "@/features/integrations/actions";
import type { GoogleAdsDataSource } from "@/features/integrations/google-ads-config";
import type { AdsMetric } from "./google-ads-trend-chart";

type Campaign = { id: string; name: string; status: string };
type Props = {
  from: string;
  to: string;
  today: string;
  completeThrough: string;
  campaigns: Campaign[];
  selectedCampaigns: string[];
  metrics: AdsMetric[];
  interval: "daily" | "weekly" | "monthly";
  compare: boolean;
  canManageReports: boolean;
  probeRequired: boolean;
  accountTimeZone: string;
  dataSource: GoogleAdsDataSource;
  canImportSnapshot: boolean;
  sourceStatus: string;
};

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function RefreshReportButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="admin-primary-button ads-report-submit" type="submit" disabled={pending || disabled}>
      {pending ? "Memperbarui laporan…" : "Perbarui laporan sekarang"}
    </button>
  );
}

function RefreshSnapshotButton() {
  const { pending } = useFormStatus();
  return (
    <button className="admin-primary-button ads-report-submit" type="submit" disabled={pending} aria-busy={pending}>
      {pending ? "Mengambil snapshot…" : "Ambil snapshot production"}
    </button>
  );
}

export function GoogleAdsReportControls(props: Props) {
  const [from, setFrom] = useState(props.from);
  const [to, setTo] = useState(props.to);
  const [campaigns, setCampaigns] = useState(props.selectedCampaigns);
  const [interval, setInterval] = useState(props.interval);
  const [compare, setCompare] = useState(props.compare);
  const [probePending, startProbe] = useTransition();
  const [probeResult, setProbeResult] = useState<string | null>(null);
  const router = useRouter();
  const campaignParam = campaigns.join(",");
  const metricsParam = props.metrics.join(",");
  const shift = (direction: -1 | 1) => {
    const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
    const nextFrom = shiftDate(from, days * direction);
    const nextTo = shiftDate(to, days * direction);
    if (nextTo <= props.today) {
      setFrom(nextFrom);
      setTo(nextTo);
    }
  };
  const choosePreset = (days: number) => {
    const nextTo = props.completeThrough;
    const nextFrom = shiftDate(nextTo, -(days - 1));
    setFrom(nextFrom);
    setTo(nextTo);
  };
  const toggleCampaign = (id: string) =>
    setCampaigns((current) => {
      const selected = current.length ? current : props.campaigns.map((campaign) => campaign.id);
      const next = selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];
      if (!next.length) return current;
      return next.length === props.campaigns.length ? [] : next;
    });
  const query = new URLSearchParams({ from, to, interval, compare: compare ? "1" : "0" });
  if (campaigns.length) query.set("campaigns", campaignParam);
  if (props.metrics.length) query.set("metrics", metricsParam);
  const exportHref = `/api/admin/marketing/google-ads/export?${query.toString()}`;

  function verifyAccess() {
    setProbeResult(null);
    startProbe(async () => {
      const result = await runGoogleAdsAccessProbe();
      setProbeResult(result.message);
      router.refresh();
    });
  }

  return (
    <div className="ads-report-controls">
      <form className="ads-report-filter" action="/admin/marketing" method="get">
        <input type="hidden" name="campaigns" value={campaignParam} />
        <input type="hidden" name="metrics" value={metricsParam} />
        <input type="hidden" name="interval" value={interval} />
        <input type="hidden" name="compare" value={compare ? "1" : "0"} />
        <div className="ads-report-filter__period">
          <div className="ads-report-presets" aria-label="Pilih periode laporan">
            {[7, 30, 90].map((days) => (
              <button
                key={days}
                type="button"
                aria-pressed={
                  to === props.completeThrough &&
                  Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) === (days - 1) * 86_400_000
                }
                onClick={() => choosePreset(days)}
              >
                {days} hari
              </button>
            ))}
          </div>
          <label>
            Dari
            <input
              type="date"
              name="from"
              value={from}
              max={to}
              required
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label>
            Sampai
            <input
              type="date"
              name="to"
              value={to}
              min={from}
              max={props.today}
              required
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
          <button className="admin-secondary-button ads-report-submit" type="submit">
            Terapkan filter
          </button>
          <div className="ads-report-shift" aria-label="Geser periode">
            <button type="button" aria-label="Periode sebelumnya" onClick={() => shift(-1)}>
              ‹
            </button>
            <button type="button" aria-label="Periode berikutnya" disabled={to >= props.today} onClick={() => shift(1)}>
              ›
            </button>
          </div>
        </div>
        <div className="ads-report-filter__options">
          <details className="ads-report-campaigns">
            <summary>Kampanye: {campaigns.length ? `${campaigns.length} dipilih` : "Semua kampanye"}</summary>
            <div className="ads-report-campaigns__menu">
              <label>
                <input type="checkbox" checked={!campaigns.length} onChange={() => setCampaigns([])} />
                Semua kampanye
              </label>
              {props.campaigns.map((campaign) => (
                <label key={campaign.id}>
                  <input
                    type="checkbox"
                    checked={!campaigns.length || campaigns.includes(campaign.id)}
                    onChange={() => toggleCampaign(campaign.id)}
                  />
                  <span>
                    {campaign.name}
                    <small>{campaign.status}</small>
                  </span>
                </label>
              ))}
              {!props.campaigns.length ? <p>Kampanye akan muncul setelah laporan diambil.</p> : null}
            </div>
          </details>
          <label className="ads-report-select">
            Tampilan
            <select value={interval} onChange={(event) => setInterval(event.target.value as typeof interval)}>
              <option value="daily">Harian</option>
              <option value="weekly">Mingguan</option>
              <option value="monthly">Bulanan</option>
            </select>
          </label>
          <label className="ads-report-compare">
            <input type="checkbox" checked={compare} onChange={(event) => setCompare(event.target.checked)} />
            Bandingkan periode sebelumnya
          </label>
        </div>
        <div className="ads-report-actions">
          <a className="admin-secondary-button" href={exportHref}>
            Unduh CSV
          </a>
        </div>
      </form>
      {props.dataSource === "snapshot" ? (
        <div className="ads-report-provider-actions">
          {props.canImportSnapshot ? (
            <form action={refreshGoogleAdsSnapshot}>
              <RefreshSnapshotButton />
            </form>
          ) : null}
          <span aria-live="polite" className="ads-report-provider-actions__status" role="status">
            {props.sourceStatus}
          </span>
        </div>
      ) : props.canManageReports ? (
        <div className="ads-report-provider-actions">
          <button className="admin-secondary-button" type="button" disabled={probePending} onClick={verifyAccess}>
            {probePending ? "Memverifikasi akses…" : "Verifikasi akses API"}
          </button>
          <form action={refreshGoogleAdsRange}>
            <input type="hidden" name="from" value={from} />
            <input type="hidden" name="to" value={to} />
            <input type="hidden" name="campaigns" value={campaignParam} />
            <input type="hidden" name="metrics" value={metricsParam} />
            <input type="hidden" name="interval" value={interval} />
            <input type="hidden" name="compare" value={compare ? "1" : "0"} />
            <RefreshReportButton disabled={props.probeRequired} />
          </form>
          <span aria-live="polite" className="ads-report-provider-actions__status" role="status">
            {probeResult ??
              (props.probeRequired
                ? "Verifikasi akses API terlebih dahulu sebelum laporan dapat diperbarui."
                : `Akun Google Ads menggunakan zona waktu ${props.accountTimeZone}.`)}
          </span>
        </div>
      ) : (
        <p className="ads-report-provider-actions__status">
          Hanya administrator yang dapat memverifikasi akses atau memperbarui laporan.
        </p>
      )}
    </div>
  );
}
