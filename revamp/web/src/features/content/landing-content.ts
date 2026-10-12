import { z } from "zod";

export const LANDING_CONTENT_KEY = "landing.page";

const shortText = z.string().trim().min(1).max(220);
const longText = z.string().trim().min(1).max(2_000);
const imagePath = z
  .string()
  .trim()
  .regex(
    /^(?:\/images-webp\/[a-z0-9_\-./ ()\[\]]+\.webp|\/api\/media\/[0-9a-f-]{36})$/i,
    "Pilih gambar dari pustaka media.",
  );
const slug = z
  .string()
  .trim()
  .regex(/^[a-z0-9-]+$/, "Gunakan huruf kecil, angka, dan tanda hubung.");
const capabilitySchema = z.object({ title: shortText, description: longText, proof: shortText });
const processStepSchema = z.object({ title: shortText, description: longText });
const galleryCategorySchema = z.object({
  slug,
  title: shortText,
  imagePath,
  altText: shortText,
  products: z.array(shortText).min(1).max(6),
  ctaLabel: shortText,
  isPublished: z.boolean(),
});
const testimonialSchema = z.object({ name: shortText, role: shortText, quote: longText, isPublished: z.boolean() });
const insightSchema = z.object({
  slug,
  category: shortText,
  title: shortText,
  excerpt: longText,
  isPublished: z.boolean(),
});
const imageSchema = z.object({ imagePath, altText: shortText });
const materialItemSchema = imageSchema.extend({ code: shortText, name: shortText, description: shortText });
const portfolioFilterSchema = z.object({ id: slug, label: shortText });
const portfolioItemSchema = imageSchema.extend({
  id: slug,
  title: shortText,
  category: slug,
  caption: longText,
  isPublished: z.boolean(),
  isHot: z.boolean(),
});
const partnerSchema = imageSchema.extend({
  name: shortText,
  subtitle: z.string().trim().max(120),
  isFeatured: z.boolean(),
});
const statSchema = z.object({ value: shortText, label: shortText });
const faqItemSchema = z.object({ question: shortText, answer: longText });

export const landingContentSchema = z.object({
  metadata: z.object({
    title: shortText,
    description: z.string().trim().min(40).max(320),
  }),
  topbar: z.object({ promise: shortText }),
  hero: z.object({
    titleBefore: shortText,
    titleHighlight: shortText,
    titleAfter: shortText,
    description: longText,
    primaryCta: shortText,
    secondaryCta: shortText,
  }),
  about: z.object({
    title: shortText,
    body: longText,
    image: imageSchema,
    imageBadge: shortText,
    stats: z.array(statSchema).min(1).max(4),
  }),
  why: z.object({ title: shortText }),
  process: z.object({ title: shortText }),
  material: z.object({ title: shortText, primaryCta: shortText, items: z.array(materialItemSchema).min(1).max(12) }),
  portfolio: z.object({
    title: shortText,
    filters: z.array(portfolioFilterSchema).min(1).max(8),
    items: z.array(portfolioItemSchema).min(1).max(60),
  }),
  trust: z.object({ title: shortText, description: longText, partners: z.array(partnerSchema).max(24) }),
  faq: z.object({
    title: shortText,
    description: longText,
    primaryCta: shortText,
    items: z.array(faqItemSchema).min(1).max(8),
  }),
  contact: z.object({
    title: shortText,
    description: longText,
    formTitle: shortText,
    formDescription: shortText,
    primaryCta: shortText,
  }),
  footer: z.object({ description: longText }),
  capabilities: z.array(capabilitySchema).max(6),
  processSteps: z.array(processStepSchema).max(6),
  galleryCategories: z.array(galleryCategorySchema).max(12),
  testimonials: z.array(testimonialSchema).max(12),
  featuredInsights: z.array(insightSchema).max(3),
});

export type LandingContent = z.infer<typeof landingContentSchema>;

const forbiddenCopySeparator = /(--|—|–)/;

