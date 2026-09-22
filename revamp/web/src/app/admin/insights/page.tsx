import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { analyticsWhatsappReport, getAnalyticsInsight, type InsightRow } from "@/features/analytics/insight-service";
import { actionLabel, sectionLabel } from "@/features/analytics/display-labels";

function InsightList({ title, items, label }: { title: string; items: InsightRow[]; label: (key: string) => string }) {
  return (
    <section className="insight-list">
      <h2>{title}</h2>
      {items.length ? (
        <ol>
          {items.map((item) => (
            <li key={item.key}>
              <span>{label(item.key)}</span>
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
      <p>LAPORAN PENGUNJUNG</p>
      <div className="insights-heading">
        <div>
          <h1>Apa yang menarik perhatian pengunjung?</h1>
          <span>Data ini hanya berasal dari pengunjung yang menyetujui pengukuran penggunaan website.</span>
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
        <div className="admin-status">Data belum dapat dimuat. Laporan akan muncul setelah koneksi aktif.</div>
      ) : null}
      <div className="insight-metrics">
        <div>
          <span>Kunjungan tercatat</span>
          <strong>{insight.sessions}</strong>
        </div>
        <div>
          <span>Interaksi di halaman</span>
          <strong>{insight.events}</strong>
        </div>
        <div>
          <span>Form permintaan masuk</span>
          <strong>{insight.formSubmits}</strong>
        </div>
        <div>
          <span>Tekan tombol WhatsApp</span>
          <strong>{insight.whatsappClicks}</strong>
        </div>
      </div>
      <div className="insight-grid">
        <InsightList title="Bagian yang paling diperhatikan" items={insight.topSections} label={sectionLabel} />
        <InsightList title="Tombol yang paling sering diklik" items={insight.topCtas} label={actionLabel} />
        <InsightList title="Bagian yang sering ditinggalkan" items={insight.exitSections} label={sectionLabel} />
      </div>
    </section>
  );
}
