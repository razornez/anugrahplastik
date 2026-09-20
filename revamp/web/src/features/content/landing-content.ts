export type ContentBinding = {
  selector: string;
  value: string;
  attribute?: "textContent" | "alt" | "src" | "content";
  preserveChildren?: boolean;
};

export type LandingContent = {
  metadata: {
    title: string;
    description: string;
  };
  bindings: Record<string, ContentBinding>;
};

export const LANDING_CONTENT_KEY = "landing.page";

export const defaultLandingContent: LandingContent = {
  metadata: {
    title: "Cetak Plastik Custom Tanpa Minimum Order | Anugrah Plastik Bandung",
    description:
      "Buat ulang spare part dan produk plastik custom dari sampel atau gambar. Free moulding, tanpa minimum order, melayani Bandung dan pengiriman luar kota.",
  },
  bindings: {
    "topbar.promise": {
      selector: "#ap-topbar span[style*='Space Mono']",
      value: "Free moulding · tanpa minimum order · kirim sampel untuk evaluasi",
    },
    "header.primaryCta": { selector: "#ap-header .ap-btn-wa", value: "Kirim Sampel untuk Evaluasi" },
    "hero.titleBefore": { selector: "#ap-hero-title-before", value: "Part plastik sulit dicari?" },
    "hero.titleHighlight": {
      selector: "#ap-hero-title-highlight",
      value: "Kami bantu buat ulang",
      preserveChildren: true,
    },
    "hero.titleAfter": { selector: "#ap-hero-title-after", value: "dan siap produksi." },
    "hero.description": {
      selector: "#ap-hero h1 + p",
      value:
        "Kirim sampel, foto, atau gambar. Kami bantu memilih proses dan material untuk spare part pengganti maupun produk plastik custom.",
    },
    "hero.primaryCta": { selector: "#ap-hero .ap-btn-wa", value: "Kirim Sampel untuk Evaluasi" },
    "hero.secondaryCta": { selector: "#ap-hero .ap-btn-ghost", value: "Lihat Hasil Produksi →" },
    "about.eyebrow": { selector: "#ap-about [style*='Space Mono']", value: "UNTUK PART YANG HARUS BERFUNGSI" },
    "about.title": { selector: "#ap-about h2", value: "Dari sampel yang Anda pegang ke part yang siap dipakai." },
    "about.body": {
      selector: "#ap-about h2 + p",
      value:
        "Kami membantu membuat ulang part yang rusak, hilang, atau sulit dicari—serta memproduksi komponen baru untuk kebutuhan produk Anda.",
    },
    "why.eyebrow": { selector: "#ap-why [style*='Space Mono']", value: "ALASAN MEMILIH KAMI" },
    "why.title": { selector: "#ap-why h2", value: "Lebih jelas dari awal, lebih tenang saat produksi berjalan." },
    "process.eyebrow": { selector: "#ap-process [style*='Space Mono']", value: "CARA MEMULAI" },
    "process.title": { selector: "#ap-process h2", value: "Kirim sampel. Kami bantu arahkan sampai siap diproduksi." },
    "material.eyebrow": { selector: "#ap-material [style*='Space Mono']", value: "MATERIAL SESUAI FUNGSI PART" },
    "material.title": {
      selector: "#ap-material h2",
      value: "Pilih material berdasarkan fungsi, bukan sekadar nama bahan.",
    },
    "portfolio.eyebrow": { selector: "#ap-portfolio [style*='Space Mono']", value: "CONTOH HASIL PRODUKSI" },
    "portfolio.title": { selector: "#ap-portfolio h2", value: "Part yang dibuat untuk menyelesaikan kebutuhan nyata." },
    "faq.eyebrow": { selector: "#ap-faq [style*='Space Mono']", value: "SEBELUM KIRIM SAMPEL" },
    "faq.title": { selector: "#ap-faq h2", value: "Pertanyaan yang biasanya muncul sebelum mulai." },
    "contact.eyebrow": { selector: "#ap-contact [style*='Space Mono']", value: "MULAI DARI KONDISI ANDA" },
    "contact.title": {
      selector: "#ap-contact h2",
      value: "Kirim sampel atau cerita singkat tentang part yang Anda butuhkan.",
    },
    "contact.description": {
      selector: "#ap-contact h2 + p",
      value:
        "Tidak perlu sudah paham prosesnya. Isi informasi singkat, lalu tim kami melanjutkan evaluasi melalui WhatsApp.",
    },
    "contact.formTitle": { selector: "#ap-form-container h3", value: "Kirim sampel untuk evaluasi" },
  },
};
