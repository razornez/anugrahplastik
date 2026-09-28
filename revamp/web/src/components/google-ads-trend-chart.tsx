"use client";

import { useRef, useState } from "react";

export type AdsMetric = "impressions" | "cost" | "conversions" | "conversionValue";
export type AdsPoint = { date: string; label: string; values: Record<AdsMetric, number> };

const metricMeta: Record<AdsMetric, { label: string; color: string; dash: string }> = {
  impressions: { label: "Impresi", color: "#1967d2", dash: "" },
  cost: { label: "Biaya", color: "#d93025", dash: "7 4" },
  conversions: { label: "Konversi", color: "#f9ab00", dash: "2 4" },
  conversionValue: { label: "Nilai konversi", color: "#188038", dash: "10 4 2 4" },
};

const number = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
const allMetrics: AdsMetric[] = ["impressions", "cost", "conversions", "conversionValue"];

export function GoogleAdsTrendChart({
  data,
  metrics,
  currency = "IDR",
}: {
  data: AdsPoint[];
  metrics: AdsMetric[];
  currency?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const currentIndex = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const [keyboardSelection, setKeyboardSelection] = useState(false);
  const money = new Intl.NumberFormat("id-ID", { style: "currency", currency, maximumFractionDigits: 0 });
  const format = (key: AdsMetric, value: number) =>
    key === "cost" || key === "conversionValue" ? money.format(value) : number.format(value);
  const width = 1000;
  const height = 260;
  const pad = { top: 18, right: 14, bottom: 30, left: 14 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const selectIndex = (index: number | null) => {
    const next = index === null ? null : Math.max(0, Math.min(data.length - 1, index));
    if (currentIndex.current === next) return;
    currentIndex.current = next;
    setActiveIndex(next);
  };
  const indexFromPointer = (clientX: number, target: SVGSVGElement) => {
    if (data.length <= 1) return 0;
    const rect = target.getBoundingClientRect();
    if (!rect.width) return 0;
    const viewBoxX = ((clientX - rect.left) / rect.width) * width;
    const fraction = (viewBoxX - pad.left) / plotWidth;
    return Math.round(Math.max(0, Math.min(1, fraction)) * (data.length - 1));
  };
  const activePoint = activeIndex === null ? null : data[activeIndex];
  const activeDateLabel = activePoint
    ? activePoint.date.length === 7
      ? activePoint.label
      : `${activePoint.label}, ${activePoint.date.slice(0, 4)}`
    : "";
  const markerInterval = Math.max(1, Math.ceil(data.length / 36));
  const series = metrics.map((key) => {
    const max = Math.max(0, ...data.map((point) => point.values[key]));
    const path = data
      .map((point, index) => {
        const x = pad.left + (data.length <= 1 ? plotWidth / 2 : (index / (data.length - 1)) * plotWidth);
        const y = pad.top + (max === 0 ? plotHeight : 1 - point.values[key] / max) * plotHeight;
        return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
    return { key, max, path };
  });

  const chart = (
    <div className="ads-chart__plot" role="group" aria-label="Grafik tren metrik Google Ads">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="application"
        aria-label="Grafik tren Google Ads. Gunakan tombol panah untuk berpindah tanggal, Home untuk tanggal pertama, dan End untuk tanggal terakhir."
        tabIndex={data.length ? 0 : -1}
        onFocus={() => {
          if (currentIndex.current === null && data.length) selectIndex(0);
          setKeyboardSelection(true);
        }}
        onBlur={() => {
          setKeyboardSelection(false);
          if (!pinned) selectIndex(null);
        }}
        onKeyDown={(event) => {
          if (!data.length) return;
          let next: number | null = null;
          if (event.key === "ArrowRight" || event.key === "ArrowUp") next = (currentIndex.current ?? 0) + 1;
          if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = (currentIndex.current ?? 0) - 1;
          if (event.key === "Home") next = 0;
          if (event.key === "End") next = data.length - 1;
          if (next !== null) {
            event.preventDefault();
            setPinned(false);
            setKeyboardSelection(true);
            selectIndex(next);
          }
        }}
        onPointerMove={(event) => {
          if (event.pointerType === "touch") return;
          setPinned(false);
          setKeyboardSelection(false);
          selectIndex(indexFromPointer(event.clientX, event.currentTarget));
        }}
        onPointerDown={(event) => {
          if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
          setPinned(true);
          setKeyboardSelection(false);
          selectIndex(indexFromPointer(event.clientX, event.currentTarget));
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "touch" || pinned) return;
          selectIndex(null);
        }}
      >
        {[0, 0.5, 1].map((fraction) => {
          const y = pad.top + fraction * plotHeight;
          return (
            <line key={fraction} x1={pad.left} x2={width - pad.right} y1={y} y2={y} className="ads-chart__gridline" />
          );
        })}
        {series.map(({ key, path }) => (
          <path
            key={key}
            d={path}
            fill="none"
            stroke={metricMeta[key].color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={metricMeta[key].dash || undefined}
          />
        ))}
        {series.map(({ key, max }) =>
          data.map((point, index) => {
            if (index % markerInterval !== 0 && index !== data.length - 1) return null;
            const x = pad.left + (data.length <= 1 ? plotWidth / 2 : (index / (data.length - 1)) * plotWidth);
            const y = pad.top + (max === 0 ? plotHeight : 1 - point.values[key] / max) * plotHeight;
            return (
              <circle
                key={`${key}-${point.date}`}
                cx={x}
                cy={y}
                r="4"
                fill={metricMeta[key].color}
                className="ads-chart__point"
              />
            );
          }),
        )}
        {activePoint && activeIndex !== null && (
          <g className="ads-chart__cursor" aria-hidden="true">
            <line
              x1={pad.left + (data.length <= 1 ? plotWidth / 2 : (activeIndex / (data.length - 1)) * plotWidth)}
              x2={pad.left + (data.length <= 1 ? plotWidth / 2 : (activeIndex / (data.length - 1)) * plotWidth)}
              y1={pad.top}
              y2={height - pad.bottom}
            />
            {series.map(({ key, max }) => {
              const x = pad.left + (data.length <= 1 ? plotWidth / 2 : (activeIndex / (data.length - 1)) * plotWidth);
              const y = pad.top + (max === 0 ? plotHeight : 1 - activePoint.values[key] / max) * plotHeight;
              return <circle key={key} cx={x} cy={y} r="6" fill={metricMeta[key].color} />;
            })}
          </g>
        )}
      </svg>
      {activePoint && (
        <div className="ads-chart__tooltip" aria-hidden="true">
          <strong>{activeDateLabel}</strong>
          <dl>
            {allMetrics.map((key) => (
              <div key={key}>
                <dt>
                  <i style={{ backgroundColor: metricMeta[key].color }} />
                  {metricMeta[key].label}
                </dt>
                <dd>{format(key, activePoint.values[key])}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <div className="ads-chart__dates" aria-hidden="true">
        <span>{data[0]?.label ?? "—"}</span>
        <span>{data[Math.floor((data.length - 1) / 2)]?.label ?? "—"}</span>
        <span>{data.at(-1)?.label ?? "—"}</span>
      </div>
      {keyboardSelection && activePoint && (
        <span className="ads-chart__sr-only" aria-live="polite" aria-atomic="true">
          {activeDateLabel}.{" "}
          {allMetrics.map((key) => `${metricMeta[key].label}: ${format(key, activePoint.values[key])}`).join(". ")}
        </span>
      )}
    </div>
  );

  return (
    <section className="ads-chart" aria-label="Grafik kinerja Google Ads">
      <div className="ads-chart__header">
        <div className="ads-chart__legend" aria-label="Legenda grafik">
          {metrics.map((key) => (
            <span key={key}>
              <i
                aria-hidden="true"
                style={{
                  borderColor: metricMeta[key].color,
                  borderTopStyle: metricMeta[key].dash ? "dashed" : "solid",
                }}
              />
              {metricMeta[key].label}
            </span>
          ))}
        </div>
        <button type="button" className="admin-secondary-button" onClick={() => dialog.current?.showModal()}>
          Perluas grafik
        </button>
      </div>
      {chart}
      <p className="ads-chart__note">
        Setiap garis menunjukkan perubahan relatif. Arahkan kursor, ketuk grafik, atau gunakan tombol panah untuk
        melihat semua angka pada tanggal tersebut. Tabel tetap tersedia sebagai alternatif.
      </p>
      <details className="ads-chart__table">
        <summary>Lihat angka grafik</summary>
        <div className="ads-chart__table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tanggal</th>
                {metrics.map((key) => (
                  <th key={key}>{metricMeta[key].label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((point) => (
                <tr key={point.date}>
                  <th scope="row">{point.label}</th>
                  {metrics.map((key) => (
                    <td key={key}>{format(key, point.values[key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <dialog
        className="ads-chart__dialog"
        ref={dialog}
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
      >
        <div className="ads-chart__dialog-head">
          <strong>Tren performa Google Ads</strong>
          <button type="button" className="admin-secondary-button" onClick={() => dialog.current?.close()}>
            Tutup
          </button>
        </div>
        {chart}
      </dialog>
    </section>
  );
}
