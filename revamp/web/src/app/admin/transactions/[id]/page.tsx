import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPageHeader } from "@/components/admin-page-header";
import { TransactionDocumentUpload } from "@/components/transaction-document-upload";
import { TransactionQuoteEditor } from "@/components/transaction-quote-editor";
import { TransactionShipmentForm } from "@/components/transaction-shipment-form";
import { TransactionInvoiceForm } from "@/components/transaction-invoice-form";
import { TransactionHandoverForm } from "@/components/transaction-handover-form";
import { CustomerDocumentProfileSheet } from "@/components/customer-document-profile-sheet";
import { TransactionPaymentAttention } from "./transaction-payment-attention";
import {
  fillEmailSubject,
  fillEmailTemplate,
  listActiveEmailTemplateOptions,
} from "@/features/integrations/email-templates";
import { TransactionEmailComposer } from "@/components/transaction-email-composer";
import { getSession } from "@/lib/auth/session";
import { requireOperationsAccess } from "@/features/operations/access";
import { recordTransactionPayment, releaseProduction, verifyTransactionPayment } from "@/features/operations/actions";
import { quotationTemplateReady } from "@/features/operations/docgen";
import {
  DOCGEN_TEST_RECIPIENT,
  docGenDummyMode,
  docGenTemplateId,
  docGenTemplateReady,
  localQaRendererEnabled,
} from "@/features/operations/docgen-policy";
import { getTransactionDetail } from "@/features/operations/service";
import { transactionStepStates, workspaceMoney } from "@/features/operations/transaction-workspace";
import { readDeliveryDetails, readShipmentLogistics } from "@/features/operations/delivery-note";
import { acceptedAmount, committedAmount, handoverDetailsSchema } from "@/features/operations/handover-note";
import { readQuotationLetter, type QuotationTemplateDefaults } from "@/features/operations/quotation-letter";
import { getActiveDocumentTemplate, type DocumentTemplateKind } from "@/features/operations/document-templates";
import {
  documentRecoveryBlocker,
  documentRevisionBlocker,
  readDocumentReview,
} from "@/features/operations/document-review";
import { quotationDocumentReadiness, type DocumentReadinessResult } from "@/features/operations/document-readiness";
import styles from "../transactions.module.css";
import {
  invoiceCountsAsIssued,
  invoiceStatusLabel,
  transactionStatusLabel,
} from "@/features/operations/transaction-status";
import {
  closeTransaction,
  completeProductionBatch,
  createProductionBatch,
  generateDeliveryNote,
  generateQuotation,
  linkTransactionEmail,
  markShipmentSent,
  retryDocumentGeneration,
  saveProductionTargetDate,
} from "@/features/operations/workflow-actions";

export const instant = false;

type Transaction = NonNullable<Awaited<ReturnType<typeof getTransactionDetail>>>;
type Document = Transaction["documents"][number];
type Step = "quote" | "order" | "payment" | "production" | "delivery" | "handover";

function documentEmailAllowed(transaction: Transaction, document: Document) {
  if ((document.payload as { renderSource?: string } | null)?.renderSource === "local_qa") return false;
  if (document.type === "contract") return false;
  if (
    document.type === "delivery_note" &&
    !transaction.shipments.some((shipment) => shipment.deliveryDocumentId === document.id)
  ) {
    return false;
  }
  const isDummy = (document.payload as { isDummy?: boolean } | null)?.isDummy === true;
  return (
    (!docGenDummyMode() && !isDummy) ||
    (transaction.header.dataClass === "test" &&
      transaction.header.customerEmail?.toLowerCase() === DOCGEN_TEST_RECIPIENT)
  );
}

const steps: Array<{ id: Step; label: string; short: string; help: string }> = [
  { id: "quote", label: "Penawaran", short: "Penawaran", help: "Rincian, harga, dan surat penawaran" },
  { id: "order", label: "PO pelanggan", short: "PO", help: "Catat pesanan resmi dari pelanggan" },
  { id: "payment", label: "Invoice & pembayaran", short: "Invoice", help: "Tagihan, uang muka, dan pelunasan" },
  { id: "production", label: "Produksi", short: "Produksi", help: "Pelepasan, sampel, dan batch" },
  { id: "delivery", label: "Surat jalan", short: "Surat jalan", help: "Jumlah yang dikirim dan surat jalan" },
  { id: "handover", label: "STB bertanda tangan", short: "STB", help: "Bukti penerimaan dan penutupan" },
];

const money = (value: string | number | null) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
const number = (value: string | number | null) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(Number(value ?? 0));
const date = (value: Date | null) =>
  value
    ? value.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric" })
    : "Belum ditentukan";
const dateTime = (value: Date) =>
  value.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const activityLabels: Record<string, string> = {
  "transaction.created": "Pekerjaan dibuat",
  "transaction.quotation_draft_saved": "Rincian penawaran disimpan",
  "transaction.quotation_generation_started": "Pembuatan penawaran dimulai",
  "transaction.quotation_ready": "PDF penawaran siap",
  "transaction.document_emailed": "Dokumen dikirim lewat email",
  "transaction.document_received": "Dokumen pelanggan diterima",
  "transaction.email_linked": "Email ditautkan ke pekerjaan",
  "transaction.invoice_generation_started": "Pembuatan invoice dimulai",
  "transaction.invoice_issued": "Invoice diterbitkan",
  "transaction.payment_recorded": "Konfirmasi pembayaran dicatat",
  "transaction.payment_verified": "Pembayaran diperiksa administrator",
  "transaction.production_released": "Pekerjaan dilepas ke produksi",
  "transaction.batch_created": "Batch atau sampel dicatat",
  "transaction.batch_completed": "Batch atau sampel selesai",
  "transaction.shipment_planned": "Pengiriman direncanakan",
  "transaction.delivery_note_ready": "Surat jalan siap",
  "transaction.shipment_sent": "Barang dikirim",
  "transaction.contract_ready": "Kontrak siap",
  "transaction.bast_ready": "Surat serah terima barang siap",
  "transaction.stb_ready": "Surat serah terima barang siap",
  "transaction.stb_proof_received": "Bukti STB bertanda tangan tersimpan",
  "transaction.stb_proof_replaced": "Bukti STB diganti dan arsip lama dipertahankan",
  "transaction.document_generation_recovered": "Dokumen berhasil dipulihkan",
  "transaction.track_status_changed": "Status pekerjaan diperbarui",
  "transaction.closed": "Pekerjaan ditutup",
};
const documentLabels: Record<string, string> = {
  quotation: "Surat penawaran",
  quotation_attachment: "Lampiran penawaran",
  purchase_order: "Pesanan pelanggan (PO)",
  contract: "Arsip lama: kontrak",
  invoice_dp: "Tagihan uang muka (DP)",
  invoice_final: "Tagihan akhir",
  payment_proof: "Bukti pembayaran",
  tax_invoice: "Faktur pajak resmi",
  delivery_note: "Surat jalan",
  bast: "Surat serah terima barang (STB)",
  bast_signed: "STB bertanda tangan",
};

function latestQuoteMatches(transaction: Transaction) {
  return transaction.workspace.currentQuote;
}

function latestStep(transaction: Transaction): Step {
  return transaction.workspace.step;
}

function nextAction(step: Step, transaction: Transaction) {
  if (transaction.header.commercialStatus === "cancelled") {
    return "Transaksi dibatalkan. Dokumen dan riwayat tetap tersedia sebagai arsip.";
  }
  if (transaction.header.fulfilmentStatus === "completed") {
    return "Transaksi selesai. Semua dokumen dan riwayat tetap tersedia untuk ditinjau.";
  }
  switch (step) {
    case "quote":
      if (transaction.workspace.issuedCount)
        return "Rincian penawaran terkunci setelah invoice diterbitkan. Tinjau rincian dan dokumen yang sudah tersimpan.";
      if (!transaction.lines.length) return "Isi barang, jasa, dan harga.";
      if (!transaction.header.quoteLetter) return "Isi surat dan syarat penawaran, lalu simpan sebelum membuat PDF.";
      if (!latestQuoteMatches(transaction)) return "Periksa rincian, lalu buat PDF penawaran.";
      return transaction.documents.some((document) => document.type === "quotation" && document.sentMessageId)
        ? "Penawaran sudah dikirim. Tunggu PO pelanggan, lalu buka langkah berikutnya."
        : "Tinjau PDF penawaran, lalu kirim ke alamat pelanggan yang sudah diperiksa.";
    case "order":
      return transaction.documents.some((document) => document.type === "purchase_order")
        ? transaction.workspace.issuedCount
          ? "PO sudah tersimpan. Tagihan dan catatan pembayaran tersedia di Invoice & pembayaran."
          : "PO sudah tersimpan. Lanjutkan ke Invoice & pembayaran untuk membuat tagihan."
        : "Unggah PO dari pelanggan. Setelah PO tersimpan, buat tagihan pada langkah Invoice & pembayaran.";
    case "payment":
      return transaction.workspace.pendingPayment
        ? "Pembayaran sudah dicatat dan menunggu pemeriksaan administrator."
        : transaction.workspace.issuedCount && transaction.workspace.outstanding === "0.00"
          ? "Invoice yang telah terbit sudah lunas. Tagihan tambahan, jika diperlukan, tetap dicatat di langkah ini."
          : "Buat tagihan atau catat pembayaran pelanggan.";
    case "production":
      return transaction.header.fulfilmentStatus === "not_released"
        ? "Administrator memeriksa kesiapan sebelum pekerjaan masuk produksi."
        : "Catat sampel atau batch yang sedang dikerjakan.";
    case "delivery":
      return "Siapkan pengiriman sesuai jumlah barang, lalu periksa surat jalan.";
    case "handover":
      return "Arsipkan bukti serah terima yang ditandatangani pelanggan.";
  }
}

