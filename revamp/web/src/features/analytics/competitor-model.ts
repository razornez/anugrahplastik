export const ownDomain = "anugrahplastik.com";
export const defaultCompetitors = [
  { name: "Barokah Plastik", domain: "barokahplastik.com" },
  { name: "Radian Sinergi", domain: "radiansinergi.com" },
  { name: "Arjuna Plastik", domain: "arjunaplastik.com" },
] as const;
export const searchKeywords = [
  "jasa cetak plastik Bandung",
  "jasa injection plastik Bandung",
  "jasa molding plastik Bandung",
  "cetak plastik custom Bandung",
  "spacer conduit bawah tanah",
  "spacer pipa HDPE",
] as const;

export type Competitor = { name: string; domain: string };
export type SearchAuditResult = { keyword: string; sourceUrl: string; positions: Record<string, number | null> };
export type SearchAudit = {
  id: string;
  checkedAt: Date;
  location: string;
  device: string;
  competitors: Competitor[];
  results: SearchAuditResult[];
};

export function normalizeDomain(raw: string) {
  const value = raw.trim().toLowerCase();
  const domain = value
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
  if (!/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(domain) || domain === ownDomain)
    throw new Error("Domain pesaing tidak valid.");
  return domain;
}

export function isAuditStale(audit: SearchAudit | null, now = new Date()) {
  return audit ? now.getTime() - audit.checkedAt.getTime() > 7 * 24 * 60 * 60 * 1_000 : false;
}

export function summarizeSearchAudit(audit: SearchAudit | null) {
  if (!audit) return null;
  const domains = [{ name: "Anugrah Plastik", domain: ownDomain }, ...audit.competitors];
  const scores = domains.map((item) => ({
    ...item,
    topTen: audit.results.filter((result) => result.positions[item.domain] != null).length,
  }));
  const gap = audit.results.find((result) => {
    const own = result.positions[ownDomain];
    return audit.competitors.some((item) => {
      const competitor = result.positions[item.domain];
      return competitor != null && (own == null || competitor < own);
    });
  });
  const anyVisible = scores.some((item) => item.topTen > 0);
  const lesson = gap
    ? {
        title: `Tinjau halaman untuk “${gap.keyword}”`,
        reason:
          "Pada pemeriksaan terakhir, setidaknya satu pesaing muncul lebih tinggi. Periksa kecocokan isi halaman dan istilah pencarian.",
        href: "/admin/content",
        linkLabel: "Tinjau isi website",
      }
    : !anyVisible
      ? {
          title: "Periksa kecocokan kata kunci pantauan",
          reason:
            "Belum ada situs pembanding yang terlihat pada sepuluh hasil teratas. Tinjau apakah frasa pencarian ini sesuai dengan calon pelanggan.",
          href: "/admin/growth/competitors",
          linkLabel: "Tinjau kata kunci pantauan",
        }
      : {
          title: "Pertahankan kata kunci yang sudah terlihat",
          reason:
            "Belum ada kata kunci terpantau dengan pesaing di atas situs kita. Periksa lagi pada audit berikutnya.",
          href: "/admin/growth/competitors",
          linkLabel: "Lihat rincian posisi",
        };
  return { scores, lesson };
}
