"use client";

import { useSyncExternalStore } from "react";

type Point = { date: string; sessions: number; forms: number };
function subscribeViewport(listener: () => void) {
  const query = window.matchMedia("(max-width: 767px)");
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
const compactViewport = () => window.matchMedia("(max-width: 767px)").matches;
const serverViewport = () => false;
const compactValue = (value: number) =>
  value >= 1000
    ? new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(value)
    : String(value);
const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00+07:00`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Jakarta",
  });

export function VisitorDailyChart({ points }: { points: Point[] }) {
  const compactLayout = useSyncExternalStore(subscribeViewport, compactViewport, serverViewport);
  const hasData = points.some((point) => point.sessions || point.forms);
  const maximum = Math.max(1, ...points.flatMap((point) => [point.sessions, point.forms]));
  const width = compactLayout ? 380 : 900;
  const x = (index: number) => 40 + (index / Math.max(1, points.length - 1)) * (width - 75);
  const y = (value: number) => 210 - (value / maximum) * 160;
  const labelIndices = new Set([
    0,
    points.length - 1,
    ...points.map((_, index) => index).filter((index) => points.length <= 7 || index % 7 === 0),
  ]);
  if (points.length > 7 && points.length % 7 < 3) labelIndices.delete(Math.floor((points.length - 2) / 7) * 7);
  return (
    <section className="visitor-daily-card" aria-labelledby="visitor-daily-title">
      <header className="visitor-panel-heading">
        <div>
          <p className="eyebrow">Perubahan harian · WIB</p>
          <h2 id="visitor-daily-title">Kunjungan dan permintaan</h2>
        </div>
        <div className="visitor-chart-legend">
          <span>
            <i />
            Kunjungan
          </span>
          <span>
            <i />
            Permintaan valid
          </span>
        </div>
      </header>
      <p>Angka menunjukkan sesi kunjungan, bukan jumlah orang unik. Satu orang dapat membuka website beberapa kali.</p>
      {hasData ? (
        <div className="visitor-daily-plot">
          <svg
            viewBox={`0 0 ${width} 250`}
            role="img"
            aria-label="Grafik harian kunjungan dan permintaan valid. Semua nilai tersedia pada tabel di bawah."
          >
            {[...new Set([0, Math.ceil(maximum / 2), maximum])].map((tick) => (
              <g key={tick}>
                <line x1="40" x2={width - 35} y1={y(tick)} y2={y(tick)} className="visitor-chart-grid" />
                <text x="32" y={y(tick) + 5} textAnchor="end" className="visitor-chart-axis">
                  {compactValue(tick)}
                </text>
              </g>
            ))}
            {(["sessions", "forms"] as const).map((metric) => (
              <g key={metric} className={`visitor-chart-series visitor-chart-series--${metric}`}>
                <polyline points={points.map((point, index) => `${x(index)},${y(point[metric])}`).join(" ")} />
                {points.map((point, index) => (
                  <g key={point.date}>
                    {metric === "sessions" ? (
                      <circle cx={x(index)} cy={y(point[metric])} r="4" />
                    ) : (
                      <path d={`M${x(index)},${y(point[metric]) - 5}l5,5 -5,5 -5,-5Z`} />
                    )}
                    {(points.length <= 7 ||
                      index ===
                        points.findIndex(
                          (entry) => entry[metric] === Math.max(...points.map((point) => point[metric])),
                        ) ||
                      index === points.findLastIndex((entry) => entry[metric] > 0)) &&
                    point[metric] > 0 ? (
                      <text x={x(index)} y={y(point[metric]) + (metric === "sessions" ? -12 : 22)} textAnchor="middle">
                        {compactValue(point[metric])}
                      </text>
                    ) : null}
                  </g>
                ))}
              </g>
            ))}
            {points.map((point, index) =>
              labelIndices.has(index) ? (
                <text key={point.date} x={x(index)} y="242" textAnchor="middle" className="visitor-chart-axis">
                  {dateLabel(point.date)}
                </text>
              ) : null,
            )}
          </svg>
        </div>
      ) : (
        <p className="empty-copy">Belum ada kunjungan pada periode ini. Grafik akan tampil setelah data tersedia.</p>
      )}
      <details className="visitor-daily-table" open>
        <summary>Angka setiap hari · {points.length} tanggal</summary>
        <div>
          <table>
            <caption>Rincian harian sesuai periode dan filter aktif</caption>
            <thead>
              <tr>
                <th scope="col">Tanggal</th>
                <th scope="col">Kunjungan</th>
                <th scope="col">Permintaan valid</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.date}>
                  <th scope="row">{dateLabel(point.date)}</th>
                  <td>{point.sessions.toLocaleString("id-ID")}</td>
                  <td>{point.forms.toLocaleString("id-ID")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
