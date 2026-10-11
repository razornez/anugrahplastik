import { z } from "zod";

export const LANDING_CONTENT_KEY = "landing.page";

const shortText = z.string().trim().min(1).max(220);
const longText = z.string().trim().min(1).max(2_000);
const imagePath = z
  .string()
  .trim()
  .regex(/^\/images-webp\/[a-z0-9_\-./ ()\[\]]+\.webp$/i, "Pilih gambar WebP internal.");
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
  about: z.object({ title: shortText, body: longText }),
  why: z.object({ title: shortText }),
  process: z.object({ title: shortText }),
  material: z.object({ title: shortText, primaryCta: shortText }),
  portfolio: z.object({ title: shortText }),
  faq: z.object({ title: shortText, description: longText, primaryCta: shortText }),
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
    primaryCta: "Kirim Sampel untuk Evaluasi",
    secondaryCta: "Lihat Hasil Produksi →",
  },
  about: {
    title: "Dari sampel yang Anda pegang ke part yang siap dipakai.",
    body: "Kami membantu membuat ulang part yang rusak, hilang, atau sulit dicari—serta memproduksi komponen baru untuk kebutuhan produk Anda.",
  },
  why: { title: "Lebih jelas dari awal, lebih tenang saat produksi berjalan." },
  process: { title: "Kirim sampel. Kami bantu arahkan sampai siap diproduksi." },
  material: {
    title: "Pilih material berdasarkan fungsi, bukan sekadar nama bahan.",
    primaryCta: "Tanya Rekomendasi Bahan →",
  },
  portfolio: { title: "Part yang dibuat untuk menyelesaikan kebutuhan nyata." },
  faq: {
    title: "Pertanyaan yang biasanya muncul sebelum mulai.",
    description: "Belum menemukan jawabannya? Ceritakan kebutuhan Anda, lalu tim kami bantu arahkan melalui WhatsApp.",
    primaryCta: "Tanya Sekarang →",
  },
  contact: {
    title: "Kirim sampel atau cerita singkat tentang part yang Anda butuhkan.",
    description:
      "Tidak perlu sudah paham prosesnya. Isi informasi singkat, lalu tim kami melanjutkan evaluasi melalui WhatsApp.",
    formTitle: "Kirim sampel untuk evaluasi",
    formDescription: "Isi form di bawah — pesan akan diteruskan ke WhatsApp kami.",
    primaryCta: "Kirim via WhatsApp",
  },
  footer: {
    description:
      "CV. Anugrahplastik Mandiri Bandung — jasa cetak plastik manual dan injection custom untuk produk serta spare part.",
  },
  capabilities: [],
  processSteps: [],
  galleryCategories: [],
  testimonials: [],
  featuredInsights: [],
};
