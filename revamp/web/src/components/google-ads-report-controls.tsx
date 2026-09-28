"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { refreshGoogleAdsRange } from "@/features/integrations/actions";
import type { AdsMetric } from "./google-ads-trend-chart";

type Campaign = { id: string; name: string; status: string };
type Props = {
  from: string;
  to: string;
  today: string;
  campaigns: Campaign[];
  selectedCampaigns: string[];
  metrics: AdsMetric[];
  interval: "daily" | "weekly" | "monthly";
  compare: boolean;
};

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function ApplyReportButton() {
  const { pending } = useFormStatus();
  return (
    <button className="admin-primary-button ads-report-submit" type="submit" disabled={pending}>
      {pending ? "Mengambil laporan…" : "Terapkan & ambil laporan"}
    </button>
  );
}

export function GoogleAdsReportControls(props: Props) {
  const [from, setFrom] = useState(props.from);
  const [to, setTo] = useState(props.to);
  const [campaigns, setCampaigns] = useState(props.selectedCampaigns);
  const [metrics, setMetrics] = useState<AdsMetric[]>(props.metrics);
  const [interval, setInterval] = useState(props.interval);
  const [compare, setCompare] = useState(props.compare);
  const campaignParam = campaigns.join(",");
  const metricsParam = metrics.join(",");
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
    const nextTo = props.today;
    const nextFrom = shiftDate(nextTo, -(days - 1));
    setFrom(nextFrom);
    setTo(nextTo);
  };
  const toggleCampaign = (id: string) =>
    setCampaigns((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      return next.length === props.campaigns.length ? [] : next;
    });
  const toggleMetric = (key: AdsMetric) =>
    setMetrics((current) => {
      if (current.includes(key)) return current.length > 1 ? current.filter((item) => item !== key) : current;
      return [...current, key];
    });
  const query = new URLSearchParams({ from, to, interval, compare: compare ? "1" : "0" });
  if (campaigns.length) query.set("campaigns", campaignParam);
  if (metrics.length) query.set("metrics", metricsParam);
  const exportHref = `/api/admin/marketing/google-ads/export?${query.toString()}`;

  return (
    <div className="ads-report-controls">
      <form className="ads-report-filter" action={refreshGoogleAdsRange}>
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
                  to === props.today &&
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
          <ApplyReportButton />
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
          <fieldset>
            <legend>Metrik grafik</legend>
            {(["impressions", "cost", "conversions", "conversionValue"] as AdsMetric[]).map((key) => (
              <label key={key}>
                <input type="checkbox" checked={metrics.includes(key)} onChange={() => toggleMetric(key)} />
                {
                  { impressions: "Impresi", cost: "Biaya", conversions: "Konversi", conversionValue: "Nilai konversi" }[
                    key
                  ]
                }
              </label>
            ))}
          </fieldset>
          <a className="admin-secondary-button" href={exportHref}>
            Unduh CSV
          </a>
        </div>
      </form>
    </div>
  );
}
