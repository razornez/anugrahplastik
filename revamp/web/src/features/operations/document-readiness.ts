import { eq } from "drizzle-orm";
import { getDatabase } from "@/lib/database/client";
import { quotationNumberCounters } from "@/lib/database/schema";
import { invoiceIssuerIsReady, getInvoiceIssuer } from "./invoice-settings";
import { docGenDummyMode, docGenTemplateId, localQaRendererEnabled } from "./docgen-policy";
import { resolveDocumentProviderTemplateId } from "./document-templates";
import { documentRevisionBlocker } from "./document-review";
import { jakartaYear, readQuotationLetter } from "./quotation-letter";
import { getTransactionDetail } from "./service";

export type DocumentBlocker = { code: string; message: string };
export type DocumentReadinessResult = { ready: boolean; blockers: DocumentBlocker[] };

export async function quotationDocumentReadiness(transactionId: string): Promise<DocumentReadinessResult> {
  const database = getDatabase();
  if (!database) return { ready: false, blockers: [{ code: "database", message: "Database belum terhubung." }] };
  const [transaction, issuer, templateId] = await Promise.all([
    getTransactionDetail(transactionId),
    getInvoiceIssuer(),
    resolveDocumentProviderTemplateId("quotation", docGenTemplateId("QUOTATION")),
  ]);
  if (!transaction) return { ready: false, blockers: [{ code: "transaction", message: "Transaksi tidak ditemukan." }] };
  const blockers: DocumentBlocker[] = [];
  if (!templateId) blockers.push({ code: "template", message: "Template Penawaran belum aktif." });
  if (!invoiceIssuerIsReady(issuer)) blockers.push({ code: "issuer", message: "Identitas penerbit belum aktif." });
  if (!localQaRendererEnabled() && !process.env.DOCGEN_API_KEY)
    blockers.push({ code: "renderer", message: "Koneksi renderer PDF belum tersedia." });
  if (!localQaRendererEnabled() && docGenDummyMode() && transaction.header.dataClass !== "test")
    blockers.push({ code: "mode", message: "Template dokumen resmi belum disetujui untuk transaksi production." });
  if (!transaction.header.quotationNo) {
    const [counter] = await database
      .select({ year: quotationNumberCounters.referenceYear })
      .from(quotationNumberCounters)
      .where(eq(quotationNumberCounters.referenceYear, jakartaYear(new Date())))
      .limit(1);
    if (!counter) blockers.push({ code: "number", message: "Nomor urut Penawaran tahun ini belum diatur." });
  }
  if (!transaction.lines.length) blockers.push({ code: "lines", message: "Rincian barang atau jasa belum disimpan." });
  if (!transaction.header.quoteLetter)
    blockers.push({ code: "letter", message: "Isi surat penawaran belum disimpan." });
  const letter = readQuotationLetter(
    transaction.header.quoteLetter,
    transaction.header.title,
    transaction.header.customerBillingAddress ?? "",
  );
  if (!letter.recipientAddress.trim()) blockers.push({ code: "customer", message: "Alamat penerima belum diisi." });
  if (letter.validUntil && new Date(`${letter.validUntil}T23:59:59+07:00`).getTime() < Date.now())
    blockers.push({ code: "validity", message: "Masa berlaku penawaran sudah lewat; simpan tanggal baru." });
  const savedAttachmentIds = new Set(
    transaction.documents
      .filter((document) => document.type === "quotation_attachment" && document.status === "received")
      .map((document) => document.id),
  );
  if (letter.attachmentIds.some((id) => !savedAttachmentIds.has(id)))
    blockers.push({ code: "attachments", message: "Lampiran penawaran berubah; periksa dan simpan ulang rinciannya." });
  const latest = transaction.documents
    .filter((document) => document.type === "quotation")
    .sort((left, right) => right.version - left.version)[0];
  if (documentRevisionBlocker(latest?.status))
    blockers.push({
      code: "review",
      message: "PDF penawaran terakhir belum selesai; periksa proses yang sama sebelum revisi.",
    });
  if (transaction.header.commercialStatus === "cancelled" || transaction.header.fulfilmentStatus === "completed")
    blockers.push({ code: "closed", message: "Transaksi sudah ditutup." });
  return { ready: blockers.length === 0, blockers };
}
