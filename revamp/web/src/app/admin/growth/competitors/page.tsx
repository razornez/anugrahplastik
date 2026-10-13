import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin-page-header";
import { CompetitorAuditForm, CompetitorSettingsForm } from "@/components/competitor-audit-forms";
import { getCompetitorVisibility } from "@/features/analytics/competitor-visibility";
import { summarizeSearchAudit } from "@/features/analytics/competitor-model";
import { ownDomain } from "@/features/analytics/competitor-model";
import { getLatestSeoAudit } from "@/features/analytics/seo-audit-service";
import { rankSeoSnapshot, seoCategories } from "@/features/analytics/seo-benchmark";
import { SeoAuditButton } from "@/components/seo-audit-button";
import { getSession } from "@/lib/auth/session";
import "../growth-insights.css";

export const instant = false;

export default async function CompetitorAuditPage() {
  const user = await getSession();
  if (!user) redirect("/admin/login");
  if (user.role !== "admin") redirect("/admin/growth");
  const [data, seo] = await Promise.all([getCompetitorVisibility(), getLatestSeoAudit()]);
  const automaticAudit = seo.audit;
  const opportunity = automaticAudit?.results.find(
    (result) =>
      result.positions[ownDomain] == null &&
      automaticAudit.competitors.some((site) => result.positions[site.domain] != null),
  );
  const summary = summarizeSearchAudit(data.audit);
  return (
    <main className="growth-audit-page">
      <AdminPageHeader
        title="Visibilitas pencarian"
        description="Bandingkan posisi organik berdasarkan frasa, lokasi, perangkat, dan waktu pemeriksaan."
        back={{ href: "/admin/growth", label: "Kembali ke Pemasaran" }}
      />
      {!data.available ? (
        <p className="admin-notice">Database belum terhubung. Pemeriksaan belum dapat disimpan.</p>
      ) : null}
      <section className="growth-audit-last" aria-labelledby="seo-auto-title">
        <div className="seo-audit-heading">
          <div>
            <p className="eyebrow">Audit otomatis · SerpApi</p>
            <h2 id="seo-auto-title">Peringkat untuk kata kunci yang dipantau</h2>
          </div>
          <SeoAuditButton />
        </div>
        <p>
          Audit gratis dibatasi maksimal 36 pencarian per bulan. Hanya membandingkan empat website ini pada Google
          organik, Bandung, bahasa Indonesia, desktop, 10 hasil teratas. Tidak membeli paket atau menambah biaya
          otomatis.
        </p>
        {seo.error ? (
          <p className="admin-notice">Audit terbaru gagal: {seo.error}. Snapshot selesai sebelumnya tetap tersedia.</p>
        ) : null}
        {automaticAudit ? (
          <>
            <p>
              Diperiksa{" "}
              {automaticAudit.checkedAt.toLocaleString("id-ID", {
                timeZone: "Asia/Jakarta",
                dateStyle: "long",
                timeStyle: "short",
              })}{" "}
              WIB{seo.stale ? " · data lebih dari 7 hari" : ""}. Daftar pesaing diambil saat audit dibuat; perubahan
              master hanya berlaku pada audit berikutnya.
            </p>
            {seoCategories.map((category) => (
              <div className="seo-audit-category" key={category.key}>
                <h3>
                  {category.label} · {category.keywords.length} kata kunci
                </h3>
                <p>
                  Skor dihitung dari jumlah (11 dikurangi posisi) untuk posisi 1 sampai 10. Di luar 10 besar bernilai 0.
                  Nilai sama diurutkan menurut jumlah kata kunci yang masuk, lalu posisi terbaik; nilai tetap sama
                  berbagi peringkat.
                </p>
                <ol className="seo-ranking-list">
                  {rankSeoSnapshot(automaticAudit, category.key).map((site) => (
                    <li className="seo-ranking-list__item" key={site.domain}>
                      <span className="seo-ranking-list__place">{site.rank ? `#${site.rank}` : ""}</span>
                      <span className="seo-ranking-list__identity">
                        <a
                          className="seo-ranking-list__link"
                          href={`https://${site.domain}/`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <strong>{site.name}</strong>
                          <small>{site.domain} ↗</small>
                        </a>
                        {!site.rank ? <em>Tidak ditemukan di 10 besar</em> : null}
                      </span>
                      <b className="seo-ranking-list__points">{site.points} poin</b>
                      <details className="seo-ranking-list__details">
                        <summary>Lihat rincian nilai</summary>
                        <ul>
                          {site.contributions.map((item) => (
                            <li className="seo-score-row" key={item.keyword}>
                              <strong className="seo-score-row__keyword">{item.keyword}</strong>
                              <span className="seo-score-row__meta">
                                {item.position
                                  ? `Posisi #${item.position}, ${item.points} poin`
                                  : "Tidak ditemukan di 10 besar, 0 poin"}
                              </span>
                              {item.link ? (
                                <a
                                  className="seo-score-row__evidence"
                                  href={item.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Bukti hasil Google ↗
                                </a>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </li>
                  ))}
                </ol>
                <div className="growth-audit-result-table">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Kata kunci</th>
                        <th scope="col">Anugrah Plastik</th>
                        {automaticAudit.competitors.map((site) => (
                          <th scope="col" key={site.domain}>
                            {site.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {automaticAudit.results
                        .filter((result) => category.keywords.some((keyword) => keyword === result.keyword))
                        .map((result) => (
                          <tr key={result.keyword}>
                            <th scope="row">{result.keyword}</th>
                            {[ownDomain, ...automaticAudit.competitors.map((site) => site.domain)].map((domain) => (
                              <td key={domain}>
                                {result.positions[domain] && result.links[domain] ? (
                                  <a href={result.links[domain]} target="_blank" rel="noopener noreferrer">
                                    #{result.positions[domain]} · halaman ↗
                                  </a>
                                ) : (
                                  "Tidak masuk 10 besar"
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <div className="seo-evidence-grid">
                  {rankSeoSnapshot(automaticAudit, category.key).map((site) => {
                    const serpEvidence = automaticAudit.results.find(
                      (result) =>
                        category.keywords.some((keyword) => keyword === result.keyword) && result.links[site.domain],
                    );
                    return (
                      <article key={site.domain}>
                        <h4>{site.name}</h4>
                        {site.observation?.status === "checked" && site.observation.url ? (
                          <>
                            <a href={site.observation.url} target="_blank" rel="noopener noreferrer">
                              Halaman yang diperiksa ↗
                            </a>
                            <p>
                              <strong>Judul:</strong> {site.observation.title || "Tidak tersedia"}
                            </p>
                            <p>
                              <strong>H1:</strong> {site.observation.heading || "Tidak tersedia"}
                            </p>
                            <ul>
                              {site.observation.signals.length ? (
                                site.observation.signals.map((signal) => <li key={signal}>{signal}</li>)
                              ) : (
                                <li>Belum ada sinyal isi yang tercatat.</li>
                              )}
                            </ul>
                          </>
                        ) : (
                          <>
                            <p>Isi halaman belum berhasil diperiksa. Ini bukan nilai SEO buruk.</p>
                            {serpEvidence?.links[site.domain] ? (
                              <p>
                                Google menampilkan halaman ini untuk “{serpEvidence.keyword}”:{" "}
                                <a href={serpEvidence.links[site.domain]!} target="_blank" rel="noopener noreferrer">
                                  Lihat URL hasil pencarian ↗
                                </a>
                                {serpEvidence.titles?.[site.domain] ? ` · ${serpEvidence.titles[site.domain]}` : ""}
                              </p>
                            ) : null}
                          </>
                        )}
                      </article>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="growth-competitors__lesson">
              <span>PELAJARAN DARI AUDIT</span>
              <strong>
                {opportunity
                  ? `Tinjau halaman untuk “${opportunity.keyword}”`
                  : "Pantau perubahan posisi pada audit berikutnya"}
              </strong>
              <p>
                {opportunity
                  ? "Pada audit ini ada pesaing di 10 hasil teratas, sementara Anugrah Plastik belum terlihat. Buka halaman pesaing dari tabel dan bandingkan topiknya dengan halaman kita."
                  : "Belum ditemukan kata kunci dengan pesaing muncul sementara Anugrah Plastik tidak. Periksa lagi pada audit berikutnya."}{" "}
                Kecocokan judul, H1, dan isi hanya pengamatan halaman, bukan bukti penyebab posisi Google.
              </p>
              <Link href="/admin/content">Tinjau konten website →</Link>
            </div>
          </>
        ) : (
          <p className="admin-notice">
            Belum ada audit otomatis yang selesai. Jalankan “Periksa sekarang” setelah kunci tersedia, atau tunggu
            penjadwalan yang disetujui untuk produksi. Angka peringkat tidak ditebak.
          </p>
        )}
      </section>
      <section className="growth-audit-last" aria-labelledby="seo-options-title">
        <h2 id="seo-options-title">Pilihan layanan SEO jika kebutuhan bertambah</h2>
        <p>
          Informasi harga perlu diperiksa lagi sebelum membeli. Tidak ada pembelian otomatis. Perkiraan diperiksa 1
          Oktober 2026.
        </p>
        <ul className="seo-paid-options">
          <li>
            <a
              href="https://dataforseo.com/pricing/google-serp/google-organic-serp-api"
              target="_blank"
              rel="noopener noreferrer"
            >
              DataForSEO ↗
            </a>{" "}
            · sekitar US$0,0006 hingga US$0,002 per pencarian · SERP bayar per pencarian.
          </li>
          <li>
            <a href="https://serpapi.com/pricing" target="_blank" rel="noopener noreferrer">
              SerpApi Starter ↗
            </a>{" "}
            · sekitar US$25/bulan · kuota pencarian lebih besar.
          </li>
          <li>
            <a href="https://ahrefs.com/pricing" target="_blank" rel="noopener noreferrer">
              Ahrefs ↗
            </a>{" "}
            · Starter US$29/bulan; Lite US$129/bulan untuk perangkat SEO lebih lengkap.
          </li>
          <li>
            <a href="https://www.semrush.com/pricing/" target="_blank" rel="noopener noreferrer">
              Semrush ↗
            </a>{" "}
            · mulai sekitar US$139/bulan · pemantauan dan audit SEO lebih luas.
          </li>
        </ul>
      </section>
      <h2>Riwayat pemeriksaan manual</h2>
      {data.audit ? (
        <section className="growth-audit-last">
          <h2>Pemeriksaan terakhir</h2>
          <p>
            {data.audit.checkedAt.toLocaleString("id-ID", {
              timeZone: "Asia/Jakarta",
              dateStyle: "long",
              timeStyle: "short",
            })}{" "}
            WIB · {data.audit.location} · {data.audit.device}
          </p>
          <div className="growth-audit-last-scores">
            {summary?.scores.map((item) => (
              <span key={item.domain}>
                <strong>
                  {item.topTen}/{data.audit!.results.length}
                </strong>{" "}
                {item.name}
              </span>
            ))}
          </div>
          <div className="growth-audit-result-table">
            <table>
              <thead>
                <tr>
                  <th scope="col">Kata kunci</th>
                  <th scope="col">Anugrah Plastik</th>
                  {data.audit.competitors.map((competitor) => (
                    <th scope="col" key={competitor.domain}>
                      {competitor.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.audit.results.map((result) => (
                  <tr key={result.keyword}>
                    <th scope="row">{result.keyword}</th>
                    {["anugrahplastik.com", ...data.audit!.competitors.map((item) => item.domain)].map((domain) => (
                      <td key={domain}>{result.positions[domain] ?? "Tidak masuk 10 besar"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <a href={`/api/admin/growth/audits/${data.audit.id}/evidence`} target="_blank" rel="noreferrer">
            Lihat bukti tersimpan ↗
          </a>
        </section>
      ) : (
        <p className="admin-notice">Belum ada pemeriksaan. Daftar di bawah adalah kandidat, bukan hasil peringkat.</p>
      )}
      <CompetitorSettingsForm competitors={data.competitors} />
      <CompetitorAuditForm competitors={data.competitors} />
    </main>
  );
}
