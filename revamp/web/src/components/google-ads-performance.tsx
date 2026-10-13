"use client";

import { useState } from "react";
import { adsMetricOptions, type AdsMetric } from "@/features/integrations/google-ads-report-model";
import type { GoogleAdsDataSource } from "@/features/integrations/google-ads-config";
import { GoogleAdsReportControls } from "./google-ads-report-controls";
import { GoogleAdsTrendChart, type AdsPoint } from "./google-ads-trend-chart";

const labels: Record<AdsMetric, string> = {
  clicks: "Klik",
  impressions: "Impresi",
  averageCpc: "Rata-rata CPC",
  cost: "Biaya",
  conversions: "Konversi",
  conversionValue: "Nilai konversi",
};
const number = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

type Props = {
  from: string;
  to: string;
  today: string;
  completeThrough: string;
  campaigns: { id: string; name: string; status: string }[];
  selectedCampaigns: string[];
  initialMetrics: AdsMetric[];
  interval: "daily" | "weekly" | "monthly";
  compare: boolean;
  hasPreviousData: boolean;
  data: AdsPoint[];
  hasData: boolean;
  totals: Record<AdsMetric, number>;
  previousTotals: Record<AdsMetric, number>;
  currency: string;
  canManageReports: boolean;
  probeRequired: boolean;
  accountTimeZone: string;
  dataSource: GoogleAdsDataSource;
  canImportSnapshot: boolean;
  sourceStatus: string;
};

export function GoogleAdsPerformance(props: Props) {
  const [metrics, setMetrics] = useState(props.initialMetrics);
  const money = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: props.currency,
    maximumFractionDigits: 0,
  });
  const format = (metric: AdsMetric, value: number) =>
    metric === "cost" || metric === "averageCpc" || metric === "conversionValue"
      ? money.format(value)
      : number.format(value);

  function selectMetric(index: number, metric: AdsMetric) {
    if (metrics.some((item, itemIndex) => itemIndex !== index && item === metric)) return;
    const next = metrics.map((item, itemIndex) => (itemIndex === index ? metric : item));
    setMetrics(next);
    const url = new URL(window.location.href);
    url.searchParams.set("metrics", next.join(","));
    window.history.replaceState(null, "", url);
  }

  return (
    <div className="ads-performance">
      <GoogleAdsReportControls
        from={props.from}
        to={props.to}
        today={props.today}
        completeThrough={props.completeThrough}
        campaigns={props.campaigns}
        selectedCampaigns={props.selectedCampaigns}
        metrics={metrics}
        interval={props.interval}
        compare={props.compare}
        canManageReports={props.canManageReports}
        probeRequired={props.probeRequired}
        accountTimeZone={props.accountTimeZone}
        dataSource={props.dataSource}
        canImportSnapshot={props.canImportSnapshot}
        sourceStatus={props.sourceStatus}
      />
      <section className="ads-performance__summary" aria-label="Empat metrik kinerja iklan">
        {metrics.map((metric, index) => {
          const delta = props.totals[metric] - props.previousTotals[metric];
          return (
            <div className={`ads-performance__tile ads-performance__tile--${index + 1}`} key={index}>
              <label htmlFor={`ads-metric-${index}`}>Metrik {index + 1}</label>
              <select
                id={`ads-metric-${index}`}
                value={metric}
                aria-label={`Metrik kartu ${index + 1}`}
                onChange={(event) => selectMetric(index, event.target.value as AdsMetric)}
              >
                {adsMetricOptions.map((option) => (
                  <option
                    key={option}
                    value={option}
                    disabled={metrics.some((item, itemIndex) => itemIndex !== index && item === option)}
                  >
                    {labels[option]}
                  </option>
                ))}
              </select>
              <strong>{format(metric, props.totals[metric])}</strong>
              <small>
                {props.compare && props.hasPreviousData
                  ? `${delta > 0 ? "+" : delta < 0 ? "−" : "="}${format(metric, Math.abs(delta))} dari periode sebelumnya`
                  : props.compare
                    ? "Belum ada data pembanding"
                    : "Pada periode terpilih"}
              </small>
            </div>
          );
        })}
      </section>
      {props.hasData ? (
        <GoogleAdsTrendChart data={props.data} metrics={metrics} currency={props.currency} />
      ) : (
        <div className="ads-performance__empty" role="status">
          <strong>Belum ada laporan pada periode ini</strong>
          <p>Data akan tampil setelah pembaruan selesai. Jika tetap kosong, periksa periode atau pilihan kampanye.</p>
        </div>
      )}
    </div>
  );
}
