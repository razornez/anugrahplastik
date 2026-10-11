import { calculateQuote, centsText, quoteSnapshotMatches, type QuoteLineInput } from "./quote-math";
import { quotationLetterMatches, readQuotationLetter } from "./quotation-letter";
import { invoiceCountsAsIssued } from "./transaction-status";

export type TransactionStep = "quote" | "order" | "payment" | "production" | "delivery" | "handover";
type Document = { type: string; status: string; version: number; payload: unknown };
type Invoice = { status: string; amount: string; count?: number };
type Entry = { status: string; direction: string; kind: string; amount: string };
export type WorkspaceInput = {
  header: {
    title: string;
    quoteLetter: unknown;
    customerBillingAddress: string | null;
    commercialStatus: string;
    fulfilmentStatus: string;
  };
  lines: QuoteLineInput[];
  invoices: Invoice[];
  entries: Entry[];
  documents: Document[];
  batches: { status?: string }[];
  shipments: { status: string }[];
};

function cents(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error("Nilai keuangan perlu ditinjau");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
}

export function quotationIsCurrent(input: Pick<WorkspaceInput, "header" | "lines" | "documents">) {
  const latest = input.documents.filter((item) => item.type === "quotation").sort((a, b) => b.version - a.version)[0];
  if (!latest || latest.status !== "ready" || !input.lines.length) return false;
  const payload = latest.payload as { letter?: unknown; quote?: unknown } | null;
  return (
    quotationLetterMatches(
      payload?.letter,
      readQuotationLetter(input.header.quoteLetter, input.header.title, input.header.customerBillingAddress ?? ""),
    ) &&
    quoteSnapshotMatches(
      payload?.quote,
      input.lines.map(
        ({
          description,
          materialLabel,
          mouldingLabel,
          quantity,
          unit,
          unitPrice,
          taxRate,
          taxMethod,
          discountKind,
          discountValue,
        }) => ({
          description,
          materialLabel,
          mouldingLabel,
          quantity,
          unit,
          unitPrice,
          taxRate,
          taxMethod,
          discountKind,
          discountValue,
        }),
      ),
    )
  );
}

export function transactionWorkspace(input: WorkspaceInput) {
  const issued = input.invoices.filter((item) => invoiceCountsAsIssued(item.status));
  const pendingPayment = input.entries.some(
    (item) => item.status === "unverified" && item.direction === "in" && item.kind === "customer_payment",
  );
  let quote: string | null = null;
  let invoice: string | null = null;
  let received: string | null = null;
  let outstanding: string | null = null;
  let overpayment: string | null = null;
  try {
    if (input.lines.length && input.lines.every((line) => line.taxMethod && line.taxMethod !== "legacy"))
      quote = calculateQuote(input.lines).total;
  } catch {
    /* Preserve legacy data; never invent a replacement calculation. */
  }
  try {
    const billed = issued.reduce((total, item) => total + cents(item.amount), BigInt(0));
    const paid = input.entries
      .filter((item) => item.status === "verified" && item.direction === "in" && item.kind === "customer_payment")
      .reduce((total, item) => total + cents(item.amount), BigInt(0));
    invoice = centsText(billed);
    received = centsText(paid);
    outstanding = centsText(billed > paid ? billed - paid : BigInt(0));
    overpayment = centsText(paid > billed ? paid - billed : BigInt(0));
  } catch {
    /* Unknown amounts must be reviewed rather than displayed as zero. */
  }
  const currentQuote = quotationIsCurrent(input);
  const hasPo = input.documents.some((item) => item.type === "purchase_order");
  let step: TransactionStep;
  // Existing issued invoices/fulfilment remain historical facts even after quotation edits.
  if (input.header.fulfilmentStatus === "completed") step = "handover";
  else if (input.header.fulfilmentStatus !== "not_released" && input.batches.length) {
    step = input.batches.some((batch) => batch.status !== "completed" && batch.status !== "cancelled")
      ? "production"
      : !input.shipments.length || input.shipments.some((item) => item.status === "planned")
        ? "delivery"
        : "handover";
  } else if (issued.length) step = "production";
  else if (hasPo) step = "payment";
  else step = currentQuote ? "order" : "quote";
  const actions: Record<TransactionStep, string> = {
    quote: "Lengkapi dan periksa surat penawaran",
    order: "Catat PO pelanggan",
    payment: "Buat invoice dan catat pembayaran",
    production:
      input.header.fulfilmentStatus === "not_released"
        ? "Administrator memeriksa pelepasan produksi"
        : "Catat penyelesaian batch produksi",
    delivery: "Siapkan pengiriman dan surat jalan",
    handover:
      input.header.fulfilmentStatus === "completed"
        ? "Transaksi selesai; arsip tersedia"
        : "Unggah STB bertanda tangan",
  };
  const paymentLabel =
    invoice === null
      ? "Perlu ditinjau"
      : !issued.length
        ? "Belum ada invoice"
        : outstanding === "0.00"
          ? "Invoice terbit lunas"
          : received === "0.00"
            ? "Menunggu pembayaran"
            : "Dibayar sebagian";
  return {
    quote,
    invoice,
    received,
    outstanding,
    overpayment,
    issuedCount: issued.reduce((count, item) => count + (item.count ?? 1), 0),
    pendingPayment,
    currentQuote,
    step,
    action: input.header.commercialStatus === "cancelled" ? "Transaksi dibatalkan; arsip tersedia" : actions[step],
    paymentLabel,
  };
}

