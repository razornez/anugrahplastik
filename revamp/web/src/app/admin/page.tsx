import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getWorkspaceOverview, type WorkspacePeriod } from "@/features/workspace/service";
import { AnalyticsTrendChart } from "@/components/analytics-trend-chart";
import { getAnalyticsReport } from "@/features/analytics/report-service";
import { getAnalyticsHealth } from "@/features/analytics/health-service";

export const instant = false;

function activityLabel(action: string) {
  const labels: Record<string, string> = {
    "prospect.assigned": "Penanggung jawab prospek diperbarui",
    "prospect.note_added": "Catatan prospek ditambahkan",
    "prospect.whatsapp_started": "Percakapan WhatsApp dibuka",
    "content.publish": "Perubahan halaman utama diterbitkan",
    "content.draft": "Perubahan halaman utama disimpan",
    "team.member_created": "Anggota tim ditambahkan",
    "team.member_activated": "Akses anggota tim diaktifkan",
    "team.member_deactivated": "Akses anggota tim dinonaktifkan",
  };
  return labels[action] ?? "Perubahan diperbarui";
}

export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const user = await getSession();
  if (!user) redirect("/admin/login");
  const query = await searchParams;
  const period: WorkspacePeriod = query.period === "today" || query.period === "month" ? query.period : "week";
  const days = period === "today" ? 7 : period === "month" ? 30 : 7;
  const [overview, report, analyticsHealth] = await Promise.all([
    getWorkspaceOverview(period),
    getAnalyticsReport({ days, device: "all", city: "", source: "", outcome: "" }),
    user.role === "admin" ? getAnalyticsHealth() : Promise.resolve(null),
  ]);
  const label = period === "today" ? "Hari ini" : period === "month" ? "Bulan berjalan" : "7 hari terakhir";

  return (
    <div className="workspace-page">
      <header className="workspace-topbar">
        <div>
          <p className="eyebrow">Ruang kendali</p>
          <h1>Halo, {user.name.split(" ")[0]}.</h1>
          <span>Ringkasan pemasaran dan tindakan yang perlu diperhatikan.</span>
        </div>
        <nav className="period-switch" aria-label="Periode laporan">
          <Link aria-current={period === "today" ? "page" : undefined} href="/admin?period=today">
            Hari ini
          </Link>
          <Link aria-current={period === "week" ? "page" : undefined} href="/admin?period=week">
            7 hari
          </Link>
          <Link aria-current={period === "month" ? "page" : undefined} href="/admin?period=month">
            Bulan
          </Link>
        </nav>
      </header>

      <section className="workspace-priority-strip" aria-label="Ringkasan tindakan hari ini">
        <article>
          <span>Perlu ditindaklanjuti</span>
          <strong>{overview?.current.unassigned ?? 0}</strong>
          <p>prospek belum memiliki penanggung jawab</p>
          <Link href="/admin/prospects">Buka prospek →</Link>
        </article>
        {user.role !== "content" ? (
          <article>
            <span>Order berjalan</span>
            <strong>{overview?.operations.openOrders ?? 0}</strong>
            <p>{overview?.operations.paymentAttention ?? 0} pekerjaan belum berstatus pembayaran terverifikasi</p>
            <Link href="/admin/transactions">Buka transaksi →</Link>
          </article>
        ) : null}
        <article>
          <span>Kinerja pemasaran</span>
          <strong>{report.totals.forms}</strong>
          <p>lead unik valid dalam periode yang dipilih</p>
          <Link href={user.role === "content" ? "/admin/content" : "/admin/insights"}>Lihat rincian →</Link>
        </article>
      </section>

      <section className="marketing-pulse">
        <div className="pulse-copy">
          <p className="eyebrow">Ringkasan pemasaran · {label}</p>
          <strong>{report.totals.forms}</strong>
          <span>form terkirim</span>
          <small>berdasarkan kunjungan pada periode ini</small>
        </div>
        <div className="pulse-metrics">
          <div>
            <span>Pengunjung</span>
            <strong>{report.totals.sessions}</strong>
            <small>kunjungan anonim</small>
          </div>
          <div>
            <span>Tombol minat</span>
            <strong>{report.totals.ctaClicks}</strong>
          </div>
          <div>
            <span>Klik WhatsApp</span>
            <strong>{report.totals.whatsappClicks}</strong>
          </div>
          <div>
            <span>Prospek baru</span>
            <strong>{overview?.current.leads ?? 0}</strong>
          </div>
        </div>
        <div className="pulse-media" aria-hidden="true">
          <Image
            src="/images-webp/mesin/Anugrah Plastik (105).webp"
            alt=""
            fill
            sizes="(max-width: 760px) 100vw, 360px"
            priority
          />
          <span>Workshop · Bandung</span>
        </div>
      </section>

      <div className="analytics-overview-grid">
        <AnalyticsTrendChart points={report.trend} />
        <section className="analytics-summary-card">
          <p className="eyebrow">Perangkat pengunjung</p>
          <h2>Dari mana mereka membuka website?</h2>
          {report.devices.length ? (
            report.devices.map((item) => (
              <div className="distribution-row" key={item.key}>
                <span>{item.label}</span>
                <b style={{ width: `${Math.round((item.total / Math.max(1, report.totals.sessions)) * 100)}%` }} />
                <strong>{item.total}</strong>
              </div>
            ))
          ) : (
            <p className="empty-copy">Belum ada data perangkat.</p>
          )}
        </section>
      </div>

      <div className="analytics-overview-grid analytics-overview-grid--secondary">
        <section className="analytics-summary-card">
          <p className="eyebrow">Perjalanan menuju permintaan</p>
          <h2>Di langkah mana minat berkurang?</h2>
          {report.funnel.map((item) => (
            <div className="funnel-row" key={item.label}>
              <span>{item.label}</span>
              <b style={{ width: `${Math.round((item.total / Math.max(1, report.funnel[0]?.total ?? 1)) * 100)}%` }} />
              <strong>{item.total}</strong>
            </div>
          ))}
        </section>
        <section className="analytics-summary-card">
          <p className="eyebrow">Wilayah kunjungan</p>
          <h2>Lokasi perkiraan berdasarkan jaringan</h2>
          {report.cities.length ? (
            report.cities.map((item) => (
              <div className="location-row" key={item.key}>
                <span>{item.key}</span>
                <strong>{item.total} kunjungan</strong>
              </div>
            ))
          ) : (
            <p className="empty-copy">Lokasi akan terlihat ketika database GeoIP lokal telah dipasang di server.</p>
          )}
          {user.role !== "content" ? (
            <Link className="report-link" href="/admin/insights">
              Lihat perjalanan pengunjung →
            </Link>
          ) : null}
        </section>
      </div>

      {user.role === "admin" && analyticsHealth ? (
        <section className={`analytics-health analytics-health--${analyticsHealth.status}`}>
          <div>
            <p className="eyebrow">Kesehatan pencatatan pengunjung</p>
            <h2>
              {analyticsHealth.status === "normal"
                ? "Sistem masih lapang"
                : analyticsHealth.status === "attention"
                  ? "Perlu dipantau"
                  : "Perlu ditangani"}
            </h2>
            <p>{analyticsHealth.message}</p>
          </div>
          <dl>
            <div>
              <dt>Antrean</dt>
              <dd>{analyticsHealth.pendingBatches} batch</dd>
            </div>
            <div>
              <dt>Batch tertua</dt>
              <dd>{analyticsHealth.oldestSeconds} dtk</dd>
            </div>
            <div>
              <dt>Worker</dt>
              <dd>
                {analyticsHealth.workerSecondsAgo === null
                  ? "Belum terbaca"
                  : `${analyticsHealth.workerSecondsAgo} dtk lalu`}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      <div className="workspace-grid">
        <section className="action-list">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Tindakan</p>
              <h2>Perlu ditindaklanjuti</h2>
            </div>
            <Link href="/admin/prospects">Lihat semua</Link>
          </div>
          {overview?.recentLeads.length ? (
            overview.recentLeads.map((lead) => (
              <Link className="prospect-row" href={`/admin/prospects?selected=${lead.id}`} key={lead.id}>
                <span className="prospect-initial">{lead.name.slice(0, 1)}</span>
                <span>
                  <strong>{lead.name}</strong>
                  <small>{lead.message}</small>
                </span>
                <span className="prospect-owner">{lead.assignedName ?? "Belum ditugaskan"}</span>
              </Link>
            ))
          ) : (
            <p className="empty-copy">Belum ada prospek untuk ditindaklanjuti.</p>
          )}
          {overview?.current.unassigned ? (
            <div className="attention-note">{overview.current.unassigned} prospek belum memiliki penanggung jawab.</div>
          ) : null}
        </section>
        <section className="insight-card">
          <p className="eyebrow">Yang perlu diperhatikan</p>
          <h2>{report.totals.forms > 0 ? "Permintaan mulai masuk." : "Belum ada form terkirim."}</h2>
          <p>
            {report.totals.ctaClicks > 0
              ? "Lihat tombol dan bagian halaman yang paling sering menarik minat pengunjung."
              : "Buka laporan pengunjung untuk melihat bagian halaman yang mulai sering diperhatikan."}
          </p>
          {user.role === "admin" || user.role === "sales" ? (
            <Link href="/admin/insights">Buka laporan →</Link>
          ) : (
            <Link href="/admin/content">Tinjau konten →</Link>
          )}
        </section>
      </div>

      <section className="activity-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Riwayat perubahan</p>
            <h2>Aktivitas terbaru</h2>
          </div>
        </div>
        {overview?.activity.length ? (
          overview.activity.map((event, index) => (
            <div className="activity-item" key={`${event.action}-${index}`}>
              <span />
              <p>
                <strong>{event.actorName ?? "Sistem"}</strong> · {activityLabel(event.action)}
              </p>
              <time>{event.createdAt.toLocaleDateString("id-ID", { day: "numeric", month: "short" })}</time>
            </div>
          ))
        ) : (
          <p className="empty-copy">Aktivitas perubahan penting akan tercatat di sini.</p>
        )}
      </section>
    </div>
  );
}
