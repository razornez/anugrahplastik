import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { analyticsWhatsappReport, getAnalyticsInsight, type InsightRow } from "@/features/analytics/insight-service";

function InsightList({ title, items }: { title: string; items: InsightRow[] }) {
  return (
    <section className="insight-list">
      <h2>{title}</h2>
      {items.length ? (
        <ol>
          {items.map((item) => (
            <li key={item.key}>
              <span>{item.key.replace("ap-", "")}</span>
              <strong>{item.total}</strong>
            </li>
          ))}
        </ol>
      ) : (
        <p>Belum ada data untuk periode ini.</p>
      )}
    </section>
  );
}

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const user = await getSession();
  if (user?.role !== "admin") redirect("/admin/login");

  const query = await searchParams;
  const days = query.days === "30" ? 30 : 7;
  const insight = await getAnalyticsInsight(days);
  const whatsappUrl = `https://wa.me/628122339587?text=${encodeURIComponent(analyticsWhatsappReport(insight))}`;

  return (
    <section className="admin-card insights-card">
      <p>INSIGHT & TINDAKAN</p>
      <div className="insights-heading">
        <div>
          <h1>Perilaku pengunjung</h1>
          <span>Hanya data dari pengunjung yang memberi persetujuan analitik.</span>
        </div>
        <a className="insight-wa" href={whatsappUrl} target="_blank" rel="noreferrer">
          Kirim ringkasan ke WhatsApp
        </a>
      </div>
      <nav className="insight-period" aria-label="Pilih periode">
        <a aria-current={days === 7 ? "page" : undefined} href="/admin/insights?days=7">
          7 hari
        </a>
        <a aria-current={days === 30 ? "page" : undefined} href="/admin/insights?days=30">
          30 hari
        </a>
      </nav>
      {!insight.available ? (
        <div className="admin-status">Database belum tersambung. Insight akan muncul setelah koneksi aktif.</div>
      ) : null}
      <div className="insight-metrics">
        <div>
          <span>Sesi anonim</span>
          <strong>{insight.sessions}</strong>
        </div>
        <div>
          <span>Interaksi</span>
          <strong>{insight.events}</strong>
        </div>
        <div>
          <span>Form terkirim</span>
          <strong>{insight.formSubmits}</strong>
        </div>
        <div>
          <span>Klik WhatsApp</span>
          <strong>{insight.whatsappClicks}</strong>
        </div>
      </div>
      <div className="insight-grid">
        <InsightList title="Section paling banyak dibaca" items={insight.topSections} />
        <InsightList title="CTA paling banyak diklik" items={insight.topCtas} />
        <InsightList title="Titik keluar terbanyak" items={insight.exitSections} />
      </div>
    </section>
  );
}