export function hasForbiddenLandingCopySeparator(content: LandingContent) {
  const prose = [
    content.metadata.title,
    content.metadata.description,
    content.topbar.promise,
    ...Object.values(content.hero),
    content.about.title,
    content.about.body,
    content.about.image.altText,
    content.about.imageBadge,
    ...content.about.stats.flatMap((item) => [item.value, item.label]),
    content.why.title,
    content.process.title,
    content.material.title,
    content.material.primaryCta,
    ...content.material.items.flatMap((item) => [item.code, item.name, item.description, item.altText]),
    content.portfolio.title,
    ...content.portfolio.filters.map((item) => item.label),
    ...content.portfolio.items.flatMap((item) => [item.title, item.caption, item.altText]),
    content.trust.title,
    content.trust.description,
    ...content.trust.partners.flatMap((item) => [item.name, item.subtitle, item.altText]),
    content.faq.title,
    content.faq.description,
    content.faq.primaryCta,
    ...content.faq.items.flatMap((item) => [item.question, item.answer]),
    ...Object.values(content.contact),
    content.footer.description,
    ...content.capabilities.flatMap((item) => Object.values(item)),
    ...content.processSteps.flatMap((item) => Object.values(item)),
    ...content.galleryCategories.flatMap((item) => [item.title, item.altText, ...item.products, item.ctaLabel]),
    ...content.testimonials.flatMap((item) => [item.name, item.role, item.quote]),
    ...content.featuredInsights.flatMap((item) => [item.category, item.title, item.excerpt]),
  ];
  return prose.some((value) => forbiddenCopySeparator.test(value));
}

