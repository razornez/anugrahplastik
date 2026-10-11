"use client";

import { useRef } from "react";

type Props = {
  days: number;
  device: string;
  city: string;
  source: string;
  outcome: string;
  cities: string[];
  sources: string[];
  activeCount: number;
  extent?: string;
  country?: string;
  region?: string;
  countries?: string[];
  regions?: string[];
};

export function VisitorFilterPanel({
  days,
  device,
  city,
  source,
  outcome,
  cities,
  sources,
  activeCount,
  extent = "indonesia",
  country = "",
  region = "",
  countries = [],
  regions = [],
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fields = (
    <>
      <input type="hidden" name="days" value={days} />
      <input type="hidden" name="map" value={extent} />
      <label>
        Perangkat
        <select name="device" defaultValue={device}>
          <option value="all">Semua perangkat</option>
          <option value="mobile">Ponsel</option>
          <option value="desktop">Komputer</option>
          <option value="tablet">Tablet</option>
          <option value="unknown">Tidak diketahui</option>
        </select>
      </label>
      <label>
        Negara
        <select name="country" defaultValue={country}>
          <option value="">Semua negara</option>
          {[...new Set([...countries, country].filter(Boolean))].map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      <label>
        Provinsi / wilayah
        <select name="region" defaultValue={region}>
          <option value="">Semua wilayah</option>
          {[...new Set([...regions, region].filter(Boolean))].map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      <label>
        Kota
        <select name="city" defaultValue={city}>
          <option value="">Semua lokasi</option>
          {cities.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      <label>
        Sumber
        <select name="source" defaultValue={source}>
          <option value="">Semua sumber</option>
          {sources.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      <label>
        Hasil kunjungan
        <select name="outcome" defaultValue={outcome}>
          <option value="">Semua hasil</option>
          <option value="Form terkirim">Mengirim formulir</option>
          <option value="Klik WhatsApp">Klik WhatsApp</option>
          <option value="Form mulai diisi">Form mulai diisi</option>
          <option value="Tombol minat diklik">Tombol minat diklik</option>
          <option value="Melihat halaman">Melihat halaman</option>
        </select>
      </label>
      <button type="submit">Terapkan filter</button>
    </>
  );

  return (
    <div className="visitor-filter-panel">
      <form className="visitor-filters visitor-filter-panel__inline" method="get">
        {fields}
      </form>
      <button className="visitor-filter-panel__trigger" type="button" onClick={() => dialogRef.current?.showModal()}>
        Filter{activeCount ? ` · ${activeCount} aktif` : ""}
      </button>
      <dialog aria-labelledby="visitor-filter-title" className="visitor-filter-sheet" ref={dialogRef}>
        <header>
          <h2 id="visitor-filter-title">Saring laporan</h2>
          <button type="button" aria-label="Tutup filter" onClick={() => dialogRef.current?.close()}>
            ×
          </button>
        </header>
        <form className="visitor-filters" method="get">
          {fields}
        </form>
      </dialog>
    </div>
  );
}
