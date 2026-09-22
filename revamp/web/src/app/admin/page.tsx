import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getWorkspaceOverview, type WorkspacePeriod } from "@/features/workspace/service";

function percentage(current: number, prior: number) {
  if (!prior) return current ? "baru" : "—";
  const value = Math.round(((current - prior) / prior) * 100);
  return `${value >= 0 ? "+" : ""}${value}%`;
}

export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const user = await getSession();
  if (!user) redirect("/admin/login");
  const query = await searchParams;
  const period: WorkspacePeriod = query.period === "today" || query.period === "month" ? query.period : "week";
  const overview = await getWorkspaceOverview(period);
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

      <section className="marketing-pulse">
        <div className="pulse-copy">
          <p className="eyebrow">Pulse pemasaran · {label}</p>
          <strong>{overview?.current.formSubmits ?? 0}</strong>
          <span>form terkirim</span>
          <small>
            {percentage(overview?.current.formSubmits ?? 0, overview?.comparison.forms ?? 0)} dari periode sebelumnya
          </small>
        </div>
        <div className="pulse-metrics">
          <div>
            <span>Sesi</span>
            <strong>{overview?.current.sessions ?? 0}</strong>
            <small>{percentage(overview?.current.sessions ?? 0, overview?.comparison.sessions ?? 0)}</small>
          </div>
          <div>
            <span>CTA diklik</span>
            <strong>{overview?.current.ctaClicks ?? 0}</strong>
          </div>
          <div>
            <span>WhatsApp</span>
            <strong>{overview?.current.whatsappClicks ?? 0}</strong>
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
          <p className="eyebrow">Wawasan minggu ini</p>
          <h2>{(overview?.current.formSubmits ?? 0) > 0 ? "Permintaan mulai masuk." : "Belum ada form terkirim."}</h2>
          <p>
            {(overview?.current.ctaClicks ?? 0) > 0
              ? "Tinjau CTA dan section dengan engagement tertinggi untuk menjaga momentum."
              : "Gunakan halaman Insight untuk melihat section dan CTA yang mulai mendapat perhatian."}
          </p>
          {user.role === "admin" ? (
            <Link href="/admin/insights">Buka insight →</Link>
          ) : (
            <Link href="/admin/content">Tinjau konten →</Link>
          )}
        </section>
      </div>

      <section className="activity-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Jejak kerja</p>
            <h2>Aktivitas terbaru</h2>
          </div>
        </div>
        {overview?.activity.length ? (
          overview.activity.map((event, index) => (
            <div className="activity-item" key={`${event.action}-${index}`}>
              <span />
              <p>
                <strong>{event.actorName ?? "Sistem"}</strong> · {event.action.replace(".", " ")}
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