export function humanizeLegacyLandingCopy(value: string) {
  return value
    .replace(/(\d)\s*[–—]\s*(\d)/g, "$1 sampai $2")
    .replace(/sulit dicari\s*[—–]\s*serta/gi, "sulit dicari. Kami juga")
    .replace(/Bandung\s*[—–]\s*jasa/gi, "Bandung melayani jasa")
    .replace(/(?:--|—|–)/g, ", ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function normalizeLandingContentCopy(content: LandingContent): LandingContent {
  const copy = humanizeLegacyLandingCopy;
  return {
    ...content,
    metadata: { title: copy(content.metadata.title), description: copy(content.metadata.description) },
    topbar: { promise: copy(content.topbar.promise) },
    hero: Object.fromEntries(
      Object.entries(content.hero).map(([key, value]) => [key, copy(value)]),
    ) as LandingContent["hero"],
    about: {
      ...content.about,
      title: copy(content.about.title),
      body: copy(content.about.body),
      image: { ...content.about.image, altText: copy(content.about.image.altText) },
      imageBadge: copy(content.about.imageBadge),
      stats: content.about.stats.map((item) => ({ value: copy(item.value), label: copy(item.label) })),
    },
    why: { title: copy(content.why.title) },
    process: { title: copy(content.process.title) },
    material: {
      ...content.material,
      title: copy(content.material.title),
      primaryCta: copy(content.material.primaryCta),
      items: content.material.items.map((item) => ({
        ...item,
        code: copy(item.code),
        name: copy(item.name),
        description: copy(item.description),
        altText: copy(item.altText),
      })),
    },
    portfolio: {
      ...content.portfolio,
      title: copy(content.portfolio.title),
      filters: content.portfolio.filters.map((item) => ({ ...item, label: copy(item.label) })),
      items: content.portfolio.items.map((item) => ({
        ...item,
        title: copy(item.title),
        caption: copy(item.caption),
        altText: copy(item.altText),
      })),
    },
    trust: {
      ...content.trust,
      title: copy(content.trust.title),
      description: copy(content.trust.description),
      partners: content.trust.partners.map((item) => ({
        ...item,
        name: copy(item.name),
        subtitle: copy(item.subtitle),
        altText: copy(item.altText),
      })),
    },
    faq: {
      title: copy(content.faq.title),
      description: copy(content.faq.description),
      primaryCta: copy(content.faq.primaryCta),
      items: content.faq.items.map((item) => ({ question: copy(item.question), answer: copy(item.answer) })),
    },
    contact: {
      title: copy(content.contact.title),
      description: copy(content.contact.description),
      formTitle: copy(content.contact.formTitle),
      formDescription: copy(content.contact.formDescription),
      primaryCta: copy(content.contact.primaryCta),
    },
    footer: { description: copy(content.footer.description) },
    capabilities: content.capabilities.map((item) => ({
      title: copy(item.title),
      description: copy(item.description),
      proof: copy(item.proof),
    })),
    processSteps: content.processSteps.map((item) => ({
      title: copy(item.title),
      description: copy(item.description),
    })),
    galleryCategories: content.galleryCategories.map((item) => ({
      ...item,
      title: copy(item.title),
      altText: copy(item.altText),
      products: item.products.map(copy),
      ctaLabel: copy(item.ctaLabel),
    })),
    testimonials: content.testimonials.map((item) => ({
      name: copy(item.name),
      role: copy(item.role),
      quote: copy(item.quote),
      isPublished: item.isPublished,
    })),
    featuredInsights: content.featuredInsights.map((item) => ({
      ...item,
      category: copy(item.category),
      title: copy(item.title),
      excerpt: copy(item.excerpt),
    })),
  };
}

export const defaultLandingContent: LandingContent = {
  metadata: {
    title: "Cetak Plastik Custom Tanpa Minimum Order | Anugrah Plastik Bandung",
    description:
      "Buat ulang spare part dan produk plastik custom dari sampel atau gambar. Free moulding tanpa syarat, tanpa minimum order, melayani Bandung dan pengiriman luar kota.",
  },
  topbar: { promise: "Free moulding · tanpa minimum order · kirim sampel untuk evaluasi" },
  hero: {
    titleBefore: "Part plastik sulit dicari?",
    titleHighlight: "Kami bantu buat ulang",
    titleAfter: "dan siap produksi.",
    description:
      "Kirim sampel, foto, atau gambar. Kami bantu memilih proses dan material untuk spare part pengganti maupun produk plastik custom.",
    primaryCta: "Minta penawaran",
    secondaryCta: "Lihat Hasil Produksi →",
  },
  about: {
    title: "Dari sampel yang Anda pegang ke part yang siap dipakai.",
    body: "Kami membantu membuat ulang part yang rusak, hilang, atau sulit dicari. Kami juga memproduksi komponen baru untuk kebutuhan produk Anda.",
    image: {
      imagePath: "/images-webp/products/frame-grid-hitam.webp",
      altText: "Spacer plastik hitam untuk underground conduit hasil produksi Anugrah Plastik",
    },
    imageBadge: "Custom sesuai gambar atau sampel Anda",
    stats: [
      { value: "2020", label: "terdaftar resmi" },
      { value: "2", label: "teknik produksi" },
      { value: "Nego", label: "partai dan eceran" },
    ],
  },
  why: { title: "Lebih jelas dari awal, lebih tenang saat produksi berjalan." },
  process: { title: "Kirim sampel. Kami bantu arahkan sampai siap diproduksi." },
  material: {
    title: "Pilih material berdasarkan fungsi, bukan sekadar nama bahan.",
    primaryCta: "Tanya Rekomendasi Bahan →",
    items: [
      {
        code: "HD",
        name: "High Density",
        description: "Kaku untuk wadah dan komponen.",
        imagePath: "/images-webp/materials/hdpe.webp",
        altText: "Butiran dan wadah plastik HD",
      },
      {
        code: "LD",
        name: "Low Density",
        description: "Lentur untuk kemasan dan pelapis.",
        imagePath: "/images-webp/materials/ldpe.webp",
        altText: "Lembaran plastik LD fleksibel",
      },
      {
        code: "PVC",
        name: "Polyvinyl",
        description: "Pilihan untuk kebutuhan pipa dan fitting.",
        imagePath: "/images-webp/materials/pvc.webp",
        altText: "Sambungan pipa PVC biru",
      },
      {
        code: "PP",
        name: "Polypropylene",
        description: "Serbaguna untuk wadah dan komponen.",
        imagePath: "/images-webp/materials/pp.webp",
        altText: "Wadah plastik polypropylene",
      },
      {
        code: "Nilon",
        name: "Tahan gesek",
        description: "Untuk gear dan komponen bergerak.",
        imagePath: "/images-webp/materials/nylon.webp",
        altText: "Roda gigi nilon krem",
      },
      {
        code: "PS",
        name: "Polystyrene",
        description: "Ringan untuk kebutuhan tertentu.",
        imagePath: "/images-webp/materials/polystyrene.webp",
        altText: "Wadah pelindung polystyrene putih",
      },
      {
        code: "Acrylic",
        name: "Transparan",
        description: "Untuk bagian yang perlu terlihat jelas.",
        imagePath: "/images-webp/materials/acrylic.webp",
        altText: "Lembaran acrylic transparan",
      },
      {
        code: "Spon",
        name: "Foam",
        description: "Empuk untuk pelindung dan bantalan.",
        imagePath: "/images-webp/materials/foam.webp",
        altText: "Busa kuning sebagai material spon",
      },
      {
        code: "Karet",
        name: "Bakelit",
        description: "Untuk komponen sesuai kebutuhan proyek.",
        imagePath: "/images-webp/materials/rubber-bakelite.webp",
        altText: "Cincin karet dan komponen bakelit hitam",
      },
      {
        code: "ABS",
        name: "Tahan benturan",
        description: "Untuk komponen yang perlu dievaluasi sesuai fungsi.",
        imagePath: "/images-webp/materials/abs.webp",
        altText: "Butiran ABS dan komponen plastik hitam",
      },
      {
        code: "POM",
        name: "Acetal",
        description: "Untuk komponen presisi yang dievaluasi sesuai kebutuhan.",
        imagePath: "/images-webp/materials/pom.webp",
        altText: "Butiran POM dan komponen presisi",
      },
      {
        code: "TPU",
        name: "Elastis",
        description: "Untuk komponen fleksibel yang dibahas sesuai proyek.",
        imagePath: "/images-webp/materials/tpu.webp",
        altText: "Material TPU dan komponen fleksibel",
      },
    ],
  },
  portfolio: {
    title: "Part yang dibuat untuk menyelesaikan kebutuhan nyata.",
    filters: [
      { id: "all", label: "Semua" },
      { id: "produk", label: "Produk Custom" },
      { id: "sparepart", label: "Sparepart" },
      { id: "klien", label: "Klien" },
      { id: "mesin", label: "Mesin" },
    ],
    items: [
      {
        id: "spacer-underground-conduit",
        title: "Spacer for Underground Conduit",
        category: "produk",
        caption:
          "Spacer plastik custom untuk menjaga jarak dan posisi underground conduit agar jalur kabel tetap rapi saat instalasi.",
        imagePath: "/images-webp/products/frame-grid-hitam.webp",
        altText: "Spacer plastik hitam untuk underground conduit",
        isPublished: true,
        isHot: true,
      },
      {
        id: "wadah-emboss-logo",
        title: "Wadah emboss logo",
        category: "produk",
        caption: "Wadah plastik dengan emboss logo untuk produksi massal.",
        imagePath: "/images-webp/products/wadah-cup-abu.webp",
        altText: "Wadah cup plastik abu-abu dengan emboss logo",
        isPublished: true,
        isHot: false,
      },
      {
        id: "ring-tutup-pp",
        title: "Ring tutup PP kuning",
        category: "produk",
        caption: "Tutup atau ring plastik PP warna kuning untuk produksi massal presisi.",
        imagePath: "/images-webp/products/tutup-botol-kuning.webp",
        altText: "Tutup botol plastik PP warna kuning",
        isPublished: true,
        isHot: false,
      },
      {
        id: "tabung-pp",
        title: "Tabung PP transparan",
        category: "produk",
        caption: "Tabung plastik PP transparan.",
        imagePath: "/images-webp/products/tabung-vial.webp",
        altText: "Tabung vial plastik PP transparan",
        isPublished: true,
        isHot: false,
      },
      {
        id: "handle-tosca",
        title: "Handle tosca custom",
        category: "produk",
        caption: "Komponen plastik tosca custom untuk kebutuhan produk.",
        imagePath: "/images-webp/products/handle-tosca.webp",
        altText: "Komponen plastik biru tosca custom",
        isPublished: true,
        isHot: false,
      },
      {
        id: "flange-ring",
        title: "Flange ring sparepart",
        category: "sparepart",
        caption: "Flange ring plastik hitam untuk komponen mesin.",
        imagePath: "/images-webp/products/flange-ring-hitam.webp",
        altText: "Flange ring plastik hitam",
        isPublished: true,
        isHot: false,
      },
      {
        id: "gear-nilon",
        title: "Gear Nilon",
        category: "sparepart",
        caption: "Gigi plastik nilon untuk sparepart mesin.",
        imagePath: "/images-webp/portfolio/gear.webp",
        altText: "Gigi gear plastik nilon",
        isPublished: true,
        isHot: false,
      },
      {
        id: "komponen-presisi",
        title: "Komponen presisi bening",
        category: "sparepart",
        caption: "Komponen penahan plastik bening presisi.",
        imagePath: "/images-webp/products/penahan-bening.webp",
        altText: "Komponen plastik bening presisi",
        isPublished: true,
        isHot: false,
      },
    ],
  },
  trust: {
    title: "Dipercaya oleh klien lintas industri",
    description:
      "Dari industri tekstil dan otomotif sampai UMKM kemasan dan pertanian, komponen cetak plastik kami dipakai lintas sektor.",
    partners: [
      {
        name: "Surya Pro",
        subtitle: "Gudang Garam",
        imagePath: "/images-webp/portfolio/surya_pro_1.webp",
        altText: "Produk Surya Pro untuk Gudang Garam",
        isFeatured: true,
      },
    ],
  },
  faq: {
    title: "Pertanyaan yang biasanya muncul sebelum mulai.",
    description: "Belum menemukan jawabannya? Ceritakan kebutuhan Anda, lalu tim kami bantu arahkan melalui WhatsApp.",
    primaryCta: "Tanya Sekarang →",
    items: [
      {
        question: "Apa saja jenis cetak plastik yang dilayani?",
        answer:
          "Kami melayani cetak plastik manual dan injection untuk komponen custom, kemasan, serta sparepart. Anda dapat mengirim gambar atau sampel untuk dievaluasi.",
      },
      {
        question: "Berapa lama pembuatan molding?",
        answer:
          "Waktu pengerjaan mengikuti kerumitan bentuk dan kebutuhan proyek. Tim kami akan menjelaskan perkiraan setelah mengevaluasi sampel atau gambar.",
      },
      {
        question: "Apakah ada minimal order?",
        answer:
          "Tidak ada minimum order untuk konsultasi awal. Jumlah produksi akan dibahas sesuai kebutuhan dan proses yang dipilih.",
      },
      {
        question: "Bagaimana cara meminta penawaran?",
        answer:
          "Kirim foto, gambar, atau sampel melalui formulir atau WhatsApp. Tim kami akan membantu mengumpulkan informasi yang diperlukan.",
      },
      {
        question: "Apakah bisa dikirim ke luar kota?",
        answer: "Bisa. Pengiriman dibicarakan setelah bentuk produk, jumlah, dan tujuan pengiriman sudah jelas.",
      },
    ],
  },
  contact: {
    title: "Kirim sampel atau cerita singkat tentang part yang Anda butuhkan.",
    description:
      "Tidak perlu sudah paham prosesnya. Isi informasi singkat, lalu tim kami melanjutkan evaluasi melalui WhatsApp.",
    formTitle: "Kirim sampel untuk evaluasi",
    formDescription: "Isi form di bawah. Pesan akan diteruskan ke WhatsApp kami.",
    primaryCta: "Kirim via WhatsApp",
  },
  footer: {
    description:
      "CV. Anugrahplastik Mandiri Bandung melayani cetak plastik manual dan injection custom untuk produk serta spare part.",
  },
  capabilities: [
    {
      title: "Bahan berkualitas",
      description: "Pemilihan bahan disesuaikan dengan kebutuhan penggunaan.",
      proof: "Konsultasi material",
    },
    {
      title: "Custom sesuai sampel",
      description: "Kami mulai dari sampel, foto, atau gambar yang tersedia.",
      proof: "Evaluasi kebutuhan",
    },
    {
      title: "Produksi in house",
      description: "Pengerjaan molding dan produksi dikoordinasikan dari workshop.",
      proof: "Proses terpantau",
    },
    {
      title: "Legal dan terdaftar",
      description: "Usaha berjalan dengan identitas perusahaan yang jelas.",
      proof: "Dokumen tersedia",
    },
    {
      title: "Jangkauan luas",
      description: "Melayani kebutuhan Bandung dan pengiriman luar kota.",
      proof: "Pengiriman terkoordinasi",
    },
  ],
  processSteps: [
    { title: "Kirim sampel", description: "Ceritakan fungsi part atau kirim sampel yang ingin dibuat." },
    { title: "Pilih bahan", description: "Kami membantu memilih proses dan material yang sesuai." },
    { title: "Produksi", description: "Molding dan pencetakan dikerjakan sesuai kebutuhan proyek." },
    { title: "Packing dan kirim", description: "Produk diperiksa lalu disiapkan untuk pengiriman." },
  ],
  galleryCategories: [],
  testimonials: [],
  featuredInsights: [],
};

/** Keeps published revisions from earlier editor versions usable after new editable blocks are added. */
export function upgradeLandingContent(value: unknown) {
  const candidate = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const objectAt = (key: string) =>
    candidate[key] && typeof candidate[key] === "object" && !Array.isArray(candidate[key])
      ? (candidate[key] as Record<string, unknown>)
      : {};
  const about = objectAt("about");
  const material = objectAt("material");
  const portfolio = objectAt("portfolio");
  const trust = objectAt("trust");
  const aboutImage = about.image && typeof about.image === "object" && !Array.isArray(about.image) ? about.image : {};
  const portfolioItems = Array.isArray(portfolio.items)
    ? portfolio.items.map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return item;
        const record = item as Record<string, unknown>;
        return { ...record, isHot: typeof record.isHot === "boolean" ? record.isHot : false };
      })
    : defaultLandingContent.portfolio.items;
  return {
    ...defaultLandingContent,
    ...candidate,
    about: { ...defaultLandingContent.about, ...about, image: { ...defaultLandingContent.about.image, ...aboutImage } },
    material: {
      ...defaultLandingContent.material,
      ...material,
      items: Array.isArray(material.items) ? material.items : defaultLandingContent.material.items,
    },
    portfolio: {
      ...defaultLandingContent.portfolio,
      ...portfolio,
      filters: Array.isArray(portfolio.filters) ? portfolio.filters : defaultLandingContent.portfolio.filters,
      items: portfolioItems,
    },
    faq: {
      ...defaultLandingContent.faq,
      ...objectAt("faq"),
      items: Array.isArray(objectAt("faq").items) ? objectAt("faq").items : defaultLandingContent.faq.items,
    },
    trust: {
      ...defaultLandingContent.trust,
      ...trust,
      partners: Array.isArray(trust.partners) ? trust.partners : defaultLandingContent.trust.partners,
    },
    capabilities:
      Array.isArray(candidate.capabilities) && candidate.capabilities.length
        ? candidate.capabilities
        : defaultLandingContent.capabilities,
    processSteps:
      Array.isArray(candidate.processSteps) && candidate.processSteps.length
        ? candidate.processSteps
        : defaultLandingContent.processSteps,
  };
}
