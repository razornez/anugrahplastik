"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { businessDiscoveryAction } from "@/features/analytics/business-discovery-actions";
import {
  businessCities,
  filterBusinessCandidates,
  type BusinessBoardData,
} from "@/features/analytics/business-discovery-model";
import shapes from "@/features/analytics/map-data/shapes.json";
import styles from "./business-discovery.module.css";

const labels = { new: "Belum ditinjau", relevant: "Relevan", dismissed: "Disisihkan" };
const number = (value: number) => value.toLocaleString("id-ID");
function date(value: string) {
  return new Date(value).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}
function FactoryIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 21V10l6-4v5l6-4v14H3ZM15 11h6v10h-6M18 11V3h3v8M6 15h1m3 0h1m-5 3h1m3 0h1m7-3h1m-1 3h1" />
    </svg>
  );
}
function Submit({ children, disabled = false }: { children: React.ReactNode; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className={styles.primary} type="submit" disabled={disabled || pending}>
      {pending ? "Memproses…" : children}
    </button>
  );
}
const groups = [
  { id: "Bandung Raya", short: "Bandung Raya", x: 650, y: 268, labelY: 328 },
  { id: "Jabodetabek", short: "Jabodetabek", x: 290, y: 165, labelY: 225 },
];

export function BusinessDiscoveryPanel({ data, isAdmin }: { data: BusinessBoardData; isAdmin: boolean }) {
  const [state, action, pending] = useActionState(businessDiscoveryAction, { message: "" });
  const [area, setArea] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState("list");
  const [phrase, setPhrase] = useState("perusahaan manufaktur");
  const [city, setCity] = useState("bandung");
  const [zoom, setZoom] = useState(1);
  const confirmRef = useRef<HTMLDialogElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const groupAreas = groups.find((item) => item.id === area)
    ? businessCities.filter((item) => item.group === area).map((item) => item.id)
    : null;
  const filtered = filterBusinessCandidates(data.candidates, groupAreas ? "" : area, status, query).filter(
    (item) => !groupAreas || item.areas.some((id) => groupAreas.some((value) => value === id)),
  );
  const selected = filtered.find((item) => item.id === selectedId) ?? null;
  const latest = data.searches.find((item) => item.status === "complete");
  const stale = latest
    ? new Date(data.evaluatedAt).getTime() - new Date(latest.startedAt).getTime() >= 7 * 86_400_000
    : false;
  const budget = data.budget;
  const chosenCity = businessCities.find((item) => item.id === city)!;
  const canSearch = isAdmin && data.available && data.configured && !pending && Boolean(budget?.available);
  function chooseArea(next: string) {
    setArea(next);
    setSelectedId(null);
  }

  return (
    <div className={styles.panel}>
      <div className={styles.summary}>
        <div className={styles.summaryLead}>
          <span className={styles.factory}>
            <FactoryIcon size={28} />
          </span>
          <div>
            <p className="eyebrow">Riset perusahaan · bukan permintaan masuk</p>
            <h3>Siapa yang bisa kita dekati?</h3>
            <p>Mulai dari perusahaan manufaktur. Periksa kecocokannya dengan produk dan kemampuan kita.</p>
          </div>
        </div>
        <dl className={styles.counts}>
          <div>
            <dt>Ditemukan</dt>
            <dd>{data.available ? number(data.candidates.length) : "Belum tersedia"}</dd>
          </div>
          <div>
            <dt>Belum ditinjau</dt>
            <dd>
              {data.available
                ? number(data.candidates.filter((item) => item.status === "new").length)
                : "Belum tersedia"}
            </dd>
          </div>
          <div>
            <dt>Masuk Prospek</dt>
            <dd>{data.available ? number(data.candidates.filter((item) => item.leadId).length) : "Belum tersedia"}</dd>
          </div>
        </dl>
      </div>
      {data.error ? (
        <p role="alert" className={styles.notice}>
          {data.error}
        </p>
      ) : null}
      <div className={styles.search}>
        <label>
          Frasa industri
          <input
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
            maxLength={120}
            minLength={3}
            disabled={!isAdmin}
          />
        </label>
        <label>
          Wilayah pencarian
          <select value={city} onChange={(event) => setCity(event.target.value)} disabled={!isAdmin}>
            {["Bandung Raya", "Jabodetabek"].map((group) => (
              <optgroup key={group} label={group}>
                {businessCities
                  .filter((item) => item.group === group)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        {isAdmin ? (
          <button
            type="button"
            className={styles.primary}
            disabled={!canSearch || phrase.trim().length < 3}
            onClick={() => confirmRef.current?.showModal()}
          >
            Cari perusahaan <span aria-hidden="true">↗</span>
          </button>
        ) : (
          <span className={styles.permission}>Pencarian baru dilakukan admin</span>
        )}
      </div>
      <div className={styles.budget}>
        <span>
          {budget
            ? `${budget.available} pencarian perusahaan tersedia · ${budget.businessUsed}/4 percobaan bulan ini · ${budget.used}/${budget.limit} jatah bersama terpakai`
            : "Jatah pencarian belum tersedia"}
        </span>
        <span>
          {!data.configured
            ? "API key belum dikonfigurasi"
            : budget
              ? `${budget.reserved} pencarian dicadangkan untuk SEO/tren`
              : "Tidak ada permintaan otomatis"}
        </span>
      </div>
      <p role="status" aria-live="polite" className={styles.feedback}>
        {pending
          ? "Pemeriksaan sedang diproses. Jangan jalankan ulang; hasil tersimpan tetap tersedia."
          : state.message}
      </p>
      {data.searches[0]?.status === "failed" && !pending ? (
        <p className={styles.notice}>
          {data.searches[0].error ?? "Pencarian terakhir gagal. Hasil lama tetap tersedia."}
        </p>
      ) : null}
      {state.leadId ? (
        <Link className={styles.link} href={`/admin/prospects?origin=research&selected=${state.leadId}`}>
          Buka kandidat di Prospek ↗
        </Link>
      ) : null}
      <div className={styles.mobileSwitch} aria-label="Tampilan calon pelanggan">
        <button type="button" aria-pressed={mobileView === "list"} onClick={() => setMobileView("list")}>
          Daftar
        </button>
        <button type="button" aria-pressed={mobileView === "map"} onClick={() => setMobileView("map")}>
          Peta
        </button>
      </div>
      <div className={styles.results} data-mobile-view={mobileView}>
        <div className={styles.mapSide}>
          <div className={styles.sectionHead}>
            <div>
              <p className="eyebrow">Bandung Raya + Jabodetabek</p>
              <h4>Peluang di sekitar kita</h4>
            </div>
            <span className={styles.tag}>Peta area pencarian</span>
          </div>
          <div className={styles.mapCanvas}>
            <svg
              viewBox="0 0 900 400"
              role="group"
              aria-label="Peta sebaran hasil menurut kelompok wilayah pencarian. Pilihan kota dan angka lengkap tersedia di bawah."
            >
              <defs>
                <pattern id="business-map-grid" width="30" height="30" patternUnits="userSpaceOnUse">
                  <circle cx="1" cy="1" r="1" />
                </pattern>
              </defs>
              <rect width="900" height="400" className={styles.mapGrid} fill="url(#business-map-grid)" />
              <g transform={`translate(450 200) scale(${zoom}) translate(-450 -200)`}>
                <path
                  d={shapes.indonesia}
                  className={styles.land}
                  transform="matrix(16.5517 0 0 11.0526 -3600 -3084.2105)"
                />
                {groups.map((group) => {
                  const ids = businessCities.filter((item) => item.group === group.id).map((item) => item.id);
                  const total = data.candidates.filter((item) =>
                    item.areas.some((id) => ids.some((value) => value === id)),
                  ).length;
                  const checked =
                    total > 0 ||
                    data.searches.some((item) => item.status === "complete" && ids.some((id) => id === item.cityId));
                  return (
                    <g
                      key={group.id}
                      className={styles.mapMarker}
                      data-selected={area === group.id}
                      role="button"
                      tabIndex={0}
                      aria-pressed={area === group.id}
                      aria-label={`${group.short}: ${total} perusahaan unik dalam hasil pencarian. Pilih wilayah.`}
                      onClick={() => chooseArea(group.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          chooseArea(group.id);
                        }
                      }}
                    >
                      <circle cx={group.x} cy={group.y} r="49" className={styles.halo} />
                      <circle cx={group.x} cy={group.y} r="35" className={styles.pin} />
                      <text x={group.x} y={group.y + 8} className={styles.pinNumber}>
                        {checked ? number(total) : "Belum tersedia"}
                      </text>
                      <text x={group.x} y={group.labelY} className={styles.mapLabel}>
                        {group.short}
                      </text>
                    </g>
                  );
                })}
              </g>
              <text x="24" y="33" className={styles.compass}>
                JAWA BAGIAN BARAT
              </text>
            </svg>
            <div className={styles.mapControls}>
              <button
                type="button"
                aria-label="Perbesar peta area"
                onClick={() => setZoom((value) => Math.min(1.7, value + 0.2))}
                disabled={zoom >= 1.7}
              >
                +
              </button>
              <button
                type="button"
                aria-label="Perkecil peta area"
                onClick={() => setZoom((value) => Math.max(1, value - 0.2))}
                disabled={zoom <= 1}
              >
                −
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoom(1);
                  chooseArea("");
                }}
              >
                Reset
              </button>
            </div>
          </div>
          <div className={styles.areaChoices} aria-label="Saring hasil berdasarkan area pencarian">
            <button type="button" aria-pressed={!area} onClick={() => chooseArea("")}>
              Semua wilayah
            </button>
            {businessCities.map((item) => {
              const count = data.candidates.filter((candidate) => candidate.areas.includes(item.id)).length;
              return (
                <button key={item.id} type="button" aria-pressed={area === item.id} onClick={() => chooseArea(item.id)}>
                  {item.label}
                  {count ? <span>{number(count)}</span> : null}
                </button>
              );
            })}
          </div>
          <p className={styles.note}>
            Titik mewakili kelompok wilayah pencarian, bukan alamat persis perusahaan. Hasil bisa berada di luar
            wilayah. Satu perusahaan dapat ditemukan pada beberapa pencarian.
          </p>
          <p className={styles.note}>
            Siluet wilayah:{" "}
            <a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noopener noreferrer">
              Natural Earth · public domain
            </a>
            .
          </p>
        </div>
        <div className={styles.listSide}>
          <div className={styles.sectionHead}>
            <div>
              <p className="eyebrow">Kandidat untuk ditinjau</p>
              <h4>{number(filtered.length)} perusahaan</h4>
            </div>
            {latest ? (
              <span className={styles.tag}>
                {stale ? "Data lebih dari 7 hari" : `Dicari ${date(latest.startedAt)}`}
              </span>
            ) : null}
          </div>
          <div className={styles.listFilters}>
            <label>
              Cari dalam hasil
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nama, kategori, atau alamat"
              />
            </label>
            <label>
              Tinjauan
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setSelectedId(null);
                }}
              >
                <option value="">Semua</option>
                <option value="new">Belum ditinjau</option>
                <option value="relevant">Relevan</option>
                <option value="dismissed">Disisihkan</option>
              </select>
            </label>
          </div>
          <div className={styles.list}>
            {filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                className={styles.row}
                aria-pressed={selected?.id === item.id}
                onClick={() => {
                  const opening = selected?.id !== item.id;
                  setSelectedId(opening ? item.id : null);
                  if (opening) requestAnimationFrame(() => detailRef.current?.focus());
                }}
              >
                <span className={styles.rowIcon}>
                  <FactoryIcon />
                </span>
                <span className={styles.rowCopy}>
                  <strong>{item.name}</strong>
                  <span>{item.category ?? "Kategori belum tersedia"}</span>
                  <small>
                    {item.areas.map((id) => businessCities.find((value) => value.id === id)?.label ?? id).join(" · ")}
                  </small>
                </span>
                <span className={styles.rowStatus} data-state={item.status}>
                  {item.leadId ? "Masuk Prospek" : labels[item.status]}
                  <span aria-hidden="true">↗</span>
                </span>
              </button>
            ))}
            {!filtered.length ? (
              <div className={styles.empty}>
                <FactoryIcon size={34} />
                <h4>{data.candidates.length ? "Tidak ada kandidat yang cocok" : "Mulai temukan perusahaan"}</h4>
                <p>
                  {data.candidates.length
                    ? "Ubah wilayah, pencarian, atau status tinjauan. Data tersimpan tidak berubah."
                    : "Pilih frasa industri dan satu wilayah. Hasil nyata akan tampil di daftar dan peta ini setelah admin menjalankan pencarian."}
                </p>
                {data.candidates.length ? (
                  <button
                    type="button"
                    onClick={() => {
                      chooseArea("");
                      setStatus("");
                      setQuery("");
                    }}
                  >
                    Hapus filter hasil
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {selected ? (
        <section ref={detailRef} tabIndex={-1} className={styles.detail} aria-label={`Rincian ${selected.name}`}>
          <div className={styles.detailIntro}>
            <span className={styles.factory}>
              <FactoryIcon size={30} />
            </span>
            <div>
              <p className="eyebrow">
                {labels[selected.status]} · diperiksa {date(selected.checkedAt)} WIB
              </p>
              <h4>{selected.name}</h4>
              <p>Belum ada bukti perusahaan ini membutuhkan produk kita. Tinjau kategori dan alamat dari sumber.</p>
            </div>
            <button type="button" aria-label="Tutup rincian perusahaan" onClick={() => setSelectedId(null)}>
              ×
            </button>
          </div>
          <dl className={styles.contact}>
            <div>
              <dt>Kategori publik</dt>
              <dd>{selected.category ?? "Belum tersedia"}</dd>
            </div>
            <div>
              <dt>Alamat publik</dt>
              <dd>{selected.address ?? "Belum tersedia"}</dd>
            </div>
            <div>
              <dt>Telepon publik</dt>
              <dd>{selected.phone ?? "Belum tersedia"}</dd>
            </div>
            <div>
              <dt>Website</dt>
              <dd>
                {selected.website ? (
                  <a href={selected.website} target="_blank" rel="noopener noreferrer">
                    {new URL(selected.website).hostname} ↗
                  </a>
                ) : (
                  "Belum tersedia"
                )}
              </dd>
            </div>
          </dl>
          <div className={styles.detailActions}>
            <a href={selected.mapsUrl} target="_blank" rel="noopener noreferrer">
              Periksa sumber Google Maps ↗
            </a>
            <form action={action}>
              <input type="hidden" name="operation" value="review" />
              <input type="hidden" name="candidateId" value={selected.id} />
              <label>
                Status tinjauan
                <select name="status" defaultValue={selected.status} key={selected.id}>
                  {Object.entries(labels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <Submit>Simpan tinjauan</Submit>
            </form>
          </div>
          {selected.leadId ? (
            <Link className={styles.link} href={`/admin/prospects?origin=research&selected=${selected.leadId}`}>
              Sudah ada di Prospek · buka ↗
            </Link>
          ) : selected.stableId ? (
            <form action={action} className={styles.addForm}>
              <input type="hidden" name="operation" value="add" />
              <input type="hidden" name="candidateId" value={selected.id} />
              <label>
                Penanggung jawab
                <select name="assignedUserId" required defaultValue="" key={selected.id}>
                  <option value="" disabled>
                    Pilih anggota tim
                  </option>
                  {data.members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.confirmCheck}>
                <input type="checkbox" name="confirmed" value="yes" required />
                Saya sudah memeriksa identitas dan kontak. Tambahkan sebagai calon pelanggan hasil riset, bukan
                permintaan masuk.
              </label>
              <Submit disabled={!data.members.length}>Tambahkan ke Prospek</Submit>
            </form>
          ) : (
            <p className={styles.notice}>
              Identitas tempat dari sumber belum stabil. Periksa sumber; penambahan ke Prospek ditahan agar tidak
              membuat duplikat.
            </p>
          )}
        </section>
      ) : null}
      {data.searches.length ? (
        <details className={styles.history}>
          <summary>Riwayat pencarian · {data.searches.length} terbaru</summary>
          <ul>
            {data.searches.map((item) => (
              <li key={item.id}>
                <strong>
                  {item.phrase} · {businessCities.find((value) => value.id === item.cityId)?.label ?? item.cityId}
                </strong>
                <span>
                  {date(item.startedAt)} WIB ·{" "}
                  {item.status === "complete"
                    ? `${item.count} hasil`
                    : item.status === "running"
                      ? "Sedang diproses; muat ulang untuk melihat status"
                      : "Gagal"}
                </span>
                {item.error ? <p>{item.error}</p> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <dialog ref={confirmRef} className={styles.dialog} aria-labelledby="business-confirm-title">
        <div className={styles.dialogHead}>
          <h3 id="business-confirm-title">Konfirmasi pencarian</h3>
          <button type="button" aria-label="Tutup konfirmasi pencarian" onClick={() => confirmRef.current?.close()}>
            ×
          </button>
        </div>
        <p>
          Cari <strong>{phrase.trim()}</strong> di <strong>{chosenCity.label}</strong>. Satu permintaan SerpApi; hasil
          identik yang masih segar akan memakai cache.
        </p>
        <p>{budget?.available ?? 0} permintaan perusahaan tersedia. Tidak ada upgrade paket atau biaya otomatis.</p>
        <form action={action} onSubmit={() => confirmRef.current?.close()}>
          <input type="hidden" name="operation" value="search" />
          <input type="hidden" name="phrase" value={phrase} />
          <input type="hidden" name="city" value={city} />
          <input type="hidden" name="confirmed" value="yes" />
          <Submit disabled={!canSearch}>Ya, cari perusahaan</Submit>
        </form>
      </dialog>
    </div>
  );
}
