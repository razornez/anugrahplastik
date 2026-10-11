import Link from "next/link";
import { OpportunityDiscoveryButton } from "@/components/opportunity-discovery-button";
import { reviewSearchOpportunity } from "@/features/analytics/opportunity-actions";
import { groupSearchOpportunities, type SearchOpportunity } from "@/features/analytics/search-opportunities";

const labels = {
  gap: { eyebrow: "Celah pesaing", title: "Di mana kita belum terlihat?", number: "01" },
  need: { eyebrow: "Kebutuhan pelanggan", title: "Apa yang ingin mereka ketahui?", number: "02" },
  trend: { eyebrow: "Sinyal produk", title: "Apa yang mulai banyak dicari?", number: "03" },
} as const;

const statuses = {
  new: "Belum ditinjau",
  reviewing: "Sedang ditinjau",
  relevant: "Relevan",
  dismissed: "Disisihkan",
} as const;

function formattedDate(date: Date) {
  return date.toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function SignalIcon({ kind }: { kind: keyof typeof labels }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  if (kind === "gap")
    return (
      <svg {...common}>
        <path d="M3 18h18M5 14l4-4 4 2 6-7" />
        <path d="M16 5h3v3" />
      </svg>
    );
  if (kind === "need")
    return (
      <svg {...common}>
        <path d="M4 5h16v11H9l-5 4V5Z" />
        <path d="M9 9h6M9 12h4" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M3 18h18M5 15l5-5 3 3 6-7" />
      <path d="M16 6h3v3" />
    </svg>
  );
}

function nextStep(item: SearchOpportunity) {
  if (item.needsProductionCheck)
    return "Periksa mesin, material, mould, kapasitas, dan permintaan nyata sebelum memasukkan produk ini ke penawaran.";
  if (item.kind === "gap")
    return "Tinjau halaman jasa yang sesuai, lalu perjelas layanan dan contoh hasil kerja yang memang tersedia.";
  if (item.kind === "question")
    return "Jawab pertanyaan ini pada halaman yang relevan dengan informasi yang sudah dipastikan benar.";
  return "Gunakan bahasa pencarian ini bila sesuai dengan layanan; jangan anggap frasa terkait sebagai volume permintaan.";
}

function OpportunityEntry({
  item,
  canReview,
  featured = false,
}: {
  item: SearchOpportunity;
  canReview: boolean;
  featured?: boolean;
}) {
  const typeLabel = {
    gap: "Posisi organik",
    question: "Pertanyaan terkait",
    phrase: "Frasa pencarian",
    trend: "Minat relatif",
  }[item.kind];

  return (
    <div className={`opportunity-entry${featured ? " opportunity-entry--featured" : ""}`}>
      <div className="opportunity-entry__top">
        <span className={`opportunity-entry__status is-${item.status}`}>{statuses[item.status]}</span>
        <span>{typeLabel}</span>
      </div>
      <h4>{item.title}</h4>
      <div className="opportunity-entry__fact">
        <span>Mengapa menarik</span>
        <p>{item.explanation}</p>
      </div>
      <div className="opportunity-entry__fact">
        <span>Bukti pemeriksaan</span>
        <p>
          {item.evidence} · {formattedDate(item.checkedAt)} WIB
        </p>
      </div>
      <div className="opportunity-entry__next">
        <span>Langkah berikutnya</span>
        <p>{nextStep(item)}</p>
      </div>
      <div className="opportunity-entry__footer">
        {item.sourceHref.startsWith("https://") ? (
          <a href={item.sourceHref} target="_blank" rel="noopener noreferrer">
            Periksa sumber asli ↗
          </a>
        ) : null}
        {item.kind !== "trend" ? <Link href={item.actionHref}>Tinjau konten ↗</Link> : null}
        {canReview ? (
          <form action={reviewSearchOpportunity} className="opportunity-entry__review">
            <input type="hidden" name="key" value={item.key} />
            <label htmlFor={`review-${item.key}`}>Keputusan admin</label>
            <div>
              <select
                id={`review-${item.key}`}
                name="status"
                defaultValue={item.status === "new" ? "reviewing" : item.status}
              >
                <option value="reviewing">Sedang ditinjau</option>
                <option value="relevant">Relevan</option>
                <option value="dismissed">Sisihkan</option>
              </select>
              <button type="submit">Simpan</button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}

export function GrowthOpportunityBoard({
  embedded = false,
  items,
  seoDate,
  seoNotice,
  trendDate,
  trendNotice,
  trendAttemptedAt,
  needDate,
  needStatus,
  needNotice,
  budget,
  visibleAds,
  canReview,
}: {
  embedded?: boolean;
  items: SearchOpportunity[];
  seoDate: Date | null;
  seoNotice: string | null;
  trendDate: Date | null;
  trendNotice: string | null;
  trendAttemptedAt: Date | null;
  needDate: Date | null;
  needStatus: string;
  needNotice: string | null;
  budget: { used: number; limit: number; available: number } | null;
  visibleAds: { keyword: string; title: string; domain: string; link: string | null }[];
  canReview: boolean;
}) {
  const groups = groupSearchOpportunities(items);
  const visible = Object.values(groups).flatMap((group) => group.active);
  const latest =
    [seoDate, trendDate, needDate]
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  return (
    <section
      id={embedded ? undefined : "peluang"}
      className="opportunity-board"
      aria-labelledby={embedded ? undefined : "opportunity-board-title"}
      aria-label={embedded ? "Temuan pemasaran" : undefined}
    >
      <div className="opportunity-board__head">
        <div>
          <p className="eyebrow">Radar peluang · hasil pencarian nyata</p>
          <h2 id="opportunity-board-title">Peluang yang bisa kita tindak lanjuti.</h2>
          <p>
            Temuan utama, buktinya, dan langkah berikutnya tersedia di sini. Tidak perlu membuka laporan lain untuk
            memahaminya.
          </p>
        </div>
        <span className="opportunity-board__updated">
          {latest ? `Diperiksa ${formattedDate(latest)} WIB` : "Menunggu pemeriksaan pertama"}
        </span>
      </div>
      <div className="opportunity-board__hero">
        <div className="opportunity-board__hero-copy">
          <span className="opportunity-board__live">
            <span aria-hidden="true" /> RADAR PELUANG
          </span>
          <div className="opportunity-board__big-number">
            <strong>{visible.length}</strong>
            <span>
              temuan
              <br />
              aktif
            </span>
          </div>
          <p>
            {visible.length
              ? "Mulai dari bukti, lalu pilih peluang yang sesuai dengan kemampuan dan kebutuhan pelanggan."
              : "Belum ada temuan aktif. Status audit dan tiap kategori dapat dilihat langsung di bawah."}
          </p>
        </div>
        <div className="opportunity-board__radar" aria-hidden="true">
          <div className="opportunity-board__orbit opportunity-board__orbit--outer" />
          <div className="opportunity-board__orbit opportunity-board__orbit--middle" />
          <div className="opportunity-board__orbit opportunity-board__orbit--inner" />
          <div className="opportunity-board__radar-core">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <path d="M6 28V12l14-8 14 8v16l-14 8L6 28Z" stroke="currentColor" strokeWidth="2" />
              <path d="M6 12l14 8 14-8M20 20v16" stroke="currentColor" strokeWidth="2" />
            </svg>
          </div>
          {visible.length ? (
            <>
              <i className="opportunity-board__beacon opportunity-board__beacon--one" />
              <i className="opportunity-board__beacon opportunity-board__beacon--two" />
              <i className="opportunity-board__beacon opportunity-board__beacon--three" />
            </>
          ) : null}
        </div>
        <div className="opportunity-board__hero-side">
          <span>SUMBER PEMERIKSAAN</span>
          <strong>Google Search{trendDate ? " + Trends" : ""}</strong>
          <p>6 kata kunci tetap · hasil organik Bandung</p>
          <p>
            {trendDate
              ? `Minat relatif Indonesia · ${formattedDate(trendDate)}`
              : (trendNotice ?? "Tren produk belum diperiksa")}
          </p>
          <small>Bukan data trafik atau penjualan pesaing.</small>
        </div>
      </div>

      {canReview && budget ? (
        <OpportunityDiscoveryButton used={budget.used} limit={budget.limit} available={budget.available} />
      ) : null}

      <div className="opportunity-board__tiles">
        {(["gap", "need", "trend"] as const).map((kind) => {
          const group = groups[kind];
          const [featured, ...more] = group.active;
          const compact = !featured && group.dismissed.length === 0 && kind !== "gap";
          const empty =
            kind === "trend"
              ? (trendNotice ??
                (trendDate
                  ? "Belum ada pencarian terkait yang ditandai naik pada audit tren ini."
                  : "Tren produk belum diperiksa. Jalankan pemeriksaan peluang untuk melihat sinyal terbaru."))
              : kind === "gap"
                ? (seoNotice ??
                  (seoDate
                    ? "Tidak ada celah posisi yang tercatat pada audit terakhir."
                    : "Audit pencarian belum tersedia."))
                : (needNotice ??
                  (needDate
                    ? `Tiga frasa sudah diperiksa pada ${formattedDate(needDate)}, tetapi sumber belum menampilkan pertanyaan atau frasa terkait.`
                    : needStatus === "running"
                      ? "Pemeriksaan pertanyaan dan frasa sedang berjalan. Muat ulang halaman sebentar lagi."
                      : seoDate
                        ? "Audit peringkat lama belum memuat pertanyaan dan frasa. Jalankan pemeriksaan peluang."
                        : "Audit pencarian belum tersedia."));
          return (
            <article
              className={`opportunity-tile opportunity-tile--${kind}${compact ? " opportunity-tile--compact" : ""}`}
              key={kind}
            >
              <div className="opportunity-tile__top">
                <span className="opportunity-tile__icon">
                  <SignalIcon kind={kind} />
                </span>
                <span className="opportunity-tile__number">{labels[kind].number} / 03</span>
              </div>
              <p className="opportunity-tile__eyebrow">{labels[kind].eyebrow}</p>
              <h3>{labels[kind].title}</h3>
              {featured ? (
                <OpportunityEntry item={featured} canReview={canReview} featured />
              ) : (
                <div className="opportunity-tile__empty">
                  <p>
                    {group.dismissed.length
                      ? "Semua temuan kategori ini sudah disisihkan. Anda dapat meninjaunya kembali di bawah."
                      : empty}
                  </p>
                  {compact ? (
                    <small>
                      {kind === "need" && needDate ? `Diperiksa ${formattedDate(needDate)} · ` : ""}
                      {kind === "trend" && trendDate ? `Diperiksa ${formattedDate(trendDate)} · ` : ""}
                      {kind === "trend" && !trendDate && trendAttemptedAt
                        ? `Dicoba ${formattedDate(trendAttemptedAt)} · `
                        : ""}
                      Pemeriksaan berikutnya: Senin, 09.00 WIB, atau jalankan sebagai admin.
                    </small>
                  ) : null}
                </div>
              )}
              {more.length ? (
                <details className="opportunity-tile__more">
                  <summary>
                    Lihat {more.length} temuan lainnya <span aria-hidden="true">⌄</span>
                  </summary>
                  <div className="opportunity-tile__more-list">
                    {more.map((item) => (
                      <OpportunityEntry key={item.key} item={item} canReview={canReview} />
                    ))}
                  </div>
                </details>
              ) : null}
              {group.dismissed.length ? (
                <details className="opportunity-tile__more opportunity-tile__more--dismissed">
                  <summary>
                    {group.dismissed.length} temuan disisihkan <span aria-hidden="true">⌄</span>
                  </summary>
                  <div className="opportunity-tile__more-list">
                    {group.dismissed.map((item) => (
                      <OpportunityEntry key={item.key} item={item} canReview={canReview} />
                    ))}
                  </div>
                </details>
              ) : null}
            </article>
          );
        })}
      </div>
      {seoDate ? (
        <details className="opportunity-board__ads">
          <summary>
            Pesan iklan yang terlihat saat audit ({visibleAds.length}) <span aria-hidden="true">⌄</span>
          </summary>
          <p>Ini contoh pesan di hasil pencarian, bukan data biaya atau performa iklan pengiklan.</p>
          {visibleAds.length ? (
            <div>
              {visibleAds.map((ad, index) => (
                <article key={`${ad.keyword}-${index}`}>
                  <small>{ad.keyword}</small>
                  <strong>{ad.title}</strong>
                  <span>{ad.domain || "Domain tidak tersedia"}</span>
                  {ad.link ? (
                    <a href={ad.link} target="_blank" rel="noopener noreferrer">
                      Buka halaman iklan ↗
                    </a>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p>Tidak ada iklan yang tercatat pada audit ini.</p>
          )}
        </details>
      ) : null}
      <p className="opportunity-board__disclaimer">
        “Naik” pada Trends adalah perubahan minat relatif; frasa terkait dan tampilan pesaing bukan jumlah permintaan,
        pengunjung, atau penjualan. Ide produk baru memerlukan validasi produksi.
      </p>
    </section>
  );
}
