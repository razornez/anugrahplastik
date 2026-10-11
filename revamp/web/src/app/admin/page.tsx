import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AnalyticsTrendChart } from "@/components/analytics-trend-chart";
import { HomePhotoDialog } from "@/components/home-photo-dialog";
import { getAnalyticsHealth } from "@/features/analytics/health-service";
import { getAnalyticsInsight } from "@/features/analytics/insight-service";
import { sectionLabel } from "@/features/analytics/display-labels";
import { getAnalyticsReport, type ReportPeriod } from "@/features/analytics/report-service";
import { getWorkspaceOverview, type WorkspacePeriod } from "@/features/workspace/service";
import { getSession } from "@/lib/auth/session";

export const instant = false;

type IconName =
  "lead" | "order" | "chart" | "arrow" | "spark" | "visit" | "section" | "tap" | "write" | "send" | "check" | "pin";

function Icon({ name }: { name: IconName }) {
  const paths = {
    lead: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 20c.4-3.3 2.2-5 5.5-5s5.1 1.7 5.5 5M17 8h4m-2-2v4" />
      </>
    ),
    order: (
      <>
        <rect x="5" y="3.5" width="14" height="17" rx="2" />
        <path d="M8.5 8h7m-7 4h7m-7 4H13" />
      </>
    ),
    chart: (
      <>
        <path d="M4 19.5V5m0 14.5h16M8 16v-4m4 4V8m4 8v-6" />
        <path d="m7.5 8.5 4-4 3 2 4-3" />
      </>
    ),
    arrow: <path d="M4.5 12h15m-6-6 6 6-6 6" />,
    spark: (
      <path d="m12 2 1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2ZM19 16l.6 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6L19 16Z" />
    ),
    visit: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18m-14-2h.01" />
      </>
    ),
    section: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M8 13h8m-8 3h5" />
      </>
    ),
    tap: (
      <>
        <path d="M9 12V5a2 2 0 0 1 4 0v6l1.5-1a2 2 0 0 1 2.5.5l2 2.5a3 3 0 0 1 .5 2.5l-1.1 3.5H9l-4-4a2 2 0 0 1 2.8-2.8L9 13" />
      </>
    ),
    write: (
      <>
        <path d="M5 3h10l4 4v14H5zM15 3v5h4M8 12h8m-8 4h5" />
      </>
    ),
    send: (
      <>
        <path d="m3 11 18-8-8 18-2.5-7.5L3 11Zm7.5 2.5L21 3" />
      </>
    ),
    check: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 2.5 2.5L16 9" />
      </>
    ),
    pin: (
      <>
        <path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z" />
        <circle cx="12" cy="9" r="2.4" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function ActionCard({
  href,
  kind,
  label,
  title,
  detail,
  tone,
}: {
  href?: string;
  kind: IconName;
  label: string;
  title: string;
  detail: string;
  tone: "primary" | "soft" | "ink";
}) {
  const content = (
    <>
      <span className="home-action-card__icon">
        <Icon name={kind} />
      </span>
      <span className="home-action-card__body">
        <small>{label}</small>
        <strong>{title}</strong>
        <span>{detail}</span>
      </span>
      <span className="home-action-card__arrow">{href ? <Icon name="arrow" /> : null}</span>
    </>
  );
  const className = `home-action-card home-action-card--${tone}${href ? "" : " home-action-card--static"}`;
  return href ? (
    <Link className={className} href={href}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

function ContextMetric({
  href,
  icon,
  tone,
  label,
  value,
}: {
  href?: string;
  icon: IconName;
  tone: string;
  label: string;
  value: number;
}) {
  const content = (
    <>
      <span className={`home-mini-icon home-mini-icon--${tone}`}>
        <Icon name={icon} />
      </span>
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
      </span>
      {href ? <Icon name="arrow" /> : null}
    </>
  );
  return href ? (
    <Link className="home-context__metric" href={href}>
      {content}
    </Link>
  ) : (
    <div className="home-context__metric home-context__metric--static">{content}</div>
  );
}

function activityLabel(action: string) {
  const labels: Record<string, string> = {
    "prospect.assigned": "Penanggung jawab permintaan pelanggan diperbarui",
    "prospect.note_added": "Catatan permintaan pelanggan ditambahkan",
    "prospect.whatsapp_started": "Percakapan WhatsApp dibuka",
    "content.publish": "Perubahan halaman utama diterbitkan",
    "content.draft": "Perubahan halaman utama disimpan",
    "team.member_created": "Anggota tim ditambahkan",
    "team.member_activated": "Akses anggota tim diaktifkan",
    "team.member_deactivated": "Akses anggota tim dinonaktifkan",
  };
  return labels[action] ?? "Aktivitas tercatat";
}

function homeHref(period: WorkspacePeriod) {
  return `/admin?period=${period}`;
}

export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const user = await getSession();
  if (!user) redirect("/admin/login");
  const query = await searchParams;
  const period: WorkspacePeriod = query.period === "today" || query.period === "month" ? query.period : "week";
  const days: ReportPeriod = period === "today" ? 1 : period === "month" ? 30 : 7;
  const reportFilters = { days, device: "all" as const, city: "", source: "", outcome: "" };
  const [overview, report, insight, analyticsHealth] = await Promise.all([
    getWorkspaceOverview(period),
    getAnalyticsReport(reportFilters, {}, "public"),
    getAnalyticsInsight(days, "public"),
    user.role === "admin" ? getAnalyticsHealth() : Promise.resolve(null),
  ]);
  const label = period === "today" ? "Hari ini" : period === "month" ? "30 hari terakhir" : "7 hari terakhir";
  const journeyIcons: IconName[] = ["visit", "section", "tap", "write", "send", "check"];

  return (
    <div className="home-dashboard">
      <div className="home-above-fold">
        <section className="home-center" aria-label="Ruang kerja utama">
          <header className="home-hero">
            <div className="home-hero__copy">
              <p className="home-kicker">
                <Icon name="spark" /> RUANG KERJA ANUGRAH PLASTIK
              </p>
              <h1>
                Halo, <span>{user.name.split(" ")[0]}.</span>
              </h1>
              <p>Lihat permintaan pelanggan, pesanan, dan kunjungan website dalam satu halaman.</p>
              <Link className="home-hero__action" href="/admin/prospects">
                Buka permintaan pelanggan <Icon name="arrow" />
              </Link>
            </div>
            <div className="home-hero__visual">
              <Image
                src="/images-webp/mesin/Anugrah Plastik (105).webp"
                alt="Proses pengerjaan komponen di workshop Anugrah Plastik"
                fill
                sizes="(max-width: 760px) 100vw, 340px"
                priority
              />
              <span className="home-hero__photo-label">DI BALIK PRODUK ANDA</span>
              <HomePhotoDialog
                src="/images-webp/mesin/Anugrah Plastik (105).webp"
                alt="Proses pengerjaan komponen di workshop Anugrah Plastik"
              />
              <div className="home-hero__product" aria-hidden="true">
                <Image src="/images-webp/portfolio/gear.webp" alt="" fill sizes="100px" />
              </div>
            </div>
          </header>

          <div className="home-section-heading">
            <div>
              <p className="home-kicker">YANG PERLU DITINDAKLANJUTI</p>
              <h2>Pekerjaan yang perlu ditangani</h2>
            </div>
          </div>
          <div className="home-action-stack">
            <ActionCard
              href="/admin/prospects"
              kind="lead"
              label="PERMINTAAN PELANGGAN · SEMUA WAKTU"
              title={`${overview?.current.unassigned ?? 0} permintaan belum ada penanggung jawab`}
              detail="Pilih anggota tim untuk menindaklanjuti permintaan tersebut."
              tone="primary"
            />
            {user.role !== "content" ? (
              <ActionCard
                href="/admin/transactions"
                kind="order"
                label="TRANSAKSI · SEMUA WAKTU"
                title={`${overview?.operations.openOrders ?? 0} pesanan sedang diproses`}
                detail={`${overview?.operations.paymentAttention ?? 0} pesanan belum memiliki pembayaran terverifikasi.`}
                tone="soft"
              />
            ) : null}
            <ActionCard
              href={user.role === "content" ? "/admin/content" : "/admin/insights"}
              kind="chart"
              label={`FORMULIR WEBSITE · ${label.toUpperCase()}`}
              title={`${report.totals.forms} permintaan dari formulir website`}
              detail="Jumlah permintaan yang tercatat valid pada periode ini."
              tone="ink"
            />
          </div>

          <section className="home-leads" aria-labelledby="home-leads-title">
            <div className="home-section-heading">
              <div>
                <p className="home-kicker">PESAN PELANGGAN</p>
                <h2 id="home-leads-title">Permintaan pelanggan terbaru</h2>
              </div>
              <Link href="/admin/prospects">
                Lihat semua <span aria-hidden="true">→</span>
              </Link>
            </div>
            {overview?.recentLeads.length ? (
              overview.recentLeads.map((lead) => {
                const content = (
                  <>
                    <span className="home-lead-row__avatar" aria-hidden="true">
                      {lead.name.slice(0, 1)}
                    </span>
                    <span className="home-lead-row__copy">
                      <strong>{lead.name}</strong>
                      <small>{lead.message}</small>
                    </span>
                    <span className="home-lead-row__owner">{lead.assignedName ?? "Belum ada penanggung jawab"}</span>
                    <Icon name="arrow" />
                  </>
                );
                return (
                  <Link className="home-lead-row" href={`/admin/prospects?selected=${lead.id}`} key={lead.id}>
                    {content}
                  </Link>
                );
              })
            ) : (
              <p className="home-empty">Belum ada permintaan pelanggan pada periode ini.</p>
            )}
          </section>
        </section>

        <aside className="home-context" aria-label="Ringkasan dan periode">
          <div className="home-context__top">
            <span>KUNJUNGAN WEBSITE</span>
            <span className={`home-context__status${report.available ? "" : " home-context__status--offline"}`}>
              <i /> {report.available ? "Laporan tersedia" : "Data belum tersedia"}
            </span>
          </div>
          <nav className="home-period-switch" aria-label="Periode laporan">
            <Link aria-current={period === "today" ? "page" : undefined} href={homeHref("today")}>
              Hari ini
            </Link>
            <Link aria-current={period === "week" ? "page" : undefined} href={homeHref("week")}>
              7 hari
            </Link>
            <Link aria-current={period === "month" ? "page" : undefined} href={homeHref("month")}>
              30 hari
            </Link>
          </nav>
          <div className="home-context__intro">
            <p className="home-kicker">RINGKASAN {label.toUpperCase()}</p>
            <h2>Kunjungan website</h2>
            <p>
              Jumlah sesi kunjungan dan tindakan yang tercatat selama <strong>{label.toLowerCase()}</strong>.
              {user.role !== "content" ? " Pilih angka untuk membuka laporan lengkap." : null}
            </p>
          </div>
          <div className="home-context__metrics">
            <ContextMetric
              href={user.role !== "content" ? "/admin/insights" : undefined}
              icon="chart"
              tone="violet"
              label="Sesi kunjungan"
              value={report.totals.sessions}
            />
            <ContextMetric
              href={user.role !== "content" ? "/admin/insights" : undefined}
              icon="lead"
              tone="peach"
              label="Klik tombol tindakan"
              value={report.totals.ctaClicks}
            />
            <ContextMetric
              href={user.role !== "content" ? "/admin/insights" : undefined}
              icon="chart"
              tone="blue"
              label="Klik WhatsApp"
              value={report.totals.whatsappClicks}
            />
            <ContextMetric
              href="/admin/prospects"
              icon="lead"
              tone="mint"
              label="Permintaan baru"
              value={overview?.current.leads ?? 0}
            />
          </div>
          <div className="home-context__photo">
            <Image
              src="/images-webp/mesin/Anugrah Plastik (71).webp"
              alt="Mesin produksi di workshop Anugrah Plastik"
              fill
              sizes="(max-width: 980px) 100vw, 280px"
              loading="eager"
            />
            <span>Workshop · Bandung</span>
            <HomePhotoDialog
              src="/images-webp/mesin/Anugrah Plastik (71).webp"
              alt="Mesin produksi di workshop Anugrah Plastik"
            />
          </div>
          {analyticsHealth ? (
            <div className={`home-health home-health--${analyticsHealth.status}`}>
              <span>Pencatatan kunjungan website</span>
              <strong>
                {analyticsHealth.status === "normal"
                  ? "Sistem berjalan normal"
                  : analyticsHealth.status === "attention"
                    ? "Perlu dipantau"
                    : "Perlu ditangani"}
              </strong>
              <p>
                {analyticsHealth.status === "normal"
                  ? "Kunjungan website tercatat seperti biasa."
                  : analyticsHealth.status === "attention"
                    ? "Laporan kunjungan mungkin sedikit terlambat diperbarui."
                    : "Sebagian kunjungan mungkin belum masuk laporan. Minta admin teknis memeriksa."}
              </p>
              <details>
                <summary>Rincian untuk admin teknis</summary>
                <dl>
                  <div>
                    <dt>Antrean data</dt>
                    <dd>{analyticsHealth.pendingBatches}</dd>
                  </div>
                  <div>
                    <dt>Data tertua menunggu</dt>
                    <dd>{analyticsHealth.oldestSeconds} detik</dd>
                  </div>
                  <div>
                    <dt>Pemroses terakhir aktif</dt>
                    <dd>
                      {analyticsHealth.workerSecondsAgo === null
                        ? "Belum terbaca"
                        : `${analyticsHealth.workerSecondsAgo} detik lalu`}
                    </dd>
                  </div>
                </dl>
              </details>
            </div>
          ) : null}
        </aside>
      </div>

      {report.totals.formEvents > report.totals.forms ? (
        <aside className="home-data-warning" role="status">
          <strong>Periksa data pengiriman formulir</strong>
          <p>
            {report.totals.formEvents} kunjungan tercatat mengirim formulir, tetapi hanya {report.totals.forms}{" "}
            permintaan valid tersimpan. Periksa laporan pengunjung untuk mencari data yang belum cocok.
          </p>
          {user.role !== "content" ? <Link href="/admin/insights">Buka laporan pengunjung →</Link> : null}
        </aside>
      ) : null}

      <section className="home-analytics" aria-labelledby="home-analytics-title">
        <div className="home-section-heading">
          <div>
            <p className="home-kicker">LAPORAN WEBSITE · {label.toUpperCase()}</p>
            <h2 id="home-analytics-title">Kunjungan menurut waktu</h2>
          </div>
          {user.role !== "content" ? (
            <Link href="/admin/insights">
              Laporan lengkap <span aria-hidden="true">→</span>
            </Link>
          ) : null}
        </div>
        <div className="home-analytics__grid">
          <AnalyticsTrendChart points={report.trend} />
          <section className="analytics-summary-card">
            <p className="eyebrow">Perangkat pengunjung</p>
            <h2>Perangkat yang digunakan</h2>
            {report.devices.length ? (
              report.devices.map((item) => (
                <div className="distribution-row" key={item.key}>
                  <span>{item.label}</span>
                  <b style={{ width: `${Math.round((item.total / Math.max(1, report.totals.sessions)) * 100)}%` }} />
                  <strong>{item.total}</strong>
                </div>
              ))
            ) : (
              <p className="home-empty">Belum ada kunjungan yang dapat ditampilkan menurut perangkat.</p>
            )}
          </section>
        </div>
      </section>

      <div className="home-report-heading">
        <div>
          <p className="home-kicker">RINGKASAN PENGUNJUNG</p>
          <h2>Aktivitas pengunjung website</h2>
        </div>
        <p>{label}</p>
      </div>
      <div className="home-details">
        <section className="home-report-card home-report-card--journey" aria-labelledby="home-journey-title">
          <div className="home-report-card__heading">
            <span className="home-report-card__icon">
              <Icon name="chart" />
            </span>
            <div>
              <p className="home-kicker">TINDAKAN PENGUNJUNG</p>
              <h3 id="home-journey-title">Dari kunjungan hingga permintaan masuk</h3>
            </div>
          </div>
          <p className="home-report-card__note">
            Setiap tindakan dihitung terpisah; satu pengunjung bisa melakukan beberapa tindakan.
          </p>
          {report.totals.sessions > 0 ? (
            <ol className="home-journey-list">
              {report.funnel.map((item, index) => (
                <li key={item.label}>
                  <span className="home-journey-list__icon">
                    <Icon name={journeyIcons[index]} />
                  </span>
                  <span className="home-journey-list__label">{item.label}</span>
                  <strong>{item.total.toLocaleString("id-ID")}</strong>
                </li>
              ))}
            </ol>
          ) : (
            <p className="home-empty">Belum ada kunjungan yang tercatat pada periode ini.</p>
          )}
        </section>
        <section className="home-report-card home-report-card--cities" aria-labelledby="home-cities-title">
          <div className="home-report-card__heading">
            <span className="home-report-card__icon">
              <Icon name="pin" />
            </span>
            <div>
              <p className="home-kicker">ASAL KUNJUNGAN</p>
              <h3 id="home-cities-title">Perkiraan kota pengunjung</h3>
            </div>
          </div>
          {report.cities.length ? (
            <ol className="home-city-list">
              {report.cities.map((item) => (
                <li key={item.key}>
                  <div className="home-city-list__label">
                    <span>{item.key}</span>
                    <strong>{item.total.toLocaleString("id-ID")} kunjungan</strong>
                  </div>
                  <div className="home-city-list__track" aria-hidden="true">
                    <span style={{ width: `${(item.total / Math.max(1, report.cities[0]?.total ?? 1)) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="home-empty">Belum ada perkiraan kota pengunjung pada periode ini.</p>
          )}
          {user.role !== "content" ? (
            <Link className="home-report-card__link" href="/admin/insights">
              Lihat laporan pengunjung <span aria-hidden="true">→</span>
            </Link>
          ) : null}
        </section>
      </div>

      <section className="home-exits home-report-card" aria-labelledby="home-exits-title">
        <div className="home-exits__intro">
          <div className="home-report-card__heading">
            <span className="home-report-card__icon">
              <Icon name="section" />
            </span>
            <div>
              <p className="home-kicker">BAGIAN TERAKHIR TERCATAT</p>
              <h3 id="home-exits-title">Bagian website yang terakhir dilihat</h3>
            </div>
          </div>
          <p>Ini bagian terakhir yang tercatat, bukan alasan pengunjung meninggalkan website.</p>
        </div>
        {insight?.exitSections.length ? (
          <ol className="home-exit-grid">
            {insight.exitSections.slice(0, 4).map((item, index) => (
              <li key={item.key} className={`home-exit-grid__tile home-exit-grid__tile--${index + 1}`}>
                <span className="home-exit-grid__icon">
                  <Icon name="section" />
                </span>
                <span className="home-exit-grid__label">{sectionLabel(item.key)}</span>
                <strong>{item.total.toLocaleString("id-ID")}</strong>
                <span className="home-exit-grid__unit">kunjungan</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="home-empty">Belum ada bagian terakhir yang tercatat pada periode ini.</p>
        )}
      </section>

      <section className="home-activity">
        <div className="home-section-heading">
          <div>
            <p className="home-kicker">RIWAYAT</p>
            <h2>Aktivitas terbaru</h2>
          </div>
        </div>
        {overview?.activity.length ? (
          overview.activity.map((event, index) => (
            <div className="home-activity__row" key={`${event.action}-${index}`}>
              <span className="home-activity__dot" />
              <p>
                <strong>{event.actorName ?? "Sistem"}</strong> · {activityLabel(event.action)}
              </p>
              <time dateTime={event.createdAt.toISOString()}>
                {event.createdAt.toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "short",
                  timeZone: "Asia/Jakarta",
                })}
              </time>
            </div>
          ))
        ) : (
          <p className="home-empty">Aktivitas perubahan penting akan tercatat di sini.</p>
        )}
      </section>
    </div>
  );
}