export function workspaceMoney(value: string | null) {
  if (value === null) return "Perlu ditinjau";
  const [whole, fraction = "00"] = value.split(".");
  return `Rp ${BigInt(whole).toLocaleString("id-ID")}${fraction === "00" ? "" : `,${fraction}`}`;
}

type StepState = { kind: "waiting" | "progress" | "attention" | "complete"; label: string };

/** Presentation facts, not permissions or an assumed percentage of order completion. */
export function transactionStepStates(input: WorkspaceInput, workspace = transactionWorkspace(input)) {
  const state = (kind: StepState["kind"], label: string): StepState => ({ kind, label });
  const finished = input.header.fulfilmentStatus === "completed";
  const states: Record<TransactionStep, StepState> = {
    quote: workspace.currentQuote
      ? state("complete", "PDF sesuai rincian")
      : state(input.lines.length ? "attention" : "waiting", input.lines.length ? "Periksa penawaran" : "Belum diisi"),
    order: input.documents.some((item) => item.type === "purchase_order")
      ? state("complete", "PO tersimpan")
      : state("waiting", "Belum ada PO"),
    payment: workspace.pendingPayment
      ? state("attention", "Menunggu verifikasi")
      : workspace.outstanding === null
        ? state("attention", "Perlu ditinjau")
        : !workspace.issuedCount
          ? state("waiting", "Belum ada invoice")
          : workspace.outstanding === "0.00"
            ? state("complete", "Invoice terbit lunas")
            : state("progress", workspace.paymentLabel),
    production: finished
      ? state("complete", "Pekerjaan ditutup")
      : input.header.fulfilmentStatus === "not_released"
        ? state("waiting", "Belum dilepas")
        : state("progress", input.batches.length ? "Produksi tercatat" : "Sudah dilepas"),
    delivery: finished
      ? state("complete", "Pekerjaan ditutup")
      : input.shipments.some((item) => ["shipped", "received", "received_partial"].includes(item.status))
        ? state("progress", "Ada barang dikirim")
        : state("waiting", input.shipments.length ? "Pengiriman disiapkan" : "Belum ada pengiriman"),
    handover: finished
      ? state("complete", "Pekerjaan ditutup")
      : input.shipments.some((item) => item.status === "received_partial")
        ? state("attention", "Ada selisih penerimaan")
        : input.shipments.some((item) => item.status === "received")
          ? state("progress", "Bukti terima tercatat")
          : state("waiting", "Menunggu bukti terima"),
  };
  if (input.header.commercialStatus === "cancelled") {
    for (const step of Object.keys(states) as TransactionStep[]) states[step] = state("waiting", "Arsip transaksi");
  }
  return states;
}
