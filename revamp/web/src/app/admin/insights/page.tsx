import Link from "next/link";
import { AdminPageHeader } from "@/components/admin-page-header";
import { redirect } from "next/navigation";
import { actionLabel, eventLabel, sectionLabel } from "@/features/analytics/display-labels";
import {
  createEmptyAnalyticsReport,
  getAnalyticsJourney,
  getAnalyticsReport,
  type DeviceFilter,
  type ReportFilters,
} from "@/features/analytics/report-service";
import { getSession } from "@/lib/auth/session";
import { VisitorFilterPanel } from "@/components/visitor-filter-panel";
import { MarketingWorkspaceNav } from "@/components/marketing-workspace-nav";
import { VisitorGeographyMap } from "@/components/visitor-geography-map";
import { VisitorDailyChart } from "@/components/visitor-daily-chart";
import { geographyBuckets, geographySummary, visitorQuery } from "@/features/analytics/visitor-report-model";
import { jakartaReportStart } from "@/features/analytics/report-period";
import "./visitors.css";

export const instant = false;

function duration(seconds: number | null) {
  if (!seconds) return "Belum ada durasi aktif";
  return seconds < 60 ? `${seconds} dtk` : `${Math.round(seconds / 60)} mnt`;
}

function activeDuration(seconds: number | null, quality: string) {
  if (quality !== "measured") return "Data lama, belum terverifikasi";
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
  return outcome === "Form terkirim" ? "Mengirim formulir" : outcome;
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
    country?: string;
    region?: string;
    map?: string;
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
    country: query.country ?? "",
    region: query.region ?? "",
  };
  const now = new Date();
  const extent = query.map === "world" ? "world" : "indonesia";
  let report = createEmptyAnalyticsReport(filters, now);
  let selected = null;
  try {
    report = await getAnalyticsReport(
      filters,
      { cursor: query.cursor, direction: query.direction === "previous" ? "previous" : "next" },
      "public",
      now,
    );
    if (query.session && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query.session))
      selected = await getAnalyticsJourney(query.session, "public", filters, now);
  } catch {
    report = { ...createEmptyAnalyticsReport(filters, now), available: false };
  }
  const queryString = (value: ReportFilters, session?: string, cursor?: string, direction?: string) =>
    visitorQuery(value, extent, { session, cursor, direction });
  const resetFilters: ReportFilters = {
    days: filters.days,
    device: "all",
    city: "",
    source: "",
    outcome: "",
    country: "",
    region: "",
  };
  const activeCount = [
    filters.device !== "all",
    filters.city,
    filters.source,
    filters.outcome,
    filters.country,
    filters.region,
  ].filter(Boolean).length;
  const formatDay = (date: Date) =>
    date.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric" });
  const periodLabel = `${formatDay(jakartaReportStart(filters.days, now))} sampai ${formatDay(now)} · ${filters.days} hari`;
  const summary = geographySummary(report.geography);
  const buckets = geographyBuckets(report.geography, extent).map((bucket) => ({
    ...bucket,
    href:
      bucket.country && (extent === "world" || bucket.region)
        ? "/admin/insights?" +
          visitorQuery({ ...filters, country: bucket.country, region: bucket.region, city: "" }, extent)
        : null,
  }));

  return (
    <section className="visitor-report visitor-workspace" aria-labelledby="visitor-report-title">
      <AdminPageHeader
        title="Kunjungan website"
        titleId="visitor-report-title"
        description="Tinjau wilayah, sumber, dan aktivitas kunjungan tanpa identitas pribadi."
        actions={
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
        }
      />
      <MarketingWorkspaceNav current="/admin/insights" />
      <div className="visitor-period-context">
        <span>{periodLabel} · WIB</span>
        <span>Termasuk hari ini; data hari ini belum lengkap.</span>
      </div>
      {!report.available ? (
        <aside className="visitor-data-quality" role="alert">
          <strong>Laporan belum berhasil dimuat.</strong>
          <span>Koneksi database belum tersedia. Angka di bawah bukan hasil pengukuran.</span>
          <Link href={"/admin/insights?" + queryString(filters)}>Coba muat kembali →</Link>
        </aside>
      ) : null}

      <div className="visitor-stat-row">
        <article>
          <span>Kunjungan website</span>
          <strong>{report.available ? report.totals.sessions.toLocaleString("id-ID") : "Belum tersedia"}</strong>
          <small>Sesi selama periode ini</small>
        </article>
        <article>
          <span>Percobaan kirim formulir</span>
          <strong>{report.available ? report.totals.formEvents.toLocaleString("id-ID") : "Belum tersedia"}</strong>
          <small>Kunjungan yang mengirim form</small>
        </article>
        <article>
          <span>Permintaan valid tersimpan</span>
          <strong>{report.available ? report.totals.forms.toLocaleString("id-ID") : "Belum tersedia"}</strong>
          <small>Sudah cocok dengan data tersimpan</small>
        </article>
        <article>
          <span>Klik tombol bertanya</span>
          <strong>{report.available ? report.totals.ctaClicks.toLocaleString("id-ID") : "Belum tersedia"}</strong>
          <small>Kunjungan yang menekan tombol</small>
        </article>
        <article>
          <span>Klik WhatsApp</span>
          <strong>{report.available ? report.totals.whatsappClicks.toLocaleString("id-ID") : "Belum tersedia"}</strong>
          <small>Kunjungan yang membuka WhatsApp</small>
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
        activeCount={activeCount}
        extent={extent}
        country={filters.country}
        region={filters.region}
        countries={report.countriesForFilter}
        regions={report.regionsForFilter}
      />

      {activeCount ? (
        <div className="visitor-filter-chips" aria-label="Filter aktif">
          <strong>Filter aktif</strong>
          {filters.device !== "all" ? <span>{deviceLabel(filters.device)}</span> : null}
          {filters.city ? <span>{filters.city}</span> : null}
          {filters.source ? <span>{filters.source}</span> : null}
          {filters.outcome ? <span>{outcomeLabel(filters.outcome)}</span> : null}
          {filters.country ? <span>{filters.country}</span> : null}
          {filters.region ? <span>{filters.region}</span> : null}
          <Link href={"/admin/insights?" + queryString(resetFilters)}>Hapus semua filter</Link>
        </div>
      ) : null}

      <p className="visitor-filter-context">
        Percobaan kirim formulir dicatat oleh browser; permintaan valid hanya dihitung jika berhasil diverifikasi. Data
        pada laporan ini hanya berasal dari aktivitas website yang tercatat.
      </p>
      {report.totals.formEvents > report.totals.forms ? (
        <aside className="visitor-data-quality" role="status">
          <strong>Ada pengiriman formulir yang belum terverifikasi.</strong>
          <span>
            {report.totals.formEvents - report.totals.forms} kunjungan mengirim formulir tetapi belum cocok dengan
            permintaan tersimpan. Aktivitasnya tetap terlihat, tetapi tidak menambah angka permintaan valid.
          </span>
        </aside>
      ) : null}

      {report.available ? (
        <>
          <VisitorGeographyMap
            key={`${extent}:${queryString(filters)}`}
            buckets={buckets}
            extent={extent}
            summary={summary}
            indonesiaHref={"/admin/insights?" + visitorQuery(filters, "indonesia")}
            worldHref={"/admin/insights?" + visitorQuery(filters, "world")}
          />
          <div className="visitor-distribution-grid">
            {[
              {
                title: "Perangkat yang digunakan",
                eyebrow: "Cara membuka website",
                rows: report.devices.map((row) => ({ label: row.label, total: row.total })),
                variant: "devices",
              },
              {
                title: "Dari mana kunjungan berasal?",
                eyebrow: "Sumber kunjungan",
                rows: report.sources.map((row) => ({ label: row.key, total: row.total })),
                variant: "sources",
              },
            ].map((panel) => (
              <section className={`visitor-distribution visitor-distribution--${panel.variant}`} key={panel.variant}>
                <p className="eyebrow">{panel.eyebrow}</p>
                <h2>{panel.title}</h2>
                {panel.rows.length ? (
                  <ul>
                    {panel.rows.map((row) => (
                      <li key={row.label}>
                        <span>
                          {row.label}
                          <i aria-hidden="true">
                            <i
                              style={{
                                width: `${(row.total / Math.max(1, ...panel.rows.map((item) => item.total))) * 100}%`,
                              }}
                            />
                          </i>
                        </span>
                        <strong>
                          {row.total.toLocaleString("id-ID")}
                          <small>kunjungan</small>
                        </strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-copy">Belum ada kunjungan sesuai filter.</p>
                )}
              </section>
            ))}
          </div>
          <VisitorDailyChart points={report.trend} />
        </>
      ) : null}
      <div className={`visitor-report__grid${selected ? " visitor-report__grid--selected" : ""}`}>
        <section className="journey-list" aria-label="Daftar perjalanan kunjungan">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Perjalanan kunjungan</p>
              <h2>
                {report.available ? report.totals.sessions.toLocaleString("id-ID") : "Belum tersedia"} kunjungan sesuai
                filter
              </h2>
              <p>{report.journeys.length} ditampilkan pada halaman ini.</p>
            </div>
          </div>
          {report.journeys.length ? (
            report.journeys.map((journey) => (
              <Link
                className="journey-row"
                aria-current={selected?.id === journey.id ? "page" : undefined}
                key={journey.id}
                href={
                  "/admin/insights?" +
                  queryString(filters, journey.id, query.cursor, query.direction) +
                  "#visitor-journey-detail"
                }
              >
                <span className="journey-device">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                    {journey.deviceCategory === "desktop" ? (
                      <>
                        <rect x="3" y="4" width="18" height="13" rx="2" />
                        <path d="M8 21h8m-4-4v4" />
                      </>
                    ) : journey.deviceCategory === "mobile" || journey.deviceCategory === "tablet" ? (
                      <>
                        <rect
                          x={journey.deviceCategory === "mobile" ? "7" : "4"}
                          y="2"
                          width={journey.deviceCategory === "mobile" ? "10" : "16"}
                          height="20"
                          rx="2"
                        />
                        <path d="M10 18h4" />
                      </>
                    ) : (
                      <>
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 8v5m0 3v1" />
                      </>
                    )}
                  </svg>
                  <span className="sr-only">{deviceLabel(journey.deviceCategory)}</span>
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
                  {outcomeLabel(journey.outcome)}
                  {journey.formStatus ? <small>{journey.formStatus}</small> : null}
                </span>
              </Link>
            ))
          ) : (
            <div className="empty-copy">
              <strong>{report.available ? "Belum ada kunjungan sesuai filter." : "Daftar belum dapat dimuat."}</strong>
              <p>Kunjungan akan muncul setelah website menerima aktivitas yang tercatat.</p>
              {activeCount ? <Link href={"/admin/insights?" + queryString(resetFilters)}>Hapus filter →</Link> : null}
            </div>
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
        <aside className="journey-detail" id="visitor-journey-detail">
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
                    {outcomeLabel(selected.outcome)}
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
              {!selected.events.length ? (
                <p className="empty-copy">Belum ada rincian tindakan yang tercatat untuk kunjungan ini.</p>
              ) : null}
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
            <div className="visitor-detail-prompt">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <path d="M7 4h10v16H7zM10 8h4m-4 4h4m-4 4h2" />
              </svg>
              <div>
                <h3>Detail kunjungan</h3>
                <p>Pilih baris di daftar untuk melihat urutan klik dan bagian website yang dibuka.</p>
                {query.session ? <p>Kunjungan yang diminta tidak tersedia pada sumber data atau filter ini.</p> : null}
              </div>
            </div>
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
