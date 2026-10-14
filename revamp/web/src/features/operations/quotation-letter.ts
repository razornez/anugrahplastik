import { z } from "zod";
import { calculateQuote, type QuoteLineInput } from "./quote-math";

export const quotationLetterSchema = z.object({
  subject: z.string().trim().min(3).max(220),
  recipientPic: z.string().trim().max(120),
  recipientAddress: z.string().trim().max(700),
  validUntil: z
    .string()
    .regex(/^$|^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (value) =>
        !value ||
        (!Number.isNaN(Date.parse(`${value}T12:00:00+07:00`)) &&
          new Date(`${value}T12:00:00+07:00`).toLocaleDateString("en-CA", {
            timeZone: "Asia/Jakarta",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }) === value),
      "Tanggal masa berlaku tidak valid.",
    ),
  freightTerms: z.string().trim().max(500),
  paymentTerms: z.string().trim().max(700),
  leadTime: z.string().trim().max(700),
  notes: z.string().trim().max(2500),
  attachmentIds: z.array(z.string().uuid()).max(8),
});

export type QuotationLetter = z.infer<typeof quotationLetterSchema>;

export type QuotationTemplateDefaults = {
  validityDays?: number;
  freight?: string;
  payment?: string;
  leadTime?: string;
  notes?: string;
};

export function defaultQuotationLetter(
  title: string,
  address = "",
  defaults: QuotationTemplateDefaults = {},
): QuotationLetter {
  const validityDays = Number.isSafeInteger(defaults.validityDays)
    ? Math.min(365, Math.max(1, defaults.validityDays!))
    : 7;
  const inSevenDays = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000);
  const validUntil = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(inSevenDays);
  return {
    subject: title,
    recipientPic: "",
    recipientAddress: address,
    validUntil,
    freightTerms: defaults.freight ?? "Harga belum termasuk ongkos kirim, kecuali disepakati lain.",
    paymentTerms: defaults.payment ?? "Uang muka 50%; pelunasan 50% setelah barang diterima.",
    leadTime:
      defaults.leadTime ?? "Pengerjaan dimulai setelah PO dan uang muka diterima. Jadwal sampel disepakati bersama.",
    notes: defaults.notes ?? "Drawing dan spesifikasi yang dilampirkan menjadi bagian dari penawaran ini.",
    attachmentIds: [],
  };
}

export function readQuotationLetter(
  value: unknown,
  title: string,
  address = "",
  defaults: QuotationTemplateDefaults = {},
): QuotationLetter {
  const fallback = defaultQuotationLetter(title, address, defaults);
  const parsed = quotationLetterSchema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

export function quotationLetterMatches(saved: unknown, current: QuotationLetter) {
  const parsed = quotationLetterSchema.safeParse(saved);
  return parsed.success && JSON.stringify(parsed.data) === JSON.stringify(current);
}

const months = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

export function formatQuotationNumber(value: number, date: Date) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 999999) throw new Error("Nomor penawaran tidak valid.");
  const month = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", month: "numeric" }).format(date));
  const year = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", year: "numeric" }).format(date);
  return `SP/AMB/${String(value).padStart(3, "0")}/${months[month - 1]}/${year}`;
}

export function jakartaYear(date: Date) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", year: "numeric" }).format(date));
}

export function htmlSafe(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return replacements[character];
  });
}

function htmlLines(value: string) {
  return htmlSafe(value).replace(/\r?\n/g, "<br>");
}

const rupiah = (value: string) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value));

const quantity = (value: string) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(Number(value));

