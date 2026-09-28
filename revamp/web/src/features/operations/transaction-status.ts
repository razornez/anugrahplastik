export type TransactionTrack = "commercial" | "payment" | "fulfilment";
export type TransactionMainStage = "commercial" | "payment" | "fulfilment";

const labels: Record<TransactionTrack, Record<string, string>> = {
  commercial: {
    quotation: "Menyiapkan penawaran",
    po_received: "PO diterima",
    contract: "Kontrak / invoice",
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
    released: "Sudah dilepas ke produksi",
    completed: "Produksi & pengiriman selesai",
  },
};

export function transactionStageLabel(stage: TransactionTrack) {
  return stage === "commercial" ? "Penawaran" : stage === "payment" ? "Pembayaran" : "Produksi & pengiriman";
}

export function transactionStatusLabel(stage: TransactionTrack, status: string) {
  return labels[stage][status] ?? "Status perlu ditinjau";
}

export function transactionMainStage(status: {
  paymentStatus: string;
  fulfilmentStatus: string;
}): TransactionMainStage {
  if (["released", "completed"].includes(status.fulfilmentStatus)) return "fulfilment";
  if (["payment_recorded", "partial", "verified"].includes(status.paymentStatus)) return "payment";
  return "commercial";
}