async function DocumentList({
  documents,
  transaction,
  canRetry = false,
}: {
  documents: Document[];
  transaction: Transaction;
  canRetry?: boolean;
}) {
  if (!documents.length) return <p className="transaction-flow-empty">Belum ada dokumen pada langkah ini.</p>;
  const [quotationTemplates, invoiceTemplates, deliveryTemplates, handoverTemplates, currentUser] = await Promise.all([
    listActiveEmailTemplateOptions("quotation"),
    listActiveEmailTemplateOptions("invoice"),
    listActiveEmailTemplateOptions("delivery"),
    listActiveEmailTemplateOptions("handover"),
    getSession(),
  ]);
  const recoveryBlocker = (document: Document) =>
    documentRecoveryBlocker({
      status: document.status,
      operationKey: document.operationKey,
      templateId: document.templateId,
      providerDocumentId: document.providerDocumentId,
      hasRenderData: Boolean((document.payload as { renderData?: unknown } | null)?.renderData),
      createdAt: document.createdAt,
      local: localQaRendererEnabled(),
    });
  return (
    <div className="transaction-flow-documents">
      {documents.map((document) => (
        <article key={document.id}>
          <span className="transaction-flow-documents__mark" aria-hidden="true">
            PDF
          </span>
          <div>
            <strong>
              {documentLabels[document.type] ?? "Dokumen"}
              {document.direction === "outbound" && document.type !== "contract" ? ` · versi ${document.version}` : ""}
            </strong>
            <small>{document.documentNo ?? document.originalName ?? "Tanpa nomor"}</small>
            {document.status === "needs_review" ? (
              <div className="transaction-document-review" role="status">
                <strong>PDF versi {document.version} belum siap</strong>
                <p>
                  {readDocumentReview(document.payload)?.message ??
                    "Proses PDF sebelumnya belum selesai. Periksa hasilnya sebelum membuat revisi baru."}
                </p>
                <small>
                  {document.storagePath
                    ? "File sudah ada dan dapat dilihat."
                    : "Belum ada file untuk dipratinjau. Versi lama yang siap tetap dapat dibuka di bawah."}
                </small>
                {recoveryBlocker(document) ? <small>{recoveryBlocker(document)}</small> : null}
              </div>
            ) : null}
            {canRetry &&
            document.type !== "contract" &&
            document.status === "needs_review" &&
            !recoveryBlocker(document) ? (
              <form action={retryDocumentGeneration} className="transaction-flow-retry">
                <input name="documentId" type="hidden" value={document.id} />
                <label>
                  <input name="confirmed" required type="checkbox" value="yes" /> Saya sudah memeriksa status PDF;
                  lanjutkan permintaan yang sama, tanpa membuat versi baru.
                </label>
                <button type="submit">Periksa dan pulihkan PDF</button>
              </form>
            ) : null}
          </div>
          <span className="transaction-flow-documents__status">
            {document.status === "ready"
              ? "Siap"
              : document.status === "received"
                ? "Diterima"
                : document.status === "generating"
                  ? "Sedang dibuat"
                  : document.status === "needs_review"
                    ? "Perlu diperiksa"
                    : document.status}
          </span>
          {document.storagePath ? (
            <Link href={`/api/admin/transactions/${transaction.header.id}/documents/${document.id}`} target="_blank">
              Lihat
            </Link>
          ) : null}
          {document.type === "purchase_order" && (document.payload as { emailId?: string } | null)?.emailId ? (
            <Link href={`/admin/email?folder=inbox&email=${(document.payload as { emailId: string }).emailId}`}>
              Lihat email
            </Link>
          ) : null}
          {document.storagePath &&
          document.direction === "outbound" &&
          document.type !== "contract" &&
          document.type !== "bast_signed" &&
          documentEmailAllowed(transaction, document) &&
          !["pending", "uncertain"].includes((document.payload as { sendState?: string } | null)?.sendState ?? "") ? (
            <TransactionEmailComposer
              contacts={[
                ...(transaction.header.customerEmail
                  ? [
                      {
                        id: "primary",
                        name: transaction.header.customerName,
                        email: transaction.header.customerEmail,
                        isPrimary: true,
                      },
                    ]
                  : []),
                ...transaction.contacts
                  .filter((contact) => Boolean(contact.email) && contact.email !== transaction.header.customerEmail)
                  .map((contact) => ({
                    id: contact.id,
                    name: contact.name,
                    email: contact.email!,
                    isPrimary: contact.isPrimary,
                  })),
              ]}
              documentId={document.id}
              documentLabel={documentLabels[document.type] ?? "Dokumen"}
              lastSend={
                document.sentMessageId
                  ? {
                      recipient: document.recipient,
                      at: (document.payload as { lastEmailSentAt?: string } | null)?.lastEmailSentAt ?? null,
                      by: (document.payload as { lastEmailSenderName?: string } | null)?.lastEmailSenderName ?? null,
                    }
                  : undefined
              }
              ownerName={transaction.header.ownerName}
              requiresPicConfirmation={Boolean(
                currentUser?.role === "sales" &&
                transaction.header.ownerId &&
                transaction.header.ownerId !== currentUser.id,
              )}
              templates={(document.type === "quotation"
                ? quotationTemplates
                : document.type.startsWith("invoice")
                  ? invoiceTemplates
                  : document.type === "delivery_note"
                    ? deliveryTemplates
                    : handoverTemplates
              ).map((template) => {
                const variables = {
                  customerName: transaction.header.customerName,
                  transactionNo: transaction.header.referenceNo,
                  documentName: documentLabels[document.type]?.toLowerCase() ?? "dokumen",
                  senderName: currentUser?.name ?? "Tim Anugrah Plastik",
                };
                return {
                  ...template,
                  subject: `${docGenDummyMode() || (document.payload as { isDummy?: boolean } | null)?.isDummy ? "[UJI] " : ""}${fillEmailSubject(template.subject, variables)}`,
                  content: fillEmailTemplate(template.content, variables),
                };
              })}
              transactionId={transaction.header.id}
            />
          ) : null}
          {(document.payload as { sendState?: string } | null)?.sendState === "uncertain" ? (
            <small>Pengiriman email perlu diperiksa di Email terkirim. Jangan kirim ulang sebelum dipastikan.</small>
          ) : null}
          {(document.payload as { sendState?: string } | null)?.sendState === "pending" ? (
            <small>Permintaan email sedang diproses. Periksa Email terkirim jika tidak berubah.</small>
          ) : null}
          {(document.payload as { lastEmailState?: string } | null)?.lastEmailState === "bounced" ? (
            <small className="transaction-flow-documents__email-error">
              Gagal diterima. Periksa alamat penerima lalu kirim ulang.
            </small>
          ) : document.sentMessageId ? (
            <small>Sudah diserahkan ke server email untuk dikirim.</small>
          ) : null}
          {(document.payload as { lastEmailState?: string } | null)?.lastEmailState === "simulated" ? (
            <small>Simulasi selesai. Tidak ada email yang dikirim.</small>
          ) : null}
          {(document.payload as { lastEmailAttemptId?: string } | null)?.lastEmailAttemptId ? (
            <small>
              <Link
                href={`/admin/email?folder=sent&email=outbox:${encodeURIComponent((document.payload as { lastEmailAttemptId: string }).lastEmailAttemptId)}`}
              >
                Lihat status email di Email CS
              </Link>
            </small>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function QuoteStep({
  transaction,
  isAdmin,
  templateConfig,
  documentsHref,
  readiness,
}: {
  transaction: Transaction;
  isAdmin: boolean;
  templateConfig?: Record<string, unknown>;
  documentsHref: string;
  readiness: DocumentReadinessResult;
}) {
  const quotationDocuments = transaction.documents.filter((document) => document.type === "quotation");
  const latestQuotation = [...quotationDocuments].sort((a, b) => b.version - a.version)[0];
  const quoteNeedsReview = documentRevisionBlocker(latestQuotation?.status);
  const attachments = transaction.documents
    .filter((document) => document.type === "quotation_attachment" && document.status === "received")
    .map((document) => ({
      id: document.id,
      name: (document.payload as { caption?: string } | null)?.caption ?? document.originalName ?? "Lampiran",
      category: (document.payload as { category?: string } | null)?.category ?? "Lampiran",
    }));
  const hasReadyQuote = quotationDocuments.some((document) => document.status === "ready");
  const hasInvoice = transaction.invoices.length > 0;
  const letterAddress = readQuotationLetter(transaction.header.quoteLetter, transaction.header.title).recipientAddress;
  const addressReady = Boolean(transaction.header.customerBillingAddress || letterAddress);
  const readinessId = `quotation-readiness-${transaction.header.id}`;
  const customerProfile = {
    legalName: transaction.header.customerLegalName,
    email: transaction.header.customerEmail ?? "",
    phone: transaction.header.customerPhone ?? "",
    taxId: transaction.header.customerTaxId ?? "",
    billingAddress: transaction.header.customerBillingAddress ?? "",
    deliveryAddress: transaction.header.customerAddress ?? "",
  };
  return (
    <div className="transaction-flow-stack">
      <section className="transaction-flow-card">
        <div className="transaction-flow-card__head">
          <div>
            <span className="eyebrow">01 · Rincian pekerjaan</span>
            <h3>Siapkan penawaran</h3>
          </div>
          <span>{transaction.lines.length} item</span>
        </div>
        {transaction.lines.length ? (
          <div className="transaction-flow-line-summary">
            {transaction.lines.map((line) => (
              <div key={line.id}>
                <strong>{line.description}</strong>
                <span>
                  {number(line.quantity)} {line.unit} × {money(line.unitPrice)}
                </span>
              </div>
            ))}
            <div>
              <strong>Total price</strong>
              <span>{money(transaction.totals.quoteGross)}</span>
            </div>
            <div>
              <strong>Diskon</strong>
              <span>−{money(transaction.totals.quoteDiscount)}</span>
            </div>
            <div className="transaction-flow-line-summary__total">
              <strong>Nilai barang / jasa</strong>
              <span>{money(transaction.totals.quoteSubtotal)}</span>
            </div>
            <div>
              <strong>Pajak yang dipilih</strong>
              <span>{money(transaction.totals.quoteTax)}</span>
            </div>
            <div className="transaction-flow-line-summary__total">
              <strong>Total penawaran</strong>
              <span>{money(transaction.totals.quotedAmount)}</span>
            </div>
          </div>
        ) : (
          <p className="transaction-flow-empty">
            Belum ada rincian. Mulai dari nama barang atau jasa, jumlah, lalu harga.
          </p>
        )}
        {hasReadyQuote && !latestQuoteMatches(transaction) ? (
          <p className="transaction-flow-warning" role="status">
            Rincian sudah berubah sejak PDF terakhir dibuat. Buat versi penawaran baru sebelum mengirimkannya.
          </p>
        ) : null}
        {hasInvoice ? (
          <p className="transaction-flow-warning">
            Rincian penawaran dikunci setelah invoice dibuat agar arsip tagihan dan barang tetap cocok.
          </p>
        ) : (
          <details className="transaction-flow-details" id="quote-editor" open={!transaction.lines.length}>
            <summary>{transaction.lines.length ? "Ubah rincian penawaran" : "Isi rincian penawaran"}</summary>
            <TransactionQuoteEditor
              transactionId={transaction.header.id}
              attachments={attachments}
              initialLetter={readQuotationLetter(
                transaction.header.quoteLetter,
                transaction.header.title,
                transaction.header.customerBillingAddress ?? "",
                templateConfig as QuotationTemplateDefaults,
              )}
              canEditDiscount={isAdmin}
              initialLines={transaction.lines.map((line) => ({
                description: line.description,
                materialLabel: line.materialLabel,
                mouldingLabel: line.mouldingLabel,
                quantity: line.quantity,
                unit: line.unit,
                unitPrice: line.unitPrice,
                taxRate: line.taxRate,
                taxMethod: line.taxMethod as "legacy" | "none" | "standard" | "dpp_11_12",
                discountKind: line.discountKind as "none" | "amount" | "percent",
                discountValue: line.discountValue,
              }))}
              initialTargetDate={
                transaction.header.dueAt?.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }) ?? ""
              }
            />
          </details>
        )}
        {!hasInvoice ? (
          <details className="transaction-flow-details">
            <summary>Unggah foto, drawing, atau spesifikasi (opsional)</summary>
            <TransactionDocumentUpload
              transactionId={transaction.header.id}
              type="quotation_attachment"
              label="Tambah lampiran penawaran"
              hint="PDF, JPG, atau PNG, maksimal 10 MB. Setelah unggah, pilih lampiran di form surat lalu simpan rincian."
            />
            <DocumentList
              documents={transaction.documents.filter((document) => document.type === "quotation_attachment")}
              transaction={transaction}
            />
          </details>
        ) : null}
      </section>
      <section className="transaction-flow-card">
        <div className="transaction-flow-card__head">
          <div>
            <span className="eyebrow">02 · Tinjau dan kirim</span>
            <h3>Surat penawaran</h3>
          </div>
        </div>
        <p>Setelah rincian disimpan, buat PDF untuk ditinjau. Membuat PDF belum mengirim email.</p>
        <p>
          Nomor surat:{" "}
          <strong>
            {transaction.header.quotationNo ??
              (transaction.header.dataClass === "test"
                ? `UJI-${transaction.header.referenceNo}`
                : "Nomor dibuat otomatis saat PDF diterbitkan")}
          </strong>
        </p>
        {!addressReady ? (
          <div className="transaction-document-blocker" role="status">
            <span>Alamat penerima belum tersedia.</span>
            <CustomerDocumentProfileSheet
              focusField="billingAddress"
              initial={customerProfile}
              transactionId={transaction.header.id}
            />
          </div>
        ) : null}
        {isAdmin ? (
          <p>
            <Link href={documentsHref}>Periksa kesiapan dokumen resmi</Link>
          </p>
        ) : null}
        {!quoteNeedsReview ? (
          <form action={generateQuotation} className="transaction-flow-inline-action">
            <input name="transactionId" type="hidden" value={transaction.header.id} />
            <button aria-describedby={readinessId} disabled={!readiness.ready} type="submit">
              {quotationDocuments.length ? "Buat revisi PDF" : "Terbitkan PDF"}
            </button>
            <div aria-live="polite" id={readinessId}>
              {readiness.ready ? (
                <small className="transaction-readiness-ready">Semua persyaratan PDF sudah lengkap.</small>
              ) : (
                <small>{readiness.blockers.length} hal perlu dilengkapi sebelum menerbitkan PDF.</small>
              )}
            </div>
          </form>
        ) : null}
        {!readiness.ready ? (
          <ul
            className="transaction-document-readiness-list"
            aria-label="Hal yang perlu dilengkapi untuk PDF Penawaran"
          >
            {readiness.blockers.map((blocker) => (
              <li key={blocker.code}>
                <span>{blocker.message}</span>
                {["template", "issuer", "number", "renderer", "mode"].includes(blocker.code) ? (
                  <Link href={documentsHref}>Buka Dokumen resmi</Link>
                ) : blocker.code === "review" ? (
                  <a href="#quote-documents">Periksa PDF</a>
                ) : ["lines", "letter", "validity", "attachments"].includes(blocker.code) ? (
                  <a href="#quote-editor">Buka rincian</a>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <div id="quote-documents">
          <DocumentList canRetry={isAdmin} documents={quotationDocuments} transaction={transaction} />
        </div>
      </section>
    </div>
  );
}

function OrderStep({ transaction, returnTo }: { transaction: Transaction; returnTo: string }) {
  const po = transaction.documents.filter((item) => item.type === "purchase_order");
  return (
    <div className="transaction-flow-stack">
      <section className="transaction-flow-card">
        <div className="transaction-flow-card__head">
          <div>
            <span className="eyebrow">01 · Pesanan pelanggan</span>
            <h3>Terima PO</h3>
          </div>
          <span>{po.length ? "Sudah diterima" : "Belum ada PO"}</span>
        </div>
        <p>PO adalah pesanan resmi dari pelanggan. Simpan salinan yang diterima melalui email atau WhatsApp.</p>
        <DocumentList documents={po} transaction={transaction} />
        <details className="transaction-flow-details" open={!po.length}>
          <summary>Unggah PO pelanggan</summary>
          <TransactionDocumentUpload
            transactionId={transaction.header.id}
            type="purchase_order"
            label="Simpan PO pelanggan"
            hint="PDF atau foto hingga 10 MB. Dokumen hanya dapat dibuka oleh tim yang berwenang."
          />
        </details>
        {transaction.relatedEmails.length ? (
          <div className="transaction-flow-email-list">
            <strong>Email terkait pekerjaan ini</strong>
            {transaction.relatedEmails.map((email) => (
              <div key={email.id}>
                <div>
                  <Link href={`/admin/email?folder=inbox&email=${email.id}`}>{email.subject}</Link>
                  <small>
                    {email.fromAddress ?? "Pengirim tidak diketahui"} · {date(email.receivedAt)}
                  </small>
                </div>
                {!po.some((document) => (document.payload as { emailId?: string } | null)?.emailId === email.id) ? (
                  <form action={linkTransactionEmail}>
                    <input name="transactionId" type="hidden" value={transaction.header.id} />
                    <input name="emailId" type="hidden" value={email.id} />
                    <label className="transaction-flow-email-po">
                      <input
                        name="containsPo"
                        required={Boolean(email.linkedTransactionId)}
                        type="checkbox"
                        value="yes"
                      />{" "}
                      Email ini berisi PO pelanggan
                    </label>
                    <button type="submit">{email.linkedTransactionId ? "Simpan sebagai PO" : "Tautkan email"}</button>
                  </form>
                ) : (
                  <span>PO sudah tercatat</span>
                )}
              </div>
            ))}
          </div>
        ) : null}
        {po.length ? (
          <p>
            PO sudah tercatat.{" "}
            <Link href={`?step=payment&returnTo=${encodeURIComponent(returnTo)}#transaction-step-title`}>
              {transaction.workspace.issuedCount ? "Lihat invoice & pembayaran →" : "Lanjut buat tagihan →"}
            </Link>
          </p>
        ) : null}
      </section>
    </div>
  );
}

function PaymentStep({
  transaction,
  isAdmin,
  templateReady,
  templateConfig,
  documentsHref,
  orderHref,
}: {
  transaction: Transaction;
  isAdmin: boolean;
  templateReady: boolean;
  templateConfig?: Record<string, unknown>;
  documentsHref: string;
  orderHref: string;
}) {
  const paymentProofs = transaction.documents.filter((item) => item.type === "payment_proof");
  const invoiceDocuments = transaction.documents.filter(
    (item) => item.type === "invoice_dp" || item.type === "invoice_final",
  );
  const taxDocuments = transaction.documents.filter((item) => item.type === "tax_invoice");
  const remainingToInvoice = Math.max(0, transaction.totals.quotedAmount - transaction.totals.invoiceAmount);
  const pendingInvoice = transaction.invoices.some((invoice) => invoice.status === "draft");
  const legacyInvoice = transaction.invoices.some(
    (invoice) => invoiceCountsAsIssued(invoice.status) && !invoice.snapshot,
  );
  const overdue =
    transaction.totals.outstandingAmount > 0 &&
    transaction.invoices.some(
      (invoice) => invoiceCountsAsIssued(invoice.status) && Boolean(invoice.dueAt && invoice.dueAt < new Date()),
    );
  return (
    <div className="transaction-flow-stack">
      <dl className="transaction-flow-money">
        <div>
          <dt>Nilai pekerjaan</dt>
          <dd>{workspaceMoney(transaction.workspace.quote)}</dd>
        </div>
        <div>
          <dt>Tagihan terbit</dt>
          <dd>{workspaceMoney(transaction.workspace.invoice)}</dd>
        </div>
        <div>
          <dt>Pembayaran terverifikasi</dt>
          <dd>{workspaceMoney(transaction.workspace.received)}</dd>
        </div>
        <div>
          <dt>Sisa tagihan</dt>
          <dd>
            {transaction.workspace.issuedCount
              ? workspaceMoney(transaction.workspace.outstanding)
              : "Belum ada invoice"}
          </dd>
        </div>
      </dl>
      {overdue ? (
        <p className="transaction-flow-warning" role="status">
          Ada tagihan melewati jatuh tempo dan sisa pembayaran {money(transaction.totals.outstandingAmount)}. Hubungi
          pelanggan untuk tindak lanjut; sistem tidak mengirim pengingat otomatis.
        </p>
      ) : null}
      <section className="transaction-flow-card">
        <div className="transaction-flow-card__head">
          <div>
            <span className="eyebrow">01 · Tagihan</span>
            <h3>Buat invoice</h3>
          </div>
        </div>
        <p>
          Pilih tagihan uang muka (DP) atau tagihan akhir. Jumlah semua tagihan tidak boleh melebihi nilai penawaran.
        </p>
        {transaction.invoices.map((invoice) => (
          <div className="transaction-flow-row" key={invoice.id}>
            <strong>{invoice.invoiceNo}</strong>
            <span>
              {invoice.kind === "dp" || invoice.kind === "deposit" ? "Uang muka (DP)" : "Tagihan akhir"} ·{" "}
              {invoiceStatusLabel(invoice.status)}
            </span>
            <b>{money(invoice.amount)}</b>
            <small>Jatuh tempo {date(invoice.dueAt)}</small>
          </div>
        ))}
        {pendingInvoice ? (
          <p className="transaction-flow-warning">
            Ada invoice yang belum selesai dibuat. Periksa dokumennya sebelum membuat tagihan lain.
          </p>
        ) : null}
        {legacyInvoice ? (
          <p className="transaction-flow-warning">
            Invoice lama belum memiliki rincian pajak tersimpan. Tagihan baru untuk transaksi ini memerlukan peninjauan
            manual administrator; arsip lama tidak diubah otomatis.
          </p>
        ) : null}
        {isAdmin && remainingToInvoice > 0 && !pendingInvoice && !legacyInvoice ? (
          <details className="transaction-flow-details">
            <summary>Buat tagihan baru</summary>
            <TransactionInvoiceForm
              canGenerate={templateReady}
              defaultPaymentTerms={
                typeof templateConfig?.paymentTerms === "string" ? templateConfig.paymentTerms : undefined
              }
              customerAddress={transaction.header.customerBillingAddress ?? ""}
              customerName={transaction.header.customerName}
              customerProfile={{
                legalName: transaction.header.customerLegalName,
                email: transaction.header.customerEmail ?? "",
                phone: transaction.header.customerPhone ?? "",
                taxId: transaction.header.customerTaxId ?? "",
                billingAddress: transaction.header.customerBillingAddress ?? "",
                deliveryAddress: transaction.header.customerAddress ?? "",
              }}
              documentSettingsHref={documentsHref}
              invoices={transaction.invoices
                .filter((invoice) => invoiceCountsAsIssued(invoice.status))
                .map((invoice) => ({
                  kind: invoice.kind,
                  amount: invoice.amount,
                  dpApplied: invoice.dpApplied,
                  snapshot: invoice.snapshot,
                  shipmentId: invoice.shipmentId,
                }))}
              lines={transaction.lines.map((line) => ({
                id: line.id,
                description: line.description,
                quantity: line.quantity,
                unit: line.unit,
                unitPrice: line.unitPrice,
                taxRate: line.taxRate,
                taxMethod: line.taxMethod,
                discountKind: line.discountKind,
                discountValue: line.discountValue,
                materialName: line.materialName,
              }))}
              poNumber={transaction.documents.find((document) => document.type === "purchase_order")?.documentNo ?? ""}
              orderHref={orderHref}
              shipments={transaction.shipments
                .filter(
                  (shipment) =>
                    ["shipped", "received"].includes(shipment.status) &&
                    !transaction.invoices.some(
                      (invoice) => invoiceCountsAsIssued(invoice.status) && invoice.shipmentId === shipment.id,
                    ),
                )
                .map((shipment) => ({
                  id: shipment.id,
                  referenceNo: shipment.shipmentNo,
                  status: shipment.status,
                  items: transaction.shipmentItems
                    .filter((item) => item.shipmentId === shipment.id)
                    .map((item) => ({ lineId: item.lineId, quantity: item.quantity })),
                }))}
              transactionId={transaction.header.id}
              verifiedPayments={String(transaction.totals.receivedAmount)}
            />
          </details>
        ) : null}
        <DocumentList canRetry={isAdmin} documents={invoiceDocuments} transaction={transaction} />
      </section>
      <section className="transaction-flow-card" id="transaction-payment-review">
        <div className="transaction-flow-card__head">
          <div>
            <span className="eyebrow">02 · Pembayaran</span>
            <h3>Catat konfirmasi pelanggan</h3>
          </div>
        </div>
        <p>Catatan dari sales belum dihitung sebagai uang diterima sampai administrator memeriksanya.</p>
        <details className="transaction-flow-details">
          <summary>Unggah bukti transfer</summary>
          <TransactionDocumentUpload
            transactionId={transaction.header.id}
            type="payment_proof"
            label="Bukti pembayaran"
            hint="Simpan PDF atau foto bukti transfer sebelum mencatat pembayaran."
          />
        </details>
        <form action={recordTransactionPayment} className="transaction-flow-form">
          <input name="transactionId" type="hidden" value={transaction.header.id} />
          <input name="operationKey" type="hidden" value={randomUUID()} />
          <label>
            Jumlah yang dikonfirmasi (Rp)
            <input min="0.01" name="amount" required step="0.01" type="number" />
          </label>
          <label>
            Bukti transfer
            <select defaultValue="" name="proofDocumentId">
              <option value="">Belum ada bukti</option>
              {paymentProofs.map((proof) => (
                <option key={proof.id} value={proof.id}>
                  {proof.originalName ?? proof.documentNo ?? "Bukti pembayaran"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Referensi atau catatan
            <input maxLength={160} name="reference" placeholder="Nomor transfer atau penjelasan singkat" />
          </label>
          <button type="submit">Catat untuk diperiksa</button>
        </form>
        <div className="transaction-flow-list">
          {transaction.entries
            .filter((item) => item.kind === "customer_payment")
            .map((entry) => (
              <div className="transaction-flow-row" key={entry.id}>
                <strong>{money(entry.amount)}</strong>
                <span>{entry.status === "verified" ? "Sudah diperiksa" : "Menunggu pemeriksaan"}</span>
                <small>
                  {entry.reference ?? "Tanpa referensi"} · {date(entry.occurredAt)}
                </small>
                {entry.status === "unverified" && isAdmin ? (
                  <form action={verifyTransactionPayment}>
                    <input name="entryId" type="hidden" value={entry.id} />
                    <button type="submit">Verifikasi pembayaran</button>
                  </form>
                ) : null}
              </div>
            ))}
        </div>
      </section>
      {isAdmin ? (
        <section className="transaction-flow-card">
          <div className="transaction-flow-card__head">
            <div>
              <span className="eyebrow">Dokumen pajak</span>
              <h3>Faktur pajak resmi</h3>
            </div>
          </div>
          <p>Unggah faktur dari Coretax/e-Faktur. Aplikasi ini tidak menerbitkan faktur pajak.</p>
          <DocumentList documents={taxDocuments} transaction={transaction} />
          <details className="transaction-flow-details">
            <summary>Simpan faktur pajak</summary>
            <TransactionDocumentUpload
              transactionId={transaction.header.id}
              type="tax_invoice"
              label="Faktur pajak resmi"
              hint="Masukkan nomor faktur dan unggah PDF resmi yang sudah diterbitkan."
            />
          </details>
        </section>
      ) : null}
    </div>
  );
}

function ProductionStep({ transaction, isAdmin }: { transaction: Transaction; isAdmin: boolean }) {
  const released = transaction.header.fulfilmentStatus !== "not_released";
  const checks = [
    { id: "customer", label: "Pelanggan tercatat", ready: Boolean(transaction.header.customerName) },
    {
      id: "quote",
      label: "Barang dan nilai penawaran ada",
      ready: transaction.lines.length > 0 && transaction.totals.quotedAmount > 0,
    },
    { id: "target", label: "Target pekerjaan ditentukan", ready: Boolean(transaction.header.dueAt) },
    { id: "invoice", label: "Tagihan sudah diterbitkan", ready: transaction.totals.invoiceAmount > 0 },
    { id: "payment", label: "Pembayaran sudah diperiksa", ready: transaction.totals.receivedAmount > 0 },
  ];
  const incomplete = checks.some((check) => !check.ready);
  return (
    <div className="transaction-flow-stack">
      <section className="transaction-flow-card">
        <div className="transaction-flow-card__head">
          <div>
            <span className="eyebrow">01 · Pemeriksaan</span>
            <h3>Lepaskan ke produksi</h3>
          </div>
          <span>{released ? "Sudah dilepas" : "Belum dilepas"}</span>
        </div>
        <p>Administrator dapat melanjutkan walaupun ada data yang belum lengkap, tetapi wajib mencatat alasannya.</p>
        <ul className="transaction-flow-checklist">
          {checks.map((check) => (
            <li key={check.id}>
              <span aria-hidden="true">{check.ready ? "✓" : "!"}</span>
              <div className={styles.checklistLabel}>{check.label}</div>
              <strong>{check.ready ? "Siap" : "Belum lengkap"}</strong>
              {check.id === "target" ? (
                <div className={styles.checklistDetail}>
                  {check.ready ? (
                    <small>Tanggal target: {date(transaction.header.dueAt)}</small>
                  ) : (
                    <>
                      <small>Tanggal target pekerjaan belum diisi.</small>
                      {transaction.header.fulfilmentStatus !== "completed" ? (
                        <a href="#production-target">Isi tanggal target</a>
                      ) : (
                        <small>Transaksi sudah ditutup; hubungi Admin bila perlu koreksi.</small>
                      )}
                    </>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        {!transaction.header.dueAt && transaction.header.fulfilmentStatus !== "completed" ? (
          <form action={saveProductionTargetDate} className={styles.productionTargetForm} id="production-target">
            <input name="transactionId" type="hidden" value={transaction.header.id} />
            <label htmlFor="production-target-date">Tanggal target pekerjaan</label>
            <div className={styles.productionTargetControls}>
              <input
                aria-describedby="production-target-hint"
                id="production-target-date"
                name="targetDate"
                required
                type="date"
              />
              <button type="submit">Simpan tanggal</button>
            </div>
            <small id="production-target-hint">
              Tanggal ini untuk jadwal produksi. Invoice dan PDF yang sudah terbit tidak berubah.
            </small>
          </form>
        ) : null}
        {isAdmin && !released ? (
          <form action={releaseProduction} className="transaction-flow-form">
            <input name="transactionId" type="hidden" value={transaction.header.id} />
            {incomplete ? (
              <label>
                Alasan tetap melanjutkan
                <textarea
                  minLength={8}
                  name="reason"
                  placeholder="Contoh: Sampel perlu dibuat sebelum DP diterima."
                  required
                  rows={3}
                />
              </label>
            ) : null}
            <button type="submit">Lepaskan ke produksi</button>
          </form>
        ) : null}
      </section>
      <section className="transaction-flow-card">
        <div className="transaction-flow-card__head">
          <div>
            <span className="eyebrow">02 · Pekerjaan produksi</span>
            <h3>Sampel dan batch</h3>
          </div>
        </div>
        {transaction.batches.map((batch) => (
          <div className="transaction-flow-row" key={batch.id}>
            <strong>{batch.batchNo}</strong>
            <span>
              {batch.kind === "sample" ? "Sampel" : "Produksi"} ·{" "}
              {batch.status === "completed" ? "Selesai" : "Direncanakan"}
            </span>
            <small>
              Rencana {number(batch.plannedQuantity)} · selesai {number(batch.completedQuantity)}
            </small>
            {isAdmin && batch.status !== "completed" ? (
              <form
                action={completeProductionBatch}
                className={styles.batchCompleteForm}
                data-testid="batch-complete-form"
              >
                <input name="batchId" type="hidden" value={batch.id} />
                <label className={styles.batchCompleteField}>
                  Jumlah selesai
                  <input
                    className={styles.batchCompleteInput}
                    inputMode="decimal"
                    max={Number(batch.plannedQuantity ?? 0)}
                    min="0.001"
                    name="completedQuantity"
                    placeholder="0"
                    required
                    step="0.001"
                    type="number"
                  />
                </label>
                <button type="submit">Tandai selesai</button>
              </form>
            ) : null}
          </div>
        ))}
        {!transaction.batches.length ? <p className="transaction-flow-empty">Belum ada sampel atau batch.</p> : null}
        {isAdmin && released ? (
          <details className="transaction-flow-details">
            <summary>Catat sampel atau batch baru</summary>
            <form action={createProductionBatch} className="transaction-flow-form">
              <input name="transactionId" type="hidden" value={transaction.header.id} />
              <label>
                Jenis pekerjaan
                <select name="kind">
                  <option value="sample">Sampel</option>
                  <option value="production">Produksi</option>
                </select>
              </label>
              <label>
                Jumlah rencana
                <input min="0.001" name="plannedQuantity" required step="0.001" type="number" />
              </label>
              <button type="submit">Simpan rencana</button>
            </form>
          </details>
        ) : null}
      </section>
    </div>
  );
}

function DeliveryStep({
  transaction,
  isAdmin,
  templateReady,
  documentsHref,
}: {
  transaction: Transaction;
  isAdmin: boolean;
  templateReady: boolean;
  documentsHref: string;
}) {
  const shippedByLine = new Map<string, number>();
  transaction.shipmentItems.forEach((item) => {
    const shipment = transaction.shipments.find((entry) => entry.id === item.shipmentId)!;
    shippedByLine.set(
      item.lineId,
      (shippedByLine.get(item.lineId) ?? 0) + committedAmount(shipment.status, item.quantity, item.acceptedQuantity),
    );
  });
  const shipmentLines = transaction.lines.map((line) => ({
    id: line.id,
    description: line.description,
    unit: line.unit,
    remaining: Math.max(0, Number(line.quantity) - (shippedByLine.get(line.id) ?? 0)),
  }));
  return (
    <div className="transaction-flow-stack">
      <section className="transaction-flow-card">
        <div className="transaction-flow-card__head">
          <div>
            <span className="eyebrow">01 · Jumlah barang</span>
            <h3>Siapkan pengiriman</h3>
          </div>
        </div>
        {transaction.header.fulfilmentStatus === "not_released" ? (
          <p className="transaction-flow-empty">Pekerjaan perlu dilepas ke produksi sebelum pengiriman disiapkan.</p>
        ) : (
          <TransactionShipmentForm
            transactionId={transaction.header.id}
            lines={shipmentLines}
            customerName={transaction.header.customerName}
            customerAddress={transaction.header.customerAddress ?? ""}
          />
        )}
      </section>
      <section className="transaction-flow-card">
        <div className="transaction-flow-card__head">
          <div>
            <span className="eyebrow">02 · Surat jalan</span>
            <h3>Periksa lalu kirim barang</h3>
          </div>
        </div>
        {isAdmin ? (
          <p>
            <Link href={documentsHref}>Periksa kesiapan dokumen resmi</Link>
          </p>
        ) : null}
        {transaction.shipments.length ? (
          transaction.shipments.map((shipment) => {
            const document = transaction.documents.find((item) => item.id === shipment.deliveryDocumentId);
            const versions = transaction.documents
              .filter(
                (item) =>
                  item.type === "delivery_note" &&
                  ((item.payload as { shipmentId?: string } | null)?.shipmentId === shipment.id ||
                    item.id === document?.id),
              )
              .sort((left, right) => right.version - left.version);
            const currentItems = transaction.shipmentItems.filter((item) => item.shipmentId === shipment.id);
            const mayRevise =
              shipment.status === "planned" &&
              (!document || (Boolean(shipment.deliveryNo) && document.status === "ready"));
            return (
              <article className="transaction-flow-shipment" key={shipment.id}>
                <div>
                  <strong>{shipment.deliveryNo ?? shipment.shipmentNo}</strong>
                  <span>
                    {shipment.status === "planned"
                      ? "Disiapkan"
                      : shipment.status === "shipped"
                        ? "Dalam pengiriman"
                        : shipment.status === "received_partial"
                          ? "Diterima sebagian · siapkan pengganti"
                          : "Diterima pelanggan"}
                  </span>
                  <small>
                    {currentItems.map((item) => `${item.description}: ${number(item.quantity)}`).join(" · ")}
                  </small>
                </div>
                {mayRevise ? (
                  <details className="transaction-flow-details">
                    <summary>{document ? "Koreksi sebelum barang dikirim" : "Ubah rencana pengiriman"}</summary>
                    <p>
                      Jika PDF sudah dibuat, koreksi akan menyimpan PDF lama sebagai arsip. Buat versi baru sebelum
                      menandai barang dikirim.
                    </p>
                    <TransactionShipmentForm
                      transactionId={transaction.header.id}
                      shipmentId={shipment.id}
                      lines={shipmentLines.map((line) => ({
                        ...line,
                        remaining:
                          line.remaining + Number(currentItems.find((item) => item.lineId === line.id)?.quantity ?? 0),
                      }))}
                      customerName={shipment.recipientName ?? transaction.header.customerName}
                      customerAddress={shipment.deliveryAddress ?? transaction.header.customerAddress ?? ""}
                      initialDetails={readDeliveryDetails(shipment.deliveryDetails)}
                      initialItems={currentItems.map((item) => ({
                        lineId: item.lineId,
                        quantity: item.quantity,
                        logistics: readShipmentLogistics(item.logistics),
                      }))}
                    />
                  </details>
                ) : null}
                {shipment.status === "planned" && !document && documentRevisionBlocker(versions[0]?.status) ? (
                  <div className="transaction-document-blocker" role="status">
                    <span>
                      PDF surat jalan sebelumnya belum selesai. Periksa status di bawah sebelum membuat revisi.
                    </span>
                    <a href={`#delivery-documents-${shipment.id}`}>Periksa PDF</a>
                  </div>
                ) : null}
                {shipment.status === "planned" && !document && !documentRevisionBlocker(versions[0]?.status) ? (
                  <form action={generateDeliveryNote}>
                    <input name="shipmentId" type="hidden" value={shipment.id} />
                    <button disabled={!templateReady} type="submit">
                      {versions.length ? "Buat revisi PDF" : "Terbitkan PDF"}
                    </button>
                    {!templateReady ? (
                      <small>
                        Template Surat Jalan belum aktif. Selesaikan di Dokumen resmi; rencana tetap tersimpan.
                      </small>
                    ) : null}
                  </form>
                ) : null}
                {versions.length ? (
                  <div id={`delivery-documents-${shipment.id}`}>
                    <DocumentList canRetry={isAdmin} documents={versions} transaction={transaction} />
                  </div>
                ) : null}
                {shipment.status === "planned" && document?.status === "ready" ? (
                  <form action={markShipmentSent}>
                    <input name="shipmentId" type="hidden" value={shipment.id} />
                    <button type="submit">Tandai barang dikirim</button>
                  </form>
                ) : null}
              </article>
            );
          })
        ) : (
          <p className="transaction-flow-empty">Belum ada pengiriman.</p>
        )}
      </section>
    </div>
  );
}

function HandoverStep({
  transaction,
  isAdmin,
  templateReady,
  documentsHref,
}: {
  transaction: Transaction;
  isAdmin: boolean;
  templateReady: boolean;
  documentsHref: string;
}) {
  const pending = transaction.shipments.filter(
    (shipment) => !["received", "received_partial"].includes(shipment.status) || !shipment.bastDocumentId,
  );
  const delivered = new Map<string, number>();
  transaction.shipmentItems
    .filter((item) =>
      transaction.shipments.some(
        (shipment) =>
          shipment.id === item.shipmentId &&
          ["received", "received_partial"].includes(shipment.status) &&
          shipment.bastDocumentId,
      ),
    )
    .forEach((item) => {
      const shipment = transaction.shipments.find((entry) => entry.id === item.shipmentId)!;
      delivered.set(
        item.lineId,
        (delivered.get(item.lineId) ?? 0) + acceptedAmount(shipment.status, item.quantity, item.acceptedQuantity),
      );
    });
  const allDelivered =
    transaction.lines.length > 0 &&
    transaction.lines.every((line) => (delivered.get(line.id) ?? 0) + 0.0001 >= Number(line.quantity));
  const readyToClose =
    transaction.shipments.length > 0 &&
    !pending.length &&
    !transaction.shipments.some(
      (shipment) => (shipment.handoverDetails as { condition?: string } | null)?.condition === "damaged",
    ) &&
    allDelivered &&
    transaction.totals.invoiceAmount + 0.001 >= transaction.totals.quotedAmount &&
    transaction.totals.outstandingAmount === 0;
  return (
    <div className="transaction-flow-stack">
      <section className="transaction-flow-card">
        <div className="transaction-flow-card__head">
          <div>
            <span className="eyebrow">01 · Bukti penerimaan</span>
            <h3>Serah terima barang</h3>
          </div>
        </div>
        <p>
          STB mencatat jumlah dan kondisi barang yang benar-benar diterima. PDF tanpa tanda tangan bukan bukti
          penerimaan.
        </p>
        {isAdmin ? (
          <p>
            <Link href={documentsHref}>Periksa kesiapan dokumen resmi</Link>
          </p>
        ) : null}
        {transaction.shipments.map((shipment) => {
          const bastDocuments = transaction.documents
            .filter(
              (item) =>
                item.type === "bast" && (item.payload as { shipmentId?: string } | null)?.shipmentId === shipment.id,
            )
            .sort((left, right) => right.version - left.version);
          const latest = bastDocuments[0];
          const currentProof = transaction.documents.find((item) => item.id === shipment.bastDocumentId);
          const shipmentItems = transaction.shipmentItems.filter((item) => item.shipmentId === shipment.id);
          const deliveryDetails = readDeliveryDetails(shipment.deliveryDetails);
          const saved = handoverDetailsSchema.safeParse(shipment.handoverDetails);
          const latestDetails = handoverDetailsSchema.safeParse(
            (latest?.payload as { details?: unknown } | null)?.details,
          );
          const initial = saved.success
            ? saved.data
            : latestDetails.success
              ? latestDetails.data
              : {
                  recipient: shipment.recipientName ?? "",
                  location: shipment.deliveryAddress ?? "",
                  condition: "good" as const,
                  note: "",
                  senderName: deliveryDetails.senderName,
                  driverName: deliveryDetails.driverName,
                  receiverName: deliveryDetails.receiverSignatureName,
                  items: shipmentItems.map((item) => ({ lineId: item.lineId, accepted: item.quantity })),
                };
          return (
            <article className="transaction-flow-shipment" key={shipment.id}>
              <div>
                <strong>{shipment.shipmentNo}</strong>
                <span>
                  {shipment.status === "received_partial" && shipment.bastDocumentId
                    ? "Diterima sebagian · selisih dapat dikirim ulang"
                    : shipment.status === "received" && shipment.bastDocumentId
                      ? "Bukti penerimaan lengkap tersimpan"
                      : shipment.status === "shipped"
                        ? "Menunggu bukti pelanggan"
                        : "Belum dikirim"}
                </span>
              </div>
              {shipment.status !== "planned" ? (
                <>
                  <div id={`handover-documents-${shipment.id}`}>
                    <DocumentList canRetry={isAdmin} documents={bastDocuments} transaction={transaction} />
                  </div>
                  {shipment.status === "shipped" || (shipment.bastDocumentId && isAdmin) ? (
                    <TransactionHandoverForm
                      transactionId={transaction.header.id}
                      shipmentId={shipment.id}
                      lines={shipmentItems.map((item) => ({
                        lineId: item.lineId,
                        description: item.description,
                        quantity: item.quantity,
                        unit: transaction.lines.find((line) => line.id === item.lineId)?.unit ?? "pcs",
                      }))}
                      initial={initial}
                      latestReady={latest?.status === "ready"}
                      latestNeedsReview={documentRevisionBlocker(latest?.status)}
                      latestNumber={latest?.documentNo ?? null}
                      hasProof={Boolean(shipment.bastDocumentId)}
                      isAdmin={isAdmin}
                      enabled={templateReady}
                    />
                  ) : null}
                  {shipment.bastDocumentId ? (
                    <Link
                      href={`/api/admin/transactions/${transaction.header.id}/documents/${shipment.bastDocumentId}`}
                      target="_blank"
                    >
                      Lihat STB bertanda tangan
                      {currentProof?.payload && (currentProof.payload as { source?: string }).source === "external"
                        ? " (dokumen eksternal)"
                        : ""}
                    </Link>
                  ) : null}
                </>
              ) : null}
            </article>
          );
        })}
        {!transaction.shipments.length ? (
          <p className="transaction-flow-empty">Belum ada pengiriman untuk diserahterimakan.</p>
        ) : null}
      </section>
      {isAdmin ? (
        <section className="transaction-flow-card">
          <div className="transaction-flow-card__head">
            <div>
              <span className="eyebrow">02 · Tinjau akhir</span>
              <h3>Tutup transaksi</h3>
            </div>
          </div>
          {transaction.header.fulfilmentStatus === "completed" ? (
            <p className="transaction-flow-success">
              Transaksi sudah ditutup. Riwayat dan dokumen tetap dapat dilihat.
            </p>
          ) : (
            <>
              <p>
                {readyToClose
                  ? "Bukti penerimaan dan pembayaran sudah tercatat. Periksa sekali lagi sebelum menutup."
                  : "Masih ada pengiriman atau pembayaran yang belum selesai. Administrator dapat menutup dengan alasan pengecualian yang jelas."}
              </p>
              <form action={closeTransaction} className="transaction-flow-form">
                <input name="transactionId" type="hidden" value={transaction.header.id} />
                {!readyToClose ? (
                  <>
                    <label>
                      Alasan pengecualian
                      <textarea
                        minLength={8}
                        maxLength={500}
                        name="exceptionReason"
                        placeholder="Jelaskan mengapa transaksi ditutup walau masih ada pekerjaan tertunda."
                        required
                        rows={3}
                      />
                    </label>
                    <label className="transaction-flow-checkbox">
                      <input name="exceptionConfirmed" required type="checkbox" value="yes" />
                      <span>
                        Saya memahami bahwa transaksi ini akan ditutup sebagai pengecualian, bukan penutupan normal.
                      </span>
                    </label>
                  </>
                ) : null}
                <button type="submit">{readyToClose ? "Tutup transaksi" : "Tutup sebagai pengecualian"}</button>
              </form>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}

export default async function TransactionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string; stage?: string; returnTo?: string; notice?: string; email?: string }>;
}) {
  const user = await requireOperationsAccess();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [transaction, ...activeTemplates] = await Promise.all([
    getTransactionDetail(id),
    ...(["quotation", "invoice", "delivery", "handover"] as DocumentTemplateKind[]).map((kind) =>
      getActiveDocumentTemplate(kind),
    ),
  ]);
  if (!transaction) notFound();
  const suggested = latestStep(transaction);
  const requested =
    query.step ??
    (query.stage === "payment"
      ? "payment"
      : query.stage === "fulfilment"
        ? "production"
        : query.stage === "commercial"
          ? "quote"
          : suggested);
  const active: Step = steps.some((step) => step.id === requested) ? (requested as Step) : suggested;
  const quoteReadiness = active === "quote" ? await quotationDocumentReadiness(id) : null;
  const returnTo = query.returnTo?.startsWith("/admin/transactions?") ? query.returnTo : "/admin/transactions";
  const stepStates = transactionStepStates(transaction, transaction.workspace);
  const readonly =
    transaction.header.fulfilmentStatus === "completed" || transaction.header.commercialStatus === "cancelled";
  const recommended = transaction.workspace.pendingPayment ? "payment" : suggested;
  const recommendedLabel = steps.find((step) => step.id === recommended)!.label;
  const ContinueLink = active === recommended ? "a" : Link;
  const templateReady = {
    quotation: Boolean(activeTemplates[0]) || quotationTemplateReady(),
    invoice: Boolean(activeTemplates[1]) || Boolean(docGenTemplateId("INVOICE")),
    delivery: Boolean(activeTemplates[2]) || docGenTemplateReady("DELIVERY"),
    handover: Boolean(activeTemplates[3]) || docGenTemplateReady("BAST"),
  };
  const detailReturnPath = `/admin/transactions/${id}?step=${active}&returnTo=${encodeURIComponent(returnTo)}#transaction-step-title`;
  const documentsHref = `/admin/settings/documents?returnTo=${encodeURIComponent(detailReturnPath)}`;
  const orderHref = `/admin/transactions/${id}?step=order&returnTo=${encodeURIComponent(returnTo)}#transaction-step-title`;

  const notices: Record<string, string> = {
    "draft-saved": "Rincian penawaran tersimpan. Periksa nilainya sebelum membuat PDF.",
    "pdf-ready": "PDF penawaran siap ditinjau dan dikirim.",
    "pdf-check": "PDF penawaran belum siap. Buka daftar dokumen untuk melihat penyebab dan cara melanjutkannya.",
    "pdf-pending-review":
      "PDF sebelumnya masih perlu diperiksa. Lanjutkan proses yang sama sebelum membuat revisi baru.",
    "quote-not-ready": "PDF belum dapat diterbitkan. Lihat daftar hal yang perlu dilengkapi pada langkah Penawaran.",
    "docgen-unavailable": "Template penawaran baru belum terverifikasi di DocGen. Draf tetap tersimpan.",
    "invoice-template-unavailable": "Template invoice DocGen belum disiapkan.",
    "invoice-check": "Invoice belum siap. Periksa DocGen sebelum mencoba lagi.",
    "invoice-ready": "Invoice siap ditinjau dan dikirim.",
    "delivery-template-unavailable":
      "Template surat jalan baru belum terverifikasi di DocGen. Rencana tetap tersimpan.",
    "delivery-check": "Surat jalan belum siap. Periksa DocGen sebelum mencoba lagi.",
    "delivery-pending-review":
      "PDF surat jalan sebelumnya belum selesai. Periksa proses yang sama sebelum membuat revisi.",
    "delivery-ready": "Surat jalan siap diperiksa.",
    "template-unavailable": "Template dokumen DocGen belum disiapkan.",
    "document-check": "Dokumen belum siap. Periksa DocGen sebelum mencoba lagi.",
    "handover-pending-review": "PDF STB sebelumnya belum selesai. Periksa proses yang sama sebelum membuat revisi.",
    "document-ready": "Dokumen siap ditinjau.",
    "email-linked": "Email ditautkan ke transaksi ini.",
    "batch-created": "Rencana sampel atau batch tersimpan.",
    "batch-completed": "Jumlah selesai dicatat.",
    "target-saved": "Tanggal target pekerjaan tersimpan. Pemeriksaan produksi sudah diperbarui.",
    "target-invalid": "Tanggal target tidak valid. Pilih tanggal pada formulir di langkah Produksi.",
    "target-unavailable":
      "Tanggal target belum dapat disimpan. Muat ulang halaman dan periksa apakah transaksi masih aktif.",
    "shipment-planned": "Pengiriman disiapkan. Buat dan periksa surat jalan sebelum mengirim barang.",
    "shipment-revised": "Rincian pengiriman diperbarui. Jika PDF lama ada, buat versi baru sebelum barang dikirim.",
    "shipment-sent": "Barang ditandai sudah dikirim.",
    closed: "Transaksi ditutup dan tetap tersimpan sebagai riwayat.",
  };

  return (
    <section className={`transaction-flow-page ${styles.detail}`}>
      <AdminPageHeader
        title={transaction.header.title}
        description={`${transaction.header.referenceNo} · ${transaction.header.customerName} · Penanggung jawab: ${transaction.header.ownerName ?? "Belum ditentukan"}`}
        back={{ href: returnTo, label: "Kembali ke semua transaksi" }}
        actions={
          <span
            className={styles.fulfilmentBadge}
            data-tone={
              transaction.header.fulfilmentStatus === "completed"
                ? "success"
                : transaction.header.fulfilmentStatus === "not_released"
                  ? "neutral"
                  : "active"
            }
          >
            {transaction.header.fulfilmentStatus === "completed"
              ? "Selesai"
              : transactionStatusLabel("fulfilment", transaction.header.fulfilmentStatus)}
          </span>
        }
      />
      {transaction.header.dataClass !== "production" ? (
        <p className="transaction-flow-notice">Transaksi uji atau contoh, bukan pelanggan nyata.</p>
      ) : null}
      {query.notice && notices[query.notice] ? (
        <p className="transaction-flow-notice" role="status">
          {notices[query.notice]}
        </p>
      ) : null}
      {query.email === "sent" ? (
        <p className="transaction-flow-notice" role="status">
          Dokumen diserahkan ke server email untuk dikirim.
        </p>
      ) : null}
      {query.email === "check" ? (
        <p className="transaction-flow-notice" role="alert">
          Pengiriman email belum pasti. Periksa Email terkirim sebelum mencoba ulang.
        </p>
      ) : null}
      <div className="transaction-flow-summary">
        <div>
          <span>Penawaran setelah diskon & pajak</span>
          <strong>{workspaceMoney(transaction.workspace.quote)}</strong>
        </div>
        <div>
          <span>Tagihan terbit</span>
          <strong>{workspaceMoney(transaction.workspace.invoice)}</strong>
        </div>
        <div>
          <span>Sisa tagihan</span>
          <strong>
            {transaction.workspace.issuedCount
              ? workspaceMoney(transaction.workspace.outstanding)
              : "Belum ada invoice"}
          </strong>
        </div>
        <div>
          <span>Pembayaran terverifikasi</span>
          <strong>{workspaceMoney(transaction.workspace.received)}</strong>
        </div>
      </div>
      {transaction.workspace.pendingPayment ? (
        <p className="transaction-flow-notice" role="status">
          <Link
            href={`/admin/transactions/${id}?step=payment&returnTo=${encodeURIComponent(returnTo)}#transaction-step-title`}
          >
            Pembayaran menunggu verifikasi administrator
          </Link>
          . Status ini tetap berlaku meskipun produksi atau pengiriman sudah berjalan.
        </p>
      ) : null}
      {transaction.totals.overpaymentAmount > 0 ? (
        <TransactionPaymentAttention
          difference={money(transaction.totals.overpaymentAmount)}
          href={`/admin/transactions/${id}?step=payment&returnTo=${encodeURIComponent(returnTo)}#transaction-payment-review`}
          issued={money(transaction.totals.invoiceAmount)}
          received={money(transaction.totals.receivedAmount)}
        />
      ) : null}
      <div className="transaction-flow-layout">
        <main>
          <div className={styles.recommendation}>
            <div>
              <p className="eyebrow">{readonly ? "Arsip pekerjaan" : "Yang perlu dikerjakan"}</p>
              <h2>
                {readonly
                  ? transaction.workspace.action
                  : transaction.workspace.pendingPayment
                    ? "Periksa pembayaran pelanggan"
                    : transaction.workspace.action}
              </h2>
              <p>
                {readonly
                  ? "Dokumen dan riwayat tetap tersedia untuk ditinjau."
                  : transaction.workspace.pendingPayment
                    ? user.role === "admin"
                      ? "Buka bukti pembayaran dan cocokkan jumlahnya sebelum memverifikasi."
                      : "Menunggu verifikasi administrator. Anda tetap dapat melihat bukti dan melanjutkan pencatatan yang diizinkan."
                    : `Lanjutkan di ${recommendedLabel}. Langkah lainnya tetap bisa dibuka untuk melihat rincian.`}
              </p>
            </div>
            {!readonly ? (
              <ContinueLink
                className={styles.continueLink}
                href={
                  active === recommended
                    ? "#transaction-step-title"
                    : `/admin/transactions/${id}?step=${recommended}&returnTo=${encodeURIComponent(returnTo)}#transaction-step-title`
                }
              >
                {active === recommended ? "Lihat rincian" : `Buka ${recommendedLabel}`}{" "}
                <span aria-hidden="true">→</span>
              </ContinueLink>
            ) : null}
          </div>
          <p className={styles.navigationHelp}>
            Pilih langkah untuk melihat atau melengkapi data. Status di bawah menunjukkan catatan yang sudah tersedia.
          </p>
          <nav aria-label="Langkah transaksi" className="transaction-flow-nav">
            {steps.map((step, index) => (
              <Link
                aria-current={active === step.id ? "step" : undefined}
                className={active === step.id ? "is-active" : stepStates[step.id].kind === "complete" ? "is-done" : ""}
                data-state={stepStates[step.id].kind}
                href={`/admin/transactions/${id}?step=${step.id}&returnTo=${encodeURIComponent(returnTo)}#transaction-step-title`}
                key={step.id}
              >
                <span aria-hidden="true">
                  {stepStates[step.id].kind === "complete" ? "✓" : String(index + 1).padStart(2, "0")}
                </span>
                <strong>
                  <span aria-hidden="true">{step.short}</span>
                  <span className="admin-sr-only">{step.label}</span>
                </strong>
                <small>{stepStates[step.id].label}</small>
              </Link>
            ))}
          </nav>
          <section
            className="transaction-flow-focus"
            aria-labelledby="transaction-step-title"
            data-ui-surface="workspace"
          >
            <div className="transaction-flow-focus__intro">
              <div>
                <p className="eyebrow">Langkah {steps.findIndex((step) => step.id === active) + 1} dari 6</p>
                <h2 id="transaction-step-title" tabIndex={-1}>
                  {steps.find((step) => step.id === active)?.label}
                </h2>
                <p>{steps.find((step) => step.id === active)?.help}</p>
              </div>
              <span className={styles.stepBadge} data-state={stepStates[active].kind}>
                {stepStates[active].label}
              </span>
            </div>
            <div className="transaction-flow-next">
              <strong>{readonly ? "Ringkasan" : "Pada langkah ini"}</strong>
              <p>{nextAction(active, transaction)}</p>
            </div>
            <fieldset className="transaction-flow-step-fields" disabled={readonly}>
              {active === "quote" ? (
                <QuoteStep
                  transaction={transaction}
                  isAdmin={user.role === "admin"}
                  documentsHref={documentsHref}
                  templateConfig={(activeTemplates[0]?.config as Record<string, unknown> | null) ?? undefined}
                  readiness={quoteReadiness!}
                />
              ) : null}
              {active === "order" ? <OrderStep transaction={transaction} returnTo={returnTo} /> : null}
              {active === "payment" ? (
                <PaymentStep
                  isAdmin={user.role === "admin"}
                  documentsHref={documentsHref}
                  orderHref={orderHref}
                  templateConfig={(activeTemplates[1]?.config as Record<string, unknown> | null) ?? undefined}
                  templateReady={templateReady.invoice}
                  transaction={transaction}
                />
              ) : null}
              {active === "production" ? (
                <ProductionStep isAdmin={user.role === "admin"} transaction={transaction} />
              ) : null}
              {active === "delivery" ? (
                <DeliveryStep
                  documentsHref={documentsHref}
                  isAdmin={user.role === "admin"}
                  templateReady={templateReady.delivery}
                  transaction={transaction}
                />
              ) : null}
              {active === "handover" ? (
                <HandoverStep
                  documentsHref={documentsHref}
                  isAdmin={user.role === "admin"}
                  templateReady={templateReady.handover}
                  transaction={transaction}
                />
              ) : null}
            </fieldset>
          </section>
        </main>
        <aside className="transaction-flow-aside">
          <p className="eyebrow">Informasi pekerjaan</p>
          <h2>{transaction.header.customerName}</h2>
          <dl>
            <div>
              <dt>Penanggung jawab</dt>
              <dd>{transaction.header.ownerName ?? "Belum ditentukan"}</dd>
            </div>
            <div>
              <dt>Target</dt>
              <dd>{date(transaction.header.dueAt)}</dd>
            </div>
            <div>
              <dt>Pembayaran terverifikasi</dt>
              <dd>{workspaceMoney(transaction.workspace.received)}</dd>
            </div>
          </dl>
          <details>
            <summary>Semua dokumen ({transaction.documents.length})</summary>
            <DocumentList
              canRetry={user.role === "admin" && !readonly}
              documents={transaction.documents}
              transaction={transaction}
            />
          </details>
          <details>
            <summary>Riwayat kegiatan ({transaction.activity.length})</summary>
            {transaction.activity.length ? (
              <ol>
                {transaction.activity.map((activity) => (
                  <li key={activity.id}>
                    <strong>{activity.actorName ?? "Sistem"}</strong>
                    <span>{activityLabels[activity.action] ?? "Perubahan pekerjaan dicatat"}</span>
                    <time>{dateTime(activity.createdAt)} WIB</time>
                  </li>
                ))}
              </ol>
            ) : (
              <p>Belum ada kegiatan lain.</p>
            )}
          </details>
        </aside>
      </div>
    </section>
  );
}