export function quotationRenderData(input: {
  number: string;
  version: number;
  issuedAt: Date;
  transactionNo: string;
  customerName: string;
  letter: QuotationLetter;
  lines: QuoteLineInput[];
  attachments: Array<{ id: string; name: string; category: string }>;
  issuer: {
    legalName: string;
    address: string;
    phone: string;
    email: string;
    website: string;
    signerName: string;
    signerTitle: string;
    logoDataUri: string;
  };
}) {
  const calculated = calculateQuote(input.lines);
  const listedAttachments = input.attachments.filter((item) => input.letter.attachmentIds.includes(item.id));
  const taxMethods = [...new Set(calculated.lines.map((line) => line.taxMethod))];
  const taxDescription =
    taxMethods.length > 1
      ? "PPN sesuai metode pada setiap item"
      : taxMethods[0] === "none"
        ? "Tanpa PPN"
        : taxMethods[0] === "dpp_11_12"
          ? "PPN 12% × DPP nilai lain 11/12"
          : taxMethods[0] === "standard"
            ? "PPN 12% × harga bersih"
            : "Pajak perlu ditinjau";
  return {
    nomor_penawaran: input.number,
    revisi: input.version > 1 ? `Revisi ${input.version}` : "Penerbitan pertama",
    tanggal: new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "long" }).format(input.issuedAt),
    nomor_transaksi: input.transactionNo,
    perihal: input.letter.subject,
    penerima: input.customerName,
    pic_penerima: input.letter.recipientPic || "Belum dicantumkan",
    alamat_penerima: htmlLines(input.letter.recipientAddress || "Alamat penerima belum tersedia"),
    masa_berlaku: input.letter.validUntil
      ? new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "long" }).format(
          new Date(`${input.letter.validUntil}T12:00:00+07:00`),
        )
      : "Sesuai kesepakatan tertulis",
    syarat_ongkir: htmlLines(input.letter.freightTerms || "Sesuai kesepakatan tertulis"),
    syarat_bayar: htmlLines(input.letter.paymentTerms || "Sesuai kesepakatan tertulis"),
    waktu_pengerjaan: htmlLines(input.letter.leadTime || "Sesuai kesepakatan tertulis"),
    catatan: htmlLines(input.letter.notes || "Tidak ada catatan tambahan."),
    penerbit: input.issuer.legalName,
    alamat_penerbit: htmlLines(input.issuer.address),
    telepon_penerbit: input.issuer.phone,
    email_penerbit: input.issuer.email,
    situs_penerbit: input.issuer.website,
    penanda_tangan: input.issuer.signerName,
    jabatan: input.issuer.signerTitle,
    logo: input.issuer.logoDataUri,
    baris_barang: calculated.lines
      .map(
        (line, index) =>
          `<tr><td>${index + 1}</td><td>${htmlSafe(line.description)}</td><td>${htmlSafe(line.mouldingLabel || "-")}</td><td>${htmlSafe(line.materialLabel || "-")}</td><td>${quantity(line.quantity)} ${htmlSafe(line.unit)}</td><td>${rupiah(line.unitPrice)}</td><td>${rupiah(line.gross)}</td><td>${line.discountKind === "percent" ? `${htmlSafe(line.discountValue)}%` : rupiah(line.discount)}</td></tr>`,
      )
      .join(""),
    total_harga: rupiah(calculated.gross),
    diskon: rupiah(calculated.discount),
    nilai_setelah_diskon: rupiah(calculated.subtotal),
    dpp: rupiah(calculated.dpp),
    pajak: rupiah(calculated.tax),
    label_pajak: taxDescription,
    grand_total: rupiah(calculated.total),
    lampiran:
      listedAttachments.length > 0
        ? listedAttachments
            .map((item, index) => `${index + 1}. ${htmlSafe(item.name)} (${htmlSafe(item.category)})`)
            .join("<br>")
        : "Tidak ada lampiran.",
    // Keep the previous remote dummy template readable until its new version can be published.
    nama_pelanggan: input.customerName,
    judul_pekerjaan: input.letter.subject,
    rincian_pekerjaan: calculated.lines
      .map(
        (line, index) =>
          `${index + 1}. ${line.description} - ${quantity(line.quantity)} ${line.unit} x ${rupiah(line.unitPrice)}`,
      )
      .join("\n"),
    subtotal: rupiah(calculated.subtotal),
    total: rupiah(calculated.total),
    target: input.letter.leadTime || "Sesuai kesepakatan tertulis",
  };
}
