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
  scroll_depth: "Mencapai kedalaman scroll",
  menu_click: "Membuka menu",
  cta_click: "Menekan tombol minat",
  portfolio_open: "Membuka contoh hasil",
  faq_open: "Membuka pertanyaan",
  form_start: "Mulai mengisi formulir",
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
