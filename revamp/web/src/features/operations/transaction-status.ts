export type TransactionTrack = "commercial" | "payment" | "fulfilment";
export type TransactionMainStage = "commercial" | "payment" | "fulfilment";

const labels: Record<TransactionTrack, Record<string, string>> = {
  commercial: {
    quotation: "Menyiapkan penawaran",
    po_received: "PO diterima",
    contract: "Tahap lama, perlu ditinjau",
    invoice_issued: "Invoice terbit",
    completed: "Komersial selesai",
    cancelled: "Dibatalkan",
  },
  payment: {
    awaiting_invoice: "Belum ada tagihan",
    awaiting_payment: "Menunggu pembayaran",
    payment_recorded: "Menunggu verifikasi",
    partial: "Dibayar sebagian",
    verified: "Terverifikasi / lunas",
  },
  fulfilment: {
    not_released: "Belum dilepas",
    sample: "Sampel dalam proses",
    production: "Produksi berjalan",
    released: "Sudah dilepas ke produksi",
    shipping: "Barang dikirim",
    bast_pending: "Menunggu serah terima",
    completed: "Produksi & pengiriman selesai",
  },
};

export function transactionStageLabel(stage: TransactionTrack) {
  return stage === "commercial" ? "Penawaran" : stage === "payment" ? "Pembayaran" : "Produksi & pengiriman";
}

export function transactionStatusLabel(stage: TransactionTrack, status: string) {
  return labels[stage][status] ?? "Status perlu ditinjau";
}

export function invoiceCountsAsIssued(status: string) {
  return ["issued", "sent", "partial", "paid", "overdue"].includes(status);
}

export function invoiceStatusLabel(status: string) {
  const invoiceLabels: Record<string, string> = {
    draft: "Belum selesai dibuat",
    issued: "Terbit",
    sent: "Sudah dikirim",
    partial: "Dibayar sebagian",
    paid: "Lunas",
    overdue: "Lewat jatuh tempo",
    cancelled: "Dibatalkan",
  };
  return invoiceLabels[status] ?? "Perlu diperiksa";
}

export function transactionMainStage(status: {
  paymentStatus: string;
  fulfilmentStatus: string;
}): TransactionMainStage {
  if (["released", "sample", "production", "shipping", "bast_pending", "completed"].includes(status.fulfilmentStatus))
    return "fulfilment";
  if (["payment_recorded", "partial", "verified"].includes(status.paymentStatus)) return "payment";
  return "commercial";
}
