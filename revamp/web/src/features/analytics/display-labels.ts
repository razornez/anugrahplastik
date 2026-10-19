const sectionLabels: Record<string, string> = {
  "ap-hero": "Bagian pembuka",
  "ap-about": "Tentang kami",
  "ap-why": "Alasan memilih kami",
  "ap-process": "Cara kerja",
  "ap-material": "Pilihan bahan",
  "ap-portfolio": "Contoh hasil kerja",
  "ap-faq": "Tanya jawab",
  "ap-contact": "Form permintaan",
};

const actionLabels: Record<string, string> = {
  "hero-primary-quote": "Tombol minta penawaran",
  "portfolio-cta": "Tombol lihat contoh hasil",
  "process-sample-cta": "Tombol kirim sampel",
  "header-whatsapp": "Tombol WhatsApp di atas",
  "faq-whatsapp": "Tombol WhatsApp di tanya jawab",
  "floating-whatsapp": "Tombol WhatsApp mengambang",
  "contact-form": "Form permintaan",
};

const eventLabels: Record<string, string> = {
  page_view: "Membuka halaman",
  section_engaged: "Memperhatikan bagian halaman",
  scroll_depth: "Posisi halaman tercatat",
  menu_click: "Membuka menu",
  cta_click: "Menekan tombol minat",
  portfolio_open: "Membuka contoh hasil",
  faq_open: "Membuka pertanyaan",
  form_start: "Mulai mengisi formulir",
  form_submit_attempt: "Mencoba mengirim formulir",
  form_error: "Isian formulir perlu diperiksa",
  form_abandon: "Berhenti mengisi formulir",
  form_submit: "Mengirim formulir",
  whatsapp_click: "Menekan tombol WhatsApp",
  page_leave: "Meninggalkan halaman",
};

export function sectionLabel(key: string) {
  return sectionLabels[key] ?? key.replace(/^ap-/, "").replace(/-/g, " ");
}

export function actionLabel(key: string) {
  return actionLabels[key] ?? key.replace(/-/g, " ");
}

export function eventLabel(name: string) {
  return eventLabels[name] ?? "Melakukan interaksi";
}

export function eventDetail(event: {
  name: string;
  sectionKey: string | null;
  elementKey: string | null;
  metadata: unknown;
}) {
  const metadata =
    event.metadata && typeof event.metadata === "object" ? (event.metadata as Record<string, unknown>) : {};
  if (event.name === "page_view" && metadata.entry_anchor === "ap-contact")
    return "Tautan membuka halaman langsung di bagian kontak.";
  if (event.name === "scroll_depth") {
    const percent = typeof metadata.percent === "number" ? `${metadata.percent}%` : "Persentase tidak tersedia";
    return metadata.cause === "initial_anchor"
      ? `${percent} · akibat loncatan awal ke bagian kontak, bukan bukti membaca halaman.`
      : metadata.cause === "scroll"
        ? `${percent} · scroll halaman tercatat.`
        : `${percent} · cara mencapai posisi ini tidak diketahui.`;
  }
  if (event.name === "form_error" && typeof metadata.field === "string")
    return `Isian ${metadata.field === "phone" ? "nomor WhatsApp" : metadata.field === "name" ? "nama" : "pesan"} perlu diperiksa.`;
  if (event.elementKey) return actionLabel(event.elementKey);
  if (event.sectionKey) return sectionLabel(event.sectionKey);
  return "Halaman utama";
}
