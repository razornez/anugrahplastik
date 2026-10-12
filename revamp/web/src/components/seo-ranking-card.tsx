import Link from "next/link";
import { ownDomain, type Competitor } from "@/features/analytics/competitor-model";
import { rankSeoSnapshot, type SeoAuditSnapshot } from "@/features/analytics/seo-benchmark";

type RankedSite = ReturnType<typeof rankSeoSnapshot>[number];

function RankingList({ items }: { items: RankedSite[] }) {
  return (
    <ol className="seo-ranking-list">
      {items.map((site) => (
        <li key={site.domain}>
          <span className="seo-ranking-list__place">{site.rank ? `#${site.rank}` : ""}</span>
          <span className="seo-ranking-list__identity">
            <a href={`https://${site.domain}/`} rel="noopener noreferrer" target="_blank">
              <strong>{site.name}</strong>
              <small>{site.domain} ↗</small>
            </a>
            {!site.rank ? <em>Tidak ditemukan di 10 besar</em> : null}
          </span>
          <b>{site.points} poin</b>
          <details className="seo-ranking-list__details">
            <summary>Rincian nilai</summary>
            <ul>
              {site.contributions.map((item) => (
                <li key={item.keyword}>
                  <strong>{item.keyword}</strong>
                  <span>
                    {item.position
                      ? `Posisi #${item.position}, ${item.points} poin`
                      : "Tidak ditemukan di 10 besar, 0 poin"}
                  </span>
                  {item.link ? (
                    <a href={item.link} rel="noopener noreferrer" target="_blank">
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
  );
}

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
          <details className="growth-competitors__method-help">
            <summary aria-label="Cara nilai ini dihitung">?</summary>
            <p>
              Nilai adalah jumlah 11 dikurangi posisi Google untuk setiap kata kunci yang masuk 10 besar. Ini hanya
              membandingkan situs dan kata kunci pada audit ini, bukan nilai kualitas website, bisnis, penjualan, atau
              reputasi perusahaan.
            </p>
          </details>
          {error ? (
            <p className="admin-notice">Pemeriksaan terbaru gagal: {error}. Hasil terakhir tetap ditampilkan.</p>
          ) : null}
          <h3 className="growth-competitors__category">Jasa cetak plastik · 4 kata kunci</h3>
          {service ? <RankingList items={service} /> : null}
          <h3 className="growth-competitors__category">Spacer conduit · 2 kata kunci</h3>
          <p className="growth-competitors__date">Tidak semua kandidat dipastikan menjual spacer.</p>
          {spacer ? <RankingList items={spacer} /> : null}
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
