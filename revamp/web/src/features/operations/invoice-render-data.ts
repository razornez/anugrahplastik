import type { calculateDeliveryInvoice, calculateDpInvoice } from "./invoice-math";

type Preview = ReturnType<typeof calculateDeliveryInvoice> | ReturnType<typeof calculateDpInvoice>;
type Issuer = {
  legalName: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  taxId: string;
  bankName: string;
  bankAccountNo: string;
  bankAccountName: string;
  signerName: string;
  signerTitle: string;
};

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (value) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[value] ?? value,
  );
const rupiah = (value: string) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(Number(value));

export function invoiceRenderData(input: {
  number: string;
  date: Date;
  dueAt: Date;
  transactionNo: string;
  title: string;
  customerName: string;
  customerAddress: string;
  customerTaxId: string;
  poNumber: string;
  terms: string;
  preview: Preview;
  issuer: Issuer | null;
  logoDataUrl?: string;
}) {
  const lines = input.preview.kind === "dp" ? input.preview.referenceLines : input.preview.lines;
  const rows = lines
    .map((line, index) => {
      const discountLabel =
        line.discountKind === "percent"
          ? `${rupiah(line.discount)} (${escapeHtml(line.discountValue ?? "0")}%)`
          : rupiah(line.discount);
      return `<tr><td>${index + 1}</td><td>${escapeHtml(line.description)}</td><td>${escapeHtml(line.quantity)} ${escapeHtml(line.unit)}</td><td>${escapeHtml(line.materialName ?? "-")}</td><td>${rupiah(line.unitPrice)}</td><td>${rupiah(line.gross)}</td><td>${discountLabel}</td></tr>`;
    })
    .join("");
  const date = (value: Date) =>
    value.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric" });
  const issuer = input.issuer;
  return {
    nomor_invoice: input.number,
    tanggal: date(input.date),
    jatuh_tempo: date(input.dueAt),
    nomor_transaksi: input.transactionNo,
    nomor_po: input.poNumber || "Belum dicantumkan",
    jenis_tagihan: input.preview.kind === "dp" ? "INVOICE UANG MUKA" : "INVOICE PELUNASAN",
    pekerjaan: input.title,
    nama_pelanggan: input.customerName,
    alamat_pelanggan: input.customerAddress || "Alamat belum dilengkapi",
    npwp_pelanggan: input.customerTaxId || "Belum dicantumkan",
    baris_barang: rows,
    catatan_referensi:
      input.preview.kind === "dp"
        ? `Nilai order ${rupiah(input.preview.referenceGross)}; diskon order ${rupiah(input.preview.referenceDiscount)}; total order ${rupiah(input.preview.referenceTotal)}.`
        : "",
    label_total_harga: input.preview.kind === "dp" ? "Jumlah DP diminta" : "Total harga barang",
    label_subtotal: input.preview.kind === "dp" ? "Dasar DP sebelum PPN" : "Nilai barang setelah diskon",
    total_harga: rupiah(input.preview.gross),
    diskon: rupiah(input.preview.discount),
    nilai_setelah_diskon: rupiah(input.preview.goodsSubtotal),
    ppn_barang: rupiah(input.preview.goodsTax),
    total_barang: rupiah(input.preview.goodsTotal),
    dpp: rupiah(input.preview.subtotal),
    dpp_nilai_lain: rupiah(input.preview.dpp),
    ppn: rupiah(input.preview.tax),
    dp_diterapkan: rupiah(input.preview.dpApplied),
    total_tagihan: rupiah(input.preview.amountDue),
    total: rupiah(input.preview.amountDue), // Legacy dummy DocGen template still expects {{total}}.
    catatan_item:
      input.preview.kind === "dp"
        ? "Rincian barang di atas adalah referensi order; jumlah yang ditagih saat ini hanya uang muka."
        : "Rincian barang yang ditagih pada pengiriman ini.",
    syarat_bayar: input.terms,
    penerbit: issuer?.legalName || "IDENTITAS PENERBIT BELUM DISETUJUI",
    alamat_penerbit: issuer?.address || "Alamat penerbit belum diverifikasi",
    telepon_penerbit: issuer?.phone || "",
    email_penerbit: issuer?.email || "",
    situs_penerbit: issuer?.website || "",
    npwp_penerbit: issuer?.taxId || "",
    bank: issuer?.bankName || "Bank belum diverifikasi",
    nomor_rekening: issuer?.bankAccountNo || "",
    nama_rekening: issuer?.bankAccountName || "",
    penanda_tangan: issuer?.signerName || "Belum ditetapkan",
    jabatan: issuer?.signerTitle || "",
    logo: input.logoDataUrl?.startsWith("data:image/") ? `<img alt="" src="${escapeHtml(input.logoDataUrl)}" />` : "",
  };
}
