import Link from "next/link";
import { ownDomain, type Competitor } from "@/features/analytics/competitor-model";
import { rankSeoSnapshot, type SeoAuditSnapshot } from "@/features/analytics/seo-benchmark";

export function SeoRankingCard({
  audit,
  competitors,
  error,
  stale,
}: {
  audit: SeoAuditSnapshot | null;
  competitors: Competitor[];
  error: string | null;
  stale: boolean;
}) {
  const sites = audit
    ? [{ name: "Anugrah Plastik", domain: ownDomain }, ...audit.competitors]
    : [{ name: "Anugrah Plastik", domain: ownDomain }, ...competitors];
  const service = audit ? rankSeoSnapshot(audit, "jasa") : null;
  const spacer = audit ? rankSeoSnapshot(audit, "spacer") : null;
  return (
    <aside className="growth-competitors" aria-label="Perbandingan visibilitas pencarian">
      <div className="growth-competitors__head">
        <span>VISIBILITAS PENCARIAN · ORGANIK</span>
        <h2>Siapa yang paling terlihat di pencarian?</h2>
        <p>
          Urutan hanya untuk empat website dan kata kunci yang dipantau, bukan peringkat perusahaan plastik terbaik,
          jumlah pengunjung, atau penjualan.
        </p>
      </div>
      <p className="growth-competitors__method">
        Google organik · Bandung · bahasa Indonesia · desktop · 10 hasil teratas.
      </p>
      {audit ? (
        <>
          <p className="growth-competitors__date">
            {stale ? "Data lebih dari 7 hari · " : "Diperiksa "}
            {audit.checkedAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium" })} WIB
          </p>
          {error ? (
            <p className="admin-notice">Pemeriksaan terbaru gagal: {error}. Hasil terakhir tetap ditampilkan.</p>
          ) : null}
          <h3 className="growth-competitors__category">Jasa cetak plastik · 4 kata kunci</h3>
          <ol className="seo-ranking-list">
            {service?.map((site) => (
              <li key={site.domain}>
                <span className="seo-ranking-list__place">{site.rank ? `#${site.rank}` : "—"}</span>
                <span>
                  <a href={`https://${site.domain}/`} target="_blank" rel="noopener noreferrer">
                    <strong>{site.name}</strong>
                    <small>{site.domain} ↗</small>
                  </a>
                </span>
                <b>{site.points} poin</b>
              </li>
            ))}
          </ol>
          <h3 className="growth-competitors__category">Spacer conduit · 2 kata kunci</h3>
          <p className="growth-competitors__date">Tidak semua kandidat dipastikan menjual spacer.</p>
          <ol className="seo-ranking-list seo-ranking-list--compact">
            {spacer?.map((site) => (
              <li key={site.domain}>
                <span className="seo-ranking-list__place">{site.rank ? `#${site.rank}` : "—"}</span>
                <a href={`https://${site.domain}/`} target="_blank" rel="noopener noreferrer">
                  {site.name} ↗
                </a>
                <b>{site.points} poin</b>
              </li>
            ))}
          </ol>
          <p className="growth-competitors__date">
            Posisi 1 mendapat 10 poin, posisi 10 mendapat 1; di luar 10 besar mendapat 0. Seri diurutkan menurut jumlah
            kata kunci yang muncul, lalu posisi terbaik.
          </p>
        </>
      ) : (
        <div className="growth-competitors__empty">
          <strong>Belum ada data peringkat otomatis</strong>
          <p>Admin perlu menjalankan pemeriksaan. Website di bawah ini belum diurutkan berdasarkan hasil pencarian.</p>
          {error ? <p className="admin-notice">Pemeriksaan terakhir gagal: {error}</p> : null}
          <ul>
            {sites.map((site) => (
              <li key={site.domain}>
                <a href={`https://${site.domain}/`} target="_blank" rel="noopener noreferrer">
                  <strong>{site.name}</strong>
                  <span>{site.domain} ↗</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Link className="growth-competitors__action" href="/admin/growth/competitors">
        {audit ? "Lihat alasan peringkat" : "Periksa kata kunci"} <span aria-hidden="true">→</span>
      </Link>
    </aside>
  );
}
