import Link from "next/link";
import { redirect } from "next/navigation";
import { actionLabel, eventLabel, sectionLabel } from "@/features/analytics/display-labels";
import {
  getAnalyticsJourney,
  getAnalyticsReport,
  type DeviceFilter,
  type ReportFilters,
} from "@/features/analytics/report-service";
import { getSession } from "@/lib/auth/session";
import { VisitorFilterPanel } from "@/components/visitor-filter-panel";

export const instant = false;

function queryString(filters: ReportFilters, session?: string, cursor?: string, direction?: string) {
  const query = new URLSearchParams();
  query.set("days", String(filters.days));
  if (filters.device !== "all") query.set("device", filters.device);
  if (filters.city) query.set("city", filters.city);
  if (filters.source) query.set("source", filters.source);
  if (filters.outcome) query.set("outcome", filters.outcome);
  if (session) query.set("session", session);
  if (cursor) query.set("cursor", cursor);
  if (direction) query.set("direction", direction);
  return query.toString();
}

function duration(seconds: number | null) {
  if (!seconds) return "Belum ada durasi aktif";
  return seconds < 60 ? `${seconds} dtk` : `${Math.round(seconds / 60)} mnt`;
}

function activeDuration(seconds: number | null, quality: string) {
  if (quality !== "measured") return "Data lama — belum terverifikasi";
  return `${duration(seconds)} · waktu aktif, maks. 30 mnt`;
}

function timestamp(value: Date) {
  return value.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function deviceLabel(device: string) {
  if (device === "mobile") return "Ponsel";
  if (device === "desktop") return "Komputer";
  if (device === "tablet") return "Tablet";
  return "Perangkat tidak diketahui";
}

function outcomeLabel(outcome: string) {
  return outcome === "Form terkirim" ? "Event kirim form" : outcome;
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
    cursor?: string;
    direction?: string;
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
  const report = await getAnalyticsReport(filters, {
    cursor: query.cursor,
    direction: query.direction === "previous" ? "previous" : "next",
  });
  const selected = query.session ? await getAnalyticsJourney(query.session) : null;

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

      <div className="visitor-stat-row">
        <article>
          <span>Pengunjung</span>
          <strong>{report.totals.sessions}</strong>
        </article>
        <article>
          <span>Event kirim form</span>
          <strong>{report.totals.formEvents}</strong>
        </article>
        <article>
          <span>Lead valid tersimpan</span>
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
      <VisitorFilterPanel
        days={filters.days}
        device={filters.device}
        city={filters.city}
        source={filters.source}
        outcome={filters.outcome}
        cities={report.citiesForFilter}
        sources={report.sourcesForFilter}
        activeCount={
          [filters.device !== "all", Boolean(filters.city), Boolean(filters.source), Boolean(filters.outcome)].filter(
            Boolean,
          ).length
        }
      />

      {filters.device !== "all" || filters.city || filters.source || filters.outcome ? (
        <div className="visitor-filter-chips" aria-label="Filter aktif">
          <strong>Filter aktif</strong>
          {filters.device !== "all" ? <span>{deviceLabel(filters.device)}</span> : null}
          {filters.city ? <span>{filters.city}</span> : null}
          {filters.source ? <span>{filters.source}</span> : null}
          {filters.outcome ? <span>{outcomeLabel(filters.outcome)}</span> : null}
          <Link href={`/admin/insights?days=${filters.days}`}>Reset</Link>
        </div>
      ) : null}

      <p className="visitor-filter-context">
        Event form adalah sesi yang mengirim event dari browser. Lead valid dihitung dari permintaan yang benar-benar
        tersimpan dan bukan data uji.
      </p>
      {report.totals.formEvents > report.totals.forms ? (
        <aside className="visitor-data-quality" role="status">
          <strong>Ada event yang belum cocok dengan lead tersimpan.</strong>
          <span>
            {report.totals.formEvents - report.totals.forms} event form belum dapat diverifikasi sebagai lead valid.
            Data lama atau tidak lengkap tetap terlihat di perjalanan, tetapi tidak dihitung sebagai lead.
          </span>
        </aside>
      ) : null}

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
                href={"/admin/insights?" + queryString(filters, journey.id, query.cursor, query.direction)}
              >
                <span className="journey-device">
                  {journey.deviceCategory === "mobile" ? "HP" : journey.deviceCategory === "desktop" ? "PC" : "TB"}
                </span>
                <span>
                  <strong>{journey.cityName ?? "Lokasi belum tersedia"}</strong>
                  <small>
                    {journey.browserName ?? "Browser tidak diketahui"} · {journey.sourceName} ·{" "}
                    {activeDuration(journey.durationSeconds, journey.durationQuality)} · {timestamp(journey.createdAt)}{" "}
                    WIB
                  </small>
                </span>
                <span className="journey-outcome">
                  {journey.outcome}
                  {journey.formStatus ? <small>{journey.formStatus}</small> : null}
                </span>
              </Link>
            ))
          ) : (
            <p className="empty-copy">Belum ada kunjungan sesuai filter.</p>
          )}
          <nav className="directory-pagination" aria-label="Pindah halaman perjalanan">
            {report.hasPrevious ? (
              <Link
                href={
                  "/admin/insights?" + queryString(filters, undefined, report.previousCursor ?? undefined, "previous")
                }
              >
                ← Sebelumnya
              </Link>
            ) : (
              <span>← Sebelumnya</span>
            )}
            <span>25 kunjungan per halaman</span>
            {report.hasNext ? (
              <Link href={"/admin/insights?" + queryString(filters, undefined, report.nextCursor ?? undefined, "next")}>
                Berikutnya →
              </Link>
            ) : (
              <span>Berikutnya →</span>
            )}
          </nav>
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
                  <dd>
                    {selected.outcome}
                    {selected.formStatus ? ` · ${selected.formStatus}` : ""}
                  </dd>
                </div>
                <div>
                  <dt>Mulai</dt>
                  <dd>{timestamp(selected.createdAt)} WIB</dd>
                </div>
                <div>
                  <dt>Durasi aktif</dt>
                  <dd>{activeDuration(selected.durationSeconds, selected.durationQuality)}</dd>
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
                    <time>{timestamp(event.occurredAt)} WIB</time>
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
