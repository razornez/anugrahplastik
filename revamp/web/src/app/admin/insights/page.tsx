import Link from "next/link";
import { redirect } from "next/navigation";
import { actionLabel, eventLabel, sectionLabel } from "@/features/analytics/display-labels";
import { getAnalyticsReport, type DeviceFilter, type ReportFilters } from "@/features/analytics/report-service";
import { getSession } from "@/lib/auth/session";

function queryString(filters: ReportFilters, session?: string) {
  const query = new URLSearchParams();
  query.set("days", String(filters.days));
  if (filters.device !== "all") query.set("device", filters.device);
  if (filters.city) query.set("city", filters.city);
  if (filters.source) query.set("source", filters.source);
  if (filters.outcome) query.set("outcome", filters.outcome);
  if (session) query.set("session", session);
  return query.toString();
}

function duration(seconds: number | null) {
  if (!seconds) return "Belum selesai";
  return seconds < 60 ? `${seconds} dtk` : `${Math.round(seconds / 60)} mnt`;
}

function deviceLabel(device: string) {
  if (device === "mobile") return "Ponsel";
  if (device === "desktop") return "Komputer";
  if (device === "tablet") return "Tablet";
  return "Perangkat tidak diketahui";
}

function eventDetail(event: { sectionKey: string | null; elementKey: string | null }) {
  if (event.elementKey) return actionLabel(event.elementKey);
  if (event.sectionKey) return sectionLabel(event.sectionKey);
  return "Halaman utama";
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{
    days?: string;
    device?: string;
    city?: string;
    source?: string;
    outcome?: string;
    session?: string;
  }>;
}) {
  const user = await getSession();
  if (!user || (user.role !== "admin" && user.role !== "sales")) redirect("/admin");

  const query = await searchParams;
  const filters: ReportFilters = {
    days: query.days === "30" ? 30 : 7,
    device: ["mobile", "desktop", "tablet", "unknown"].includes(query.device ?? "")
      ? (query.device as DeviceFilter)
      : "all",
    city: query.city ?? "",
    source: query.source ?? "",
    outcome: query.outcome ?? "",
  };
  const report = await getAnalyticsReport(filters);
  const selected = report.journeys.find((journey) => journey.id === query.session) ?? null;

  return (
    <section className="visitor-report" aria-labelledby="visitor-report-title">
      <header className="visitor-report__head">
        <div>
          <p className="eyebrow">Laporan pengunjung</p>
          <h1 id="visitor-report-title">Cari tahu apa yang dilakukan pengunjung.</h1>
          <p>
            Setiap baris adalah satu kunjungan anonim. Nama, nomor WhatsApp, isi formulir, dan IP tidak masuk ke laporan
            ini.
          </p>
        </div>
        <nav className="period-switch" aria-label="Pilih periode">
          <Link
            aria-current={filters.days === 7 ? "page" : undefined}
            href={"/admin/insights?" + queryString({ ...filters, days: 7 })}
          >
            7 hari
          </Link>
          <Link
            aria-current={filters.days === 30 ? "page" : undefined}
            href={"/admin/insights?" + queryString({ ...filters, days: 30 })}
          >
            30 hari
          </Link>
        </nav>
      </header>

      <form className="visitor-filters" method="get">
        <input type="hidden" name="days" value={filters.days} />
        <label>
          Perangkat
          <select name="device" defaultValue={filters.device}>
            <option value="all">Semua perangkat</option>
            <option value="mobile">Ponsel</option>
            <option value="desktop">Komputer</option>
            <option value="tablet">Tablet</option>
          </select>
        </label>
        <label>
          Lokasi
          <select name="city" defaultValue={filters.city}>
            <option value="">Semua lokasi</option>
            {report.citiesForFilter.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sumber
          <select name="source" defaultValue={filters.source}>
            <option value="">Semua sumber</option>
            {report.sourcesForFilter.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
        </label>
        <label>
          Hasil kunjungan
          <select name="outcome" defaultValue={filters.outcome}>
            <option value="">Semua hasil</option>
            <option value="Form terkirim">Form terkirim</option>
            <option value="Klik WhatsApp">Klik WhatsApp</option>
            <option value="Form mulai diisi">Form mulai diisi</option>
            <option value="Tombol minat diklik">Tombol minat diklik</option>
            <option value="Melihat halaman">Melihat halaman</option>
          </select>
        </label>
        <button type="submit">Terapkan</button>
      </form>

      <div className="visitor-stat-row">
        <article>
          <span>Pengunjung</span>
          <strong>{report.totals.sessions}</strong>
        </article>
        <article>
          <span>Form masuk</span>
          <strong>{report.totals.forms}</strong>
        </article>
        <article>
          <span>Tombol minat</span>
          <strong>{report.totals.ctaClicks}</strong>
        </article>
        <article>
          <span>Klik WhatsApp</span>
          <strong>{report.totals.whatsappClicks}</strong>
        </article>
      </div>

      <div className="visitor-report__grid">
        <section className="journey-list" aria-label="Daftar perjalanan kunjungan">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Perjalanan kunjungan</p>
              <h2>{report.journeys.length} kunjungan ditemukan</h2>
            </div>
          </div>
          {report.journeys.length ? (
            report.journeys.map((journey) => (
              <Link
                className="journey-row"
                aria-current={selected?.id === journey.id ? "page" : undefined}
                key={journey.id}
                href={"/admin/insights?" + queryString(filters, journey.id)}
              >
                <span className="journey-device">
                  {journey.deviceCategory === "mobile" ? "HP" : journey.deviceCategory === "desktop" ? "PC" : "TB"}
                </span>
                <span>
                  <strong>{journey.cityName ?? "Lokasi belum tersedia"}</strong>
                  <small>
                    {journey.browserName ?? "Browser tidak diketahui"} · {journey.sourceName} ·{" "}
                    {duration(journey.durationSeconds)}
                  </small>
                </span>
                <span className="journey-outcome">{journey.outcome}</span>
              </Link>
            ))
          ) : (
            <p className="empty-copy">Belum ada kunjungan sesuai filter.</p>
          )}
        </section>
        <aside className="journey-detail">
          {selected ? (
            <>
              <p className="eyebrow">Rincian kunjungan</p>
              <h2>{selected.cityName ?? "Lokasi belum tersedia"}</h2>
              <p>
                {deviceLabel(selected.deviceCategory)} · {selected.operatingSystem ?? "Sistem operasi tidak diketahui"}{" "}
                · {selected.browserName ?? "Browser tidak diketahui"}
              </p>
              <dl>
                <div>
                  <dt>Sumber</dt>
                  <dd>{selected.sourceName}</dd>
                </div>
                <div>
                  <dt>Bagian terakhir</dt>
                  <dd>{selected.lastSectionKey ? sectionLabel(selected.lastSectionKey) : "Belum tersedia"}</dd>
                </div>
                <div>
                  <dt>Hasil</dt>
                  <dd>{selected.outcome}</dd>
                </div>
              </dl>
              <ol className="journey-timeline">
                {selected.events.map((event) => (
                  <li key={event.id}>
                    <span />
                    <div>
                      <strong>{eventLabel(event.name)}</strong>
                      <small>{eventDetail(event)}</small>
                    </div>
                    <time>{event.occurredAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</time>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="empty-copy">
              Pilih satu kunjungan untuk melihat perjalanan klik dan bagian halaman yang dibuka.
            </p>
          )}
        </aside>
      </div>
      <p className="visitor-report__note">
        Lokasi adalah perkiraan berdasarkan jaringan. Data perjalanan detail disimpan 90 hari. Data lokasi disediakan
        oleh{" "}
        <a href="https://db-ip.com/db/lite.php" rel="noreferrer" target="_blank">
          DB-IP
        </a>
        .
      </p>
    </section>
  );
}
