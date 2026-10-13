"use client";

import Link from "next/link";
import { useState } from "react";
import shapes from "@/features/analytics/map-data/shapes.json";
import { layoutMapMarkers, type GeographyBucket, type MapExtent } from "@/features/analytics/visitor-report-model";

type MapBucket = GeographyBucket & { href: string | null };
type Props = {
  buckets: MapBucket[];
  extent: MapExtent;
  indonesiaHref: string;
  worldHref: string;
  summary: { total: number; indonesia: number; overseas: number; unknown: number; unmapped: number };
};
const number = (value: number) => value.toLocaleString("id-ID");

export function VisitorGeographyMap({ buckets, extent, indonesiaHref, worldHref, summary }: Props) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const selected = buckets.find((bucket) => bucket.key === selectedKey);
  const maximum = Math.max(1, ...buckets.map((bucket) => bucket.total));
  const mapped = layoutMapMarkers(buckets, extent);
  function reset() {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }
  function pan(x: number, y: number) {
    setOffset((current) => ({
      x: Math.max(-450 * (zoom - 1), Math.min(450 * (zoom - 1), current.x + x)),
      y: Math.max(-200 * (zoom - 1), Math.min(200 * (zoom - 1), current.y + y)),
    }));
  }

  return (
    <section className="visitor-map-card" aria-labelledby="visitor-map-title">
      <header className="visitor-panel-heading">
        <div>
          <p className="eyebrow">Sebaran kunjungan</p>
          <h2 id="visitor-map-title">Perangkat pengunjung</h2>
        </div>
        <nav className="period-switch" aria-label="Cakupan peta">
          <Link href={indonesiaHref} aria-current={extent === "indonesia" ? "page" : undefined}>
            Indonesia
          </Link>
          <Link href={worldHref} aria-current={extent === "world" ? "page" : undefined}>
            Dunia
          </Link>
        </nav>
      </header>
      <p className="visitor-map-description">
        Perkiraan wilayah dari jaringan pengunjung, bukan lokasi persis seseorang.
      </p>
      <div className="visitor-map-layout">
        <div className="visitor-map-visual">
          <div className="visitor-map-canvas">
            <svg
              viewBox="0 0 900 400"
              role="group"
              aria-label={`Peta ${extent === "indonesia" ? "Indonesia" : "dunia"}. Angka lengkap dan pemilihan wilayah tersedia pada daftar di bawah.`}
            >
              <defs>
                <pattern id="visitor-map-grid" width="32" height="32" patternUnits="userSpaceOnUse">
                  <circle cx="1" cy="1" r="1" />
                </pattern>
              </defs>
              <rect width="900" height="400" fill="url(#visitor-map-grid)" className="visitor-map-grid" />
              <g transform={`translate(${450 + offset.x} ${200 + offset.y}) scale(${zoom}) translate(-450 -200)`}>
                {extent === "indonesia" ? (
                  <path d={shapes.indonesia} className="visitor-map-land" />
                ) : (
                  shapes.world.map((country) => (
                    <path key={country.name} d={country.path} className="visitor-map-land" />
                  ))
                )}
                {mapped.map((bucket) => {
                  const [x, y] = bucket.position;
                  const radius = 11 + Math.sqrt(bucket.total / maximum) * 13;
                  return (
                    <g
                      key={bucket.key}
                      transform={`translate(${x} ${y})`}
                      className="visitor-map-marker"
                      data-selected={selected?.key === bucket.key}
                      role="button"
                      tabIndex={0}
                      aria-label={`${bucket.label}: ${number(bucket.total)} kunjungan. Buka rincian wilayah.`}
                      aria-pressed={selected?.key === bucket.key}
                      onClick={() => setSelectedKey(bucket.key)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedKey(bucket.key);
                        }
                      }}
                    >
                      <line
                        x1={bucket.anchor[0] - x}
                        y1={bucket.anchor[1] - y}
                        x2="0"
                        y2="0"
                        className="visitor-map-connector"
                      />
                      <title>
                        {bucket.label}: {number(bucket.total)} kunjungan
                      </title>
                      <circle r={radius + 7} className="visitor-map-halo" />
                      <circle r={radius} />
                      <text textAnchor="middle" dominantBaseline="central">
                        {number(bucket.total)}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
            {!mapped.length ? (
              <div className="visitor-map-no-data">
                <strong>
                  {summary.total ? "Lokasi belum dapat ditampilkan di peta" : "Belum ada kunjungan pada periode ini"}
                </strong>
                <span>
                  {summary.total
                    ? "Lihat wilayah yang tersedia di daftar, atau pilih cakupan Dunia."
                    : "Peta akan terisi setelah ada kunjungan yang tercatat."}
                </span>
              </div>
            ) : null}
          </div>
          <div className="visitor-map-toolbar" aria-label="Kontrol peta">
            <div>
              <button
                type="button"
                aria-label="Perbesar peta"
                disabled={zoom >= 3}
                onClick={() => setZoom((value) => Math.min(3, value + 0.5))}
              >
                +
              </button>
              <button
                type="button"
                aria-label="Perkecil peta"
                disabled={zoom <= 1}
                onClick={() => {
                  setZoom((value) => Math.max(1, value - 0.5));
                  setOffset({ x: 0, y: 0 });
                }}
              >
                −
              </button>
              <button type="button" onClick={reset}>
                Reset
              </button>
            </div>
            <div aria-label="Geser peta">
              <button type="button" aria-label="Geser peta ke kiri" disabled={zoom === 1} onClick={() => pan(80, 0)}>
                ←
              </button>
              <button type="button" aria-label="Geser peta ke atas" disabled={zoom === 1} onClick={() => pan(0, 60)}>
                ↑
              </button>
              <button type="button" aria-label="Geser peta ke bawah" disabled={zoom === 1} onClick={() => pan(0, -60)}>
                ↓
              </button>
              <button type="button" aria-label="Geser peta ke kanan" disabled={zoom === 1} onClick={() => pan(-80, 0)}>
                →
              </button>
            </div>
          </div>
          <p className="visitor-map-legend">
            <span aria-hidden="true" />
            Angka = kunjungan · lingkaran lebih besar = lebih banyak kunjungan
          </p>
        </div>
        <div className="visitor-region-panel">
          <div className="visitor-region-heading">
            <h3>{extent === "indonesia" ? "Provinsi pengunjung" : "Negara pengunjung"}</h3>
            <span>{buckets.length} wilayah</span>
          </div>
          {buckets.length ? (
            <ol className="visitor-region-list">
              {buckets.map((bucket, index) => (
                <li key={bucket.key}>
                  <button
                    type="button"
                    aria-pressed={selected?.key === bucket.key}
                    onClick={() => setSelectedKey(bucket.key)}
                  >
                    <span className="visitor-region-rank" aria-hidden="true">
                      {index + 1}
                    </span>
                    <span className="visitor-region-name">
                      {bucket.label}
                      <span className="visitor-region-track" aria-hidden="true">
                        <span style={{ width: `${(bucket.total / maximum) * 100}%` }} />
                      </span>
                    </span>
                    <strong>
                      {number(bucket.total)}
                      <small>kunjungan</small>
                    </strong>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-copy">Belum ada wilayah yang cocok dengan filter ini.</p>
          )}
        </div>
      </div>
      {selected ? (
        <section className="visitor-region-detail" aria-label="Rincian wilayah yang dipilih" aria-live="polite">
          <div>
            <span className="eyebrow">Wilayah terpilih</span>
            <h3>{selected.label}</h3>
            <p>
              {number(selected.total)} kunjungan · {number(selected.forms)} permintaan valid tercatat
            </p>
          </div>
          <ul>
            {selected.cities.slice(0, 5).map((city) => (
              <li key={city.label}>
                <span>{city.label}</span>
                <strong>{number(city.total)}</strong>
              </li>
            ))}
          </ul>
          <div>
            {selected.href ? (
              <Link className="visitor-primary-link" href={selected.href}>
                Tampilkan kunjungan wilayah ini →
              </Link>
            ) : (
              <p>Lokasinya belum cukup lengkap untuk dijadikan filter.</p>
            )}
            <button type="button" className="visitor-text-button" onClick={() => setSelectedKey(null)}>
              Tutup rincian
            </button>
          </div>
        </section>
      ) : (
        <p className="visitor-map-hint">Pilih wilayah di peta atau daftar untuk melihat kota dan rincian angkanya.</p>
      )}
      <div className="visitor-map-summary">
        <span>
          <strong>{number(summary.indonesia)}</strong> Indonesia
        </span>
        <span>
          <strong>{number(summary.overseas)}</strong> luar Indonesia
        </span>
        <span>
          <strong>{number(summary.unknown)}</strong> negara belum diketahui
        </span>
        {summary.unmapped ? (
          <span>
            <strong>{number(summary.unmapped)}</strong> provinsi belum terpetakan
          </span>
        ) : null}
      </div>
      <details className="visitor-map-attribution">
        <summary>Sumber dan batas ketepatan peta</summary>
        <p>
          Siluet:{" "}
          <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener noreferrer">
            Natural Earth
          </a>{" "}
          (public domain). Titik referensi:{" "}
          <a href="https://www.geoboundaries.org/" target="_blank" rel="noopener noreferrer">
            geoBoundaries / OpenStreetMap, Wambacher
          </a>{" "}
          (ODbL 1.0; katalog wilayah 2017). Titik hanya mewakili wilayah; provinsi yang tidak cocok dengan katalog tidak
          diberi titik tebakan.
        </p>
      </details>
    </section>
  );
}
