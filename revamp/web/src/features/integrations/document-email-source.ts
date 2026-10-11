import "server-only";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/lib/database/client";
import {
  businessTransactions,
  customers,
  transactionDocuments,
  transactionInvoices,
  transactionLines,
  shipments,
} from "@/lib/database/schema";
import { assertDocGenEmailAllowed, docGenDummyMode } from "@/features/operations/docgen-policy";
import { privateFilePath } from "@/features/operations/private-storage";
import { quotationIsCurrent } from "@/features/operations/transaction-workspace";
import { invoiceCountsAsIssued } from "@/features/operations/transaction-status";
import { canonicalJson } from "@/features/operations/quote-math";
import { moneyCents } from "@/features/operations/invoice-math";
import type { EmailRecipients } from "./email-workspace-model";

export type DocumentEmailSource = { transactionId: string; documentId: string; version: number; checksum: string };
type Reader = Pick<NonNullable<ReturnType<typeof getDatabase>>, "select">;

// Called before preview and again while holding the transaction lock before claiming a send.
export async function validateDocumentEmailSource(
  database: Reader,
  source: DocumentEmailSource,
  recipients: EmailRecipients,
  subject: string,
) {
  const [record] = await database
    .select({ document: transactionDocuments, header: businessTransactions, customer: customers })
    .from(transactionDocuments)
    .innerJoin(businessTransactions, eq(businessTransactions.id, transactionDocuments.transactionId))
    .innerJoin(customers, eq(customers.id, businessTransactions.customerId))
    .where(
      and(eq(transactionDocuments.id, source.documentId), eq(transactionDocuments.transactionId, source.transactionId)),
    )
    .limit(1);
  const document = record?.document;
  if (
    !record ||
    !document ||
    document.version !== source.version ||
    document.checksum !== source.checksum ||
    !source.checksum ||
    document.status !== "ready" ||
    document.direction !== "outbound" ||
    !document.storagePath ||
    document.sentMessageId ||
    (document.payload as { sendState?: string } | null)?.sendState ||
    record.header.cancelledAt
  ) {
    throw new Error("Dokumen berubah atau sudah diproses. Periksa versi aktif dan status email di Transaksi.");
  }
  if (!["quotation", "invoice_dp", "invoice_final", "delivery_note"].includes(document.type))
    throw new Error("STB dan kontrak historis tidak boleh dikirim melalui email.");
  if (
    recipients.to.length !== 1 ||
    recipients.cc.length ||
    recipients.bcc.length ||
    !record.customer.email ||
    recipients.to[0].toLowerCase() !== record.customer.email.trim().toLowerCase()
  )
    throw new Error(
      "Penerima dokumen harus sama dengan email pelanggan; CC/BCC tidak tersedia untuk dokumen transaksi.",
    );
  if ((document.payload as { renderSource?: string } | null)?.renderSource === "local_qa") {
    throw new Error("PDF pratinjau QA lokal tidak boleh dikirim melalui email.");
  }
  const dummy = (document.payload as { isDummy?: boolean } | null)?.isDummy === true;
  assertDocGenEmailAllowed(record.header.dataClass, recipients.to[0], dummy);
  if ((docGenDummyMode() || dummy) && !subject.startsWith("[UJI]"))
    throw new Error("Subjek dokumen contoh harus diawali [UJI].");
  if (document.type === "quotation") {
    const lines = await database
      .select()
      .from(transactionLines)
      .where(eq(transactionLines.transactionId, source.transactionId))
      .orderBy(transactionLines.sortOrder);
    const documents = await database
      .select()
      .from(transactionDocuments)
      .where(
        and(eq(transactionDocuments.transactionId, source.transactionId), eq(transactionDocuments.type, "quotation")),
      );
    const latest = documents.reduce((a, b) => (a.version > b.version ? a : b));
    if (
      latest.id !== document.id ||
      !quotationIsCurrent({
        header: { ...record.header, customerBillingAddress: record.customer.billingAddress },
        lines,
        documents,
      })
    )
      throw new Error("Rincian atau ketentuan penawaran berubah. Buat PDF versi terbaru sebelum mengirim.");
  }
  if (document.type.startsWith("invoice")) {
    const [invoice] = await database
      .select()
      .from(transactionInvoices)
      .where(
        and(
          eq(transactionInvoices.id, document.invoiceId ?? "00000000-0000-0000-0000-000000000000"),
          eq(transactionInvoices.transactionId, source.transactionId),
        ),
      )
      .limit(1);
    if (!invoice || !invoiceCountsAsIssued(invoice.status))
      throw new Error("Invoice belum terbit atau sudah dibatalkan.");
    const preview = (document.payload as { preview?: Record<string, unknown> } | null)?.preview;
    const saved = invoice.snapshot as Record<string, unknown> | null;
    if (
      !preview ||
      !saved ||
      document.documentNo !== invoice.invoiceNo ||
      typeof preview.amountDue !== "string" ||
      moneyCents(preview.amountDue) !== moneyCents(invoice.amount) ||
      !Object.entries(preview).every(([key, value]) => canonicalJson(saved[key]) === canonicalJson(value))
    )
      throw new Error("Snapshot invoice dan arsip PDF tidak cocok. Data perlu ditinjau, bukan dibuat ulang otomatis.");
  }
  if (document.type === "delivery_note") {
    const [shipment] = await database
      .select({ id: shipments.id })
      .from(shipments)
      .where(and(eq(shipments.transactionId, source.transactionId), eq(shipments.deliveryDocumentId, document.id)))
      .limit(1);
    if (!shipment) throw new Error("Surat jalan bukan versi aktif pengiriman.");
  }
  const path = privateFilePath(document.storagePath!);
  const info = await stat(path);
  if (!info.isFile() || info.size < 1 || info.size > 10 * 1024 * 1024)
    throw new Error("PDF tidak tersedia atau melebihi batas email 10 MB.");
  const bytes = await readFile(path);
  if (createHash("sha256").update(bytes).digest("hex") !== source.checksum)
    throw new Error("Checksum PDF tidak sesuai. Pengiriman dihentikan.");
  return {
    bytes,
    filename: basename(document.originalName || "dokumen.pdf")
      .replace(/[\r\n"\\\x00-\x1f]/g, "_")
      .slice(0, 180),
    documentNo: document.documentNo,
    type: document.type,
  };
}
