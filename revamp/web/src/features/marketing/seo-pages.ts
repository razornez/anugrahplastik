export type SeoPage = {
  slug: string;
  kind: "service" | "product";
  title: string;
  description: string;
  eyebrow: string;
  heading: string;
  intro: string;
  image: string;
  imageAlt: string;
  points: string[];
};

export const seoPages: SeoPage[] = [
  {
    slug: "cetak-plastik-custom",
    kind: "service",
    title: "Cetak Plastik Custom Bandung | Anugrah Plastik",
    description:
      "Jasa cetak plastik custom di Bandung untuk komponen, kemasan, dan kebutuhan produksi berdasarkan sampel atau gambar.",
    eyebrow: "JASA CETAK PLASTIK CUSTOM",
    heading: "Cetak plastik sesuai kebutuhan produk Anda.",
    intro:
      "Kirim sampel, foto, atau gambar part. Tim Anugrah Plastik membantu menilai bentuk, proses, dan kebutuhan produksi sebelum penawaran disusun.",
    image: "/images-webp/products/wadah-cup-abu.webp",
    imageAlt: "Contoh wadah plastik custom hasil produksi Anugrah Plastik",
    points: [
      "Evaluasi dari sampel atau gambar",
      "Untuk komponen dan produk plastik custom",
      "Konsultasi sebelum proses produksi",
    ],
  },
  {
    slug: "injection-molding-bandung",
    kind: "service",
    title: "Injection Molding Bandung | Anugrah Plastik",
    description:
      "Layanan injection molding di Bandung untuk pembuatan komponen plastik custom berdasarkan kebutuhan proyek.",
    eyebrow: "INJECTION MOLDING BANDUNG",
    heading: "Komponen plastik custom untuk kebutuhan produksi.",
    intro:
      "Kami membantu menerjemahkan kebutuhan part menjadi proses produksi yang sesuai. Detail material, bentuk, dan jumlah dibahas setelah evaluasi kebutuhan.",
    image: "/images-webp/mesin/Anugrah%20Plastik%20%28105%29.webp",
    imageAlt: "Mesin produksi plastik di workshop Anugrah Plastik",
    points: [
      "Diskusi fungsi dan bentuk part",
      "Evaluasi proses sesuai kebutuhan",
      "Penawaran disusun setelah kebutuhan jelas",
    ],
  },
  {
    slug: "sparepart-plastik-custom",
    kind: "service",
    title: "Sparepart Plastik Custom Bandung | Anugrah Plastik",
    description:
      "Pembuatan ulang sparepart plastik custom di Bandung dari sampel, foto, atau gambar untuk kebutuhan mesin dan produk.",
    eyebrow: "SPAREPART PLASTIK CUSTOM",
    heading: "Saat sparepart sulit dicari, mulai dari sampel yang ada.",
    intro:
      "Bawa atau kirim informasi part yang ingin dibuat ulang. Kami membantu mengumpulkan detail yang diperlukan sebelum menyarankan proses produksi.",
    image: "/images-webp/products/flange-ring-hitam.webp",
    imageAlt: "Contoh flange ring plastik untuk sparepart mesin",
    points: [
      "Berangkat dari sampel atau dokumentasi",
      "Untuk kebutuhan penggantian komponen",
      "Konsultasi material sesuai penggunaan",
    ],
  },
  {
    slug: "spacer-underground-conduit",
    kind: "product",
    title: "Spacer for Underground Conduit | Anugrah Plastik",
    description:
      "Spacer plastik custom untuk menjaga jarak dan posisi underground conduit agar jalur kabel tetap rapi saat instalasi.",
    eyebrow: "PRODUK UNGGULAN",
    heading: "Spacer untuk menjaga posisi underground conduit.",
    intro:
      "Spacer plastik custom membantu menjaga jarak dan alignment conduit saat instalasi jalur kabel bawah tanah. Dimensi serta kebutuhan proyek dievaluasi sebelum produksi.",
    image: "/images-webp/products/frame-grid-hitam.webp",
    imageAlt: "Spacer plastik hitam untuk underground conduit",
    points: ["Mendukung kerapian jalur conduit", "Dibahas sesuai kebutuhan instalasi", "Konsultasi sebelum pembuatan"],
  },
];

export function findSeoPage(slug: string, kind?: SeoPage["kind"]) {
  return seoPages.find((page) => page.slug === slug && (!kind || page.kind === kind));
}
