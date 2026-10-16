"use server";

import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import {
  auditLogs,
  businessTransactions,
  csEmails,
  customers,
  deliveryNumberCounters,
  handoverNumberCounters,
  invoiceIssuerSettings,
  invoiceNumberCounters,
  materials,
  productionBatches,
  shipmentLines,
  shipments,
  transactionDocuments,
  transactionFinancialEntries,
  transactionInvoices,
  transactionLines,
  quotationNumberCounters,
} from "@/lib/database/schema";
import { calculateQuote, centsText, type QuoteLineInput } from "./quote-math";
import { formatCustomerAddress, type TransactionCustomerSnapshot } from "./customer-profile";
import {
  formatQuotationNumber,
  jakartaYear,
  quotationLetterSchema,
  quotationRenderData,
  readQuotationLetter,
} from "./quotation-letter";
import {
  calculateDeliveryInvoice,
  calculateDpInvoice,
  formatInvoiceNumber,
  moneyCents,
  quantityMillis,
} from "./invoice-math";
import { invoiceRenderData } from "./invoice-render-data";
import { invoiceIssuerIsReady } from "./invoice-settings";
import { readInvoiceLogo } from "./invoice-logo";
import { shipmentAvailableByLine } from "./shipment-stock";
import { appendQuotationAttachments, type QuotationAttachment } from "./quotation-attachments";
import { assertDocGenTestTransaction, renderDocGenPdf } from "./docgen";
import {
  docGenDummyMode,
  docGenPayload,
  docGenTemplateId,
  localQaRendererEnabled,
  officialDocumentFlowEnabled,
} from "./docgen-policy";
import { resolveDocumentProviderTemplateId } from "./document-templates";
import { classifyDocumentFailure, documentRecoveryBlocker, documentRevisionBlocker } from "./document-review";
import { quotationDocumentReadiness } from "./document-readiness";
import {
  deliveryDetailsSchema,
  deliveryRenderData,
  formatDeliveryNumber,
  readDeliveryDetails,
  readShipmentLogistics,
  shipmentLogisticsSchema,
  validateShipmentLogistics,
} from "./delivery-note";
import {
  committedAmount,
  formatHandoverNumber,
  handoverDetailsSchema,
  handoverRenderData,
  validateHandoverDetails,
} from "./handover-note";

function customerSnapshotView(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as TransactionCustomerSnapshot;
  const primary = snapshot.contacts?.find((contact) => contact.isPrimary) ?? snapshot.contacts?.[0];
  const delivery =
    snapshot.deliveryAddresses?.find((address) => address.id === snapshot.selectedDeliveryAddressId) ??
    snapshot.deliveryAddresses?.find((address) => address.isDefault);
  return {
    name: snapshot.name,
    billingAddress: formatCustomerAddress(snapshot.billingAddress),
    deliveryAddress: formatCustomerAddress(delivery),
    taxId: snapshot.taxId,
    email: primary?.email ?? "",
  };
}

const lineSchema = z.object({
  description: z.string().trim().min(2).max(500),
  materialLabel: z.string().trim().max(160).optional().default(""),
  mouldingLabel: z.string().trim().max(160).optional().default(""),
  quantity: z.string().regex(/^\d{1,7}(?:\.\d{1,3})?$/),
  unit: z.string().trim().min(1).max(16),
  unitPrice: z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/),
  taxRate: z.string().regex(/^\d{1,3}(?:\.\d{1,2})?$/),
  taxMethod: z.enum(["none", "standard", "dpp_11_12"]),
  discountKind: z.enum(["none", "amount", "percent"]),
  discountValue: z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/),
});

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

class ShipmentInlineFieldError extends Error {
  constructor(
    message: string,
    readonly fieldName: string,
  ) {
    super(message);
  }
}

function validateShipmentSnapshotSources(
  details: { recipientContactId: string; deliveryAddressId: string },
  value: unknown,
) {
  if (!details.recipientContactId && !details.deliveryAddressId) return;
  const snapshot = value && typeof value === "object" ? (value as TransactionCustomerSnapshot) : null;
  const contacts = snapshot?.contacts ?? [];
  const addresses = snapshot?.deliveryAddresses ?? [];
  if (
    details.recipientContactId &&
    !contacts.some((contact, index) => (contact.id ?? `snapshot-${index}`) === details.recipientContactId)
  ) {
    throw new ShipmentInlineFieldError(
      "PIC pilihan tidak lagi tersedia pada data transaksi. Pilih ulang penerima.",
      "recipient",
    );
  }
  if (
    details.deliveryAddressId &&
    !addresses.some((address, index) => (address.id ?? `snapshot-${index}`) === details.deliveryAddressId)
  ) {
    throw new ShipmentInlineFieldError(
      "Alamat pilihan tidak lagi tersedia pada data transaksi. Pilih ulang alamat.",
      "address",
    );
  }
}

const shipmentItemSchema = z.object({
  lineId: z.string().uuid(),
  quantity: z.string().regex(/^\d{1,7}(?:\.\d{1,3})?$/),
  logistics: shipmentLogisticsSchema,
});

function parseShipmentForm(formData: FormData) {
  const items = z
    .array(shipmentItemSchema)
    .min(1)
    .max(30)
    .parse(JSON.parse(z.string().max(30_000).parse(field(formData, "items"))))
    .filter((item) => Number(item.quantity) > 0);
  if (!items.length || new Set(items.map((item) => item.lineId)).size !== items.length) {
    throw new Error("Pilih jumlah barang yang akan dikirim tanpa duplikasi item.");
  }
  const recipient = z.string().trim().min(2).max(160).parse(field(formData, "recipient"));
  const address = z.string().trim().min(5).max(1000).parse(field(formData, "address"));
  const details = deliveryDetailsSchema.parse({
    recipientContactId: field(formData, "recipientContactId"),
    deliveryAddressId: field(formData, "deliveryAddressId"),
    deliveryOrderNo: field(formData, "deliveryOrderNo"),
    senderName: field(formData, "senderName"),
    driverName: field(formData, "driverName"),
    receiverSignatureName: field(formData, "receiverSignatureName"),
    vehiclePlate: field(formData, "vehiclePlate"),
    note: field(formData, "note"),
  });
  const localTime = field(formData, "plannedShipAt");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localTime)) {
    throw new Error("Isi tanggal dan jam rencana pengiriman dalam WIB.");
  }
  const plannedShipAt = new Date(`${localTime}:00+07:00`);
  if (Number.isNaN(plannedShipAt.getTime())) throw new Error("Tanggal dan jam pengiriman tidak valid.");
  return { items, recipient, address, details, plannedShipAt };
}

async function operationsUser() {
  const user = await getSession();
  if (!user || (user.role !== "admin" && user.role !== "sales")) throw new Error("Akses transaksi ditolak.");
  return user;
}

async function administrator() {
  const user = await getSession();
  if (!user || user.role !== "admin") throw new Error("Tindakan ini memerlukan administrator.");
  return user;
}

function transactionPath(id: string, step: string, notice?: string) {
  const query = new URLSearchParams({ step });
  if (notice) query.set("notice", notice);
  return `/admin/transactions/${id}?${query.toString()}`;
}

async function markDocumentForReview(documentId: string, error: unknown) {
  const database = getDatabase();
  if (!database) return;
  const [document] = await database
    .select({ payload: transactionDocuments.payload })
    .from(transactionDocuments)
    .where(eq(transactionDocuments.id, documentId))
    .limit(1);
  const payload = document?.payload && typeof document.payload === "object" ? document.payload : {};
  await database
    .update(transactionDocuments)
    .set({
      status: "needs_review",
      payload: { ...payload, generationReview: classifyDocumentFailure(error, localQaRendererEnabled()) },
    })
    .where(eq(transactionDocuments.id, documentId));
}

export async function saveQuoteDraft(formData: FormData) {
  const user = await operationsUser();
  const transactionId = z.string().uuid().parse(field(formData, "transactionId"));
  const targetDate = field(formData, "targetDate");
  const raw = z.string().max(20_000).parse(field(formData, "lines"));
  const parsedLines = z.array(lineSchema).min(1).max(30).parse(JSON.parse(raw)) as QuoteLineInput[];
  const letter = quotationLetterSchema.parse(JSON.parse(z.string().max(10_000).parse(field(formData, "letter"))));
  const quote = calculateQuote(parsedLines);
  const dueAt = targetDate
    ? new Date(
        `${z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .parse(targetDate)}T12:00:00+07:00`,
      )
    : null;
  if (dueAt && Number.isNaN(dueAt.valueOf())) throw new Error("Tanggal target tidak valid.");
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  await database.transaction(async (tx) => {
    await tx.execute(sql`select id from business_transactions where id = ${transactionId} for update`);
    const [transaction] = await tx
      .select({ id: businessTransactions.id, fulfilmentStatus: businessTransactions.fulfilmentStatus })
      .from(businessTransactions)
      .where(and(eq(businessTransactions.id, transactionId), sql`${businessTransactions.cancelledAt} is null`));
    if (!transaction || transaction.fulfilmentStatus === "completed")
      throw new Error("Transaksi tidak ditemukan, dibatalkan, atau sudah ditutup.");
    const [shipped] = await tx
      .select({ id: shipmentLines.id })
      .from(shipmentLines)
      .innerJoin(transactionLines, eq(transactionLines.id, shipmentLines.transactionLineId))
      .where(eq(transactionLines.transactionId, transactionId))
      .limit(1);
    if (shipped) throw new Error("Rincian tidak dapat diganti setelah barang dikirim.");
    const [existingInvoice] = await tx
      .select({ id: transactionInvoices.id })
      .from(transactionInvoices)
      .where(eq(transactionInvoices.transactionId, transactionId))
      .limit(1);
    if (existingInvoice) {
      throw new Error(
        "Rincian penawaran tidak dapat diubah setelah invoice dibuat. Arsip tagihan harus tetap cocok dengan item asalnya.",
      );
    }
    if (user.role !== "admin") {
      const oldLines = await tx
        .select({
          description: transactionLines.description,
          quantity: transactionLines.quantity,
          unit: transactionLines.unit,
          unitPrice: transactionLines.unitPrice,
          discountKind: transactionLines.discountKind,
          discountValue: transactionLines.discountValue,
        })
        .from(transactionLines)
        .where(eq(transactionLines.transactionId, transactionId))
        .orderBy(transactionLines.sortOrder);
      const hasDiscountChange =
        parsedLines.some((line, index) => {
          const old = oldLines[index];
          if (!old) return line.discountKind !== "none" || line.discountValue !== "0";
          if (line.discountKind !== old.discountKind || Number(line.discountValue) !== Number(old.discountValue))
            return true;
          return (
            old.discountKind !== "none" &&
            (line.description !== old.description ||
              Number(line.quantity) !== Number(old.quantity) ||
              line.unit !== old.unit ||
              Number(line.unitPrice) !== Number(old.unitPrice))
          );
        }) || oldLines.some((line, index) => index >= parsedLines.length && line.discountKind !== "none");
      if (hasDiscountChange) throw new Error("Diskon dan item yang memiliki diskon hanya dapat diubah administrator.");
    }
    const selectedAttachments = letter.attachmentIds.length
      ? await tx
          .select({ id: transactionDocuments.id })
          .from(transactionDocuments)
          .where(
            and(
              eq(transactionDocuments.transactionId, transactionId),
              eq(transactionDocuments.type, "quotation_attachment"),
              eq(transactionDocuments.status, "received"),
              inArray(transactionDocuments.id, letter.attachmentIds),
            ),
          )
      : [];
    if (
      selectedAttachments.length !== new Set(letter.attachmentIds).size ||
      selectedAttachments.length !== letter.attachmentIds.length
    )
      throw new Error("Lampiran penawaran tidak ditemukan pada transaksi ini.");
    await tx.delete(transactionLines).where(eq(transactionLines.transactionId, transactionId));
    await tx.insert(transactionLines).values(
      quote.lines.map((line, index) => ({
        transactionId,
        description: line.description,
        materialLabel: line.materialLabel ?? "",
        mouldingLabel: line.mouldingLabel ?? "",
        quantity: line.quantity,
        unit: line.unit,
        unitPrice: line.unitPrice,
        taxRate: line.taxRate,
        taxMethod: line.taxMethod,
        discountKind: line.discountKind,
        discountValue: line.discountValue,
        sortOrder: index,
      })),
    );
    await tx
      .update(businessTransactions)
      .set({ dueAt, quoteLetter: letter, updatedAt: new Date() })
      .where(eq(businessTransactions.id, transactionId));
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "transaction.quotation_draft_saved",
      entityType: "transaction",
      entityId: transactionId,
      metadata: { itemCount: quote.lines.length, total: quote.total, attachmentCount: letter.attachmentIds.length },
    });
  });
  revalidatePath(`/admin/transactions/${transactionId}`);
  redirect(transactionPath(transactionId, "quote", "draft-saved"));
}

export async function saveProductionTargetDate(formData: FormData) {
  const user = await operationsUser();
  const transactionId = z.string().uuid().safeParse(field(formData, "transactionId"));
  if (!transactionId.success) redirect("/admin/transactions");

  const rawDate = field(formData, "targetDate");
  const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? new Date(`${rawDate}T12:00:00+07:00`) : null;
  if (!targetDate || Number.isNaN(targetDate.valueOf()) || targetDate.toISOString().slice(0, 10) !== rawDate) {
    redirect(transactionPath(transactionId.data, "production", "target-invalid"));
  }

  const database = getDatabase();
  if (!database) redirect(transactionPath(transactionId.data, "production", "target-unavailable"));
  const updated = await database.transaction(async (tx) => {
    const [record] = await tx
      .update(businessTransactions)
      .set({ dueAt: targetDate, updatedAt: new Date() })
      .where(
        and(
          eq(businessTransactions.id, transactionId.data),
          isNull(businessTransactions.dueAt),
          isNull(businessTransactions.cancelledAt),
          ne(businessTransactions.fulfilmentStatus, "completed"),
        ),
      )
      .returning({ id: businessTransactions.id });
    if (!record) return false;
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "transaction.production_target_set",
      entityType: "transaction",
      entityId: transactionId.data,
      metadata: { targetDate: rawDate },
    });
    return true;
  });
  revalidatePath(`/admin/transactions/${transactionId.data}`);
  redirect(transactionPath(transactionId.data, "production", updated ? "target-saved" : "target-unavailable"));
}

export async function generateQuotation(formData: FormData) {
  const user = await operationsUser();
  const transactionId = z.string().uuid().parse(field(formData, "transactionId"));
  const readiness = await quotationDocumentReadiness(transactionId);
  if (!readiness.ready) redirect(transactionPath(transactionId, "quote", "quote-not-ready"));
  const database = getDatabase();
  const templateId = await resolveDocumentProviderTemplateId("quotation", docGenTemplateId("QUOTATION"));
  if (!database) throw new Error("Database belum terhubung.");
  if (!templateId) redirect(transactionPath(transactionId, "quote", "docgen-unavailable"));
  await assertDocGenTestTransaction(transactionId);
  const [issuerSettings] = await database.select().from(invoiceIssuerSettings).limit(1);
  if (officialDocumentFlowEnabled() && !invoiceIssuerIsReady(issuerSettings ?? null)) {
    throw new Error("Identitas penerbit belum disetujui administrator.");
  }

  const prepared = await database.transaction(async (tx) => {
    await tx.execute(sql`select id from business_transactions where id = ${transactionId} for update`);
    const [rawHeader] = await tx
      .select({
        id: businessTransactions.id,
        referenceNo: businessTransactions.referenceNo,
        quotationNo: businessTransactions.quotationNo,
        quoteLetter: businessTransactions.quoteLetter,
        title: businessTransactions.title,
        dueAt: businessTransactions.dueAt,
        cancelledAt: businessTransactions.cancelledAt,
        fulfilmentStatus: businessTransactions.fulfilmentStatus,
        dataClass: businessTransactions.dataClass,
        customerSnapshot: businessTransactions.customerSnapshot,
        customerName: customers.displayName,
        customerAddress: customers.billingAddress,
        customerTaxId: customers.taxId,
        customerEmail: customers.email,
      })
      .from(businessTransactions)
      .innerJoin(customers, eq(customers.id, businessTransactions.customerId))
      .where(eq(businessTransactions.id, transactionId));
    const snapshot = customerSnapshotView(rawHeader?.customerSnapshot);
    const header = rawHeader
      ? {
          ...rawHeader,
          customerName: snapshot?.name || rawHeader.customerName,
          customerAddress: snapshot?.billingAddress || rawHeader.customerAddress,
          customerTaxId: snapshot?.taxId || rawHeader.customerTaxId,
          customerEmail: snapshot?.email || rawHeader.customerEmail,
        }
      : null;
    if (!header || header.cancelledAt || header.fulfilmentStatus === "completed")
      throw new Error("Transaksi tidak tersedia atau sudah ditutup.");
    const lines = await tx
      .select({
        description: transactionLines.description,
        materialLabel: transactionLines.materialLabel,
        mouldingLabel: transactionLines.mouldingLabel,
        quantity: transactionLines.quantity,
        unit: transactionLines.unit,
        unitPrice: transactionLines.unitPrice,
        taxRate: transactionLines.taxRate,
        taxMethod: transactionLines.taxMethod,
        discountKind: transactionLines.discountKind,
        discountValue: transactionLines.discountValue,
      })
      .from(transactionLines)
      .where(eq(transactionLines.transactionId, transactionId))
      .orderBy(transactionLines.sortOrder);
    const quote = calculateQuote(lines);
    if (!header.quoteLetter) throw new Error("Simpan isi surat dan rincian penawaran sebelum membuat PDF.");
    const letter = readQuotationLetter(header.quoteLetter, header.title, header.customerAddress ?? "");
    if (officialDocumentFlowEnabled() && !letter.recipientAddress)
      throw new Error("Alamat penerima harus dilengkapi sebelum membuat penawaran resmi.");
    if (letter.validUntil && new Date(`${letter.validUntil}T23:59:59+07:00`).getTime() < Date.now())
      throw new Error("Masa berlaku penawaran sudah lewat. Simpan tanggal baru sebelum membuat PDF.");
    const allAttachments = letter.attachmentIds.length
      ? await tx
          .select()
          .from(transactionDocuments)
          .where(
            and(
              eq(transactionDocuments.transactionId, transactionId),
              eq(transactionDocuments.type, "quotation_attachment"),
              eq(transactionDocuments.status, "received"),
              inArray(transactionDocuments.id, letter.attachmentIds),
            ),
          )
      : [];
    if (allAttachments.length !== letter.attachmentIds.length)
      throw new Error("Lampiran penawaran berubah. Periksa ulang sebelum membuat PDF.");
    const attachments: QuotationAttachment[] = letter.attachmentIds.map((id) => {
      const document = allAttachments.find((item) => item.id === id);
      if (!document) throw new Error("Lampiran penawaran tidak ditemukan.");
      const info = document.payload as { category?: string; caption?: string } | null;
      return {
        id,
        originalName: document.originalName,
        storagePath: document.storagePath,
        checksum: document.checksum,
        category: info?.category ?? "Lampiran",
        caption: info?.caption ?? document.originalName ?? "Lampiran",
      };
    });
    const [latest] = await tx
      .select({ version: transactionDocuments.version, status: transactionDocuments.status })
      .from(transactionDocuments)
      .where(and(eq(transactionDocuments.transactionId, transactionId), eq(transactionDocuments.type, "quotation")))
      .orderBy(desc(transactionDocuments.version))
      .limit(1);
    if (documentRevisionBlocker(latest?.status)) {
      return null;
    }
    const version = (latest?.version ?? 0) + 1;
    let quotationNo = header.quotationNo;
    if (!quotationNo && officialDocumentFlowEnabled()) {
      const issuedAt = new Date();
      const year = jakartaYear(issuedAt);
      const [counter] = await tx
        .update(quotationNumberCounters)
        .set({ lastValue: sql`${quotationNumberCounters.lastValue} + 1`, updatedAt: issuedAt })
        .where(eq(quotationNumberCounters.referenceYear, year))
        .returning({ lastValue: quotationNumberCounters.lastValue });
      if (!counter) throw new Error(`Nomor penawaran tahun ${year} belum diinisialisasi administrator.`);
      quotationNo = formatQuotationNumber(counter.lastValue, issuedAt);
      await tx
        .update(businessTransactions)
        .set({ quotationNo, updatedAt: issuedAt })
        .where(eq(businessTransactions.id, transactionId));
    }
    const documentNo = quotationNo ?? `UJI-${header.referenceNo}`;
    const operationKey = randomUUID();
    const [document] = await tx
      .insert(transactionDocuments)
      .values({
        transactionId,
        type: "quotation",
        direction: "outbound",
        documentNo,
        version,
        status: "generating",
        templateId,
        operationKey,
        payload: docGenPayload({ header, quote, letter, attachments }),
        originalName: `penawaran-${header.referenceNo}-v${version}.pdf`,
        createdBy: user.id,
      })
      .returning({ id: transactionDocuments.id });
    if (!document) throw new Error("Penawaran belum dapat disiapkan.");
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "transaction.quotation_generation_started",
      entityType: "transaction",
      entityId: transactionId,
      metadata: { documentId: document.id, version },
    });
    return { header, quote, letter, attachments, documentNo, documentId: document.id, version, operationKey };
  });

  if (!prepared) {
    revalidatePath(`/admin/transactions/${transactionId}`);
    redirect(transactionPath(transactionId, "quote", "pdf-pending-review"));
  }

  const { header, quote, letter, attachments, documentNo, documentId, version, operationKey } = prepared;
  try {
    const approvedIssuer = invoiceIssuerIsReady(issuerSettings ?? null) ? issuerSettings : null;
    const logoDataUri = approvedIssuer?.logoPath
      ? await readInvoiceLogo(approvedIssuer.logoPath)
      : await readInvoiceLogo("/brand/quotation-logo.png");
    const renderData = quotationRenderData({
      number: documentNo,
      version,
      issuedAt: new Date(),
      transactionNo: header.referenceNo,
      customerName: header.customerName,
      letter,
      lines: quote.lines,
      attachments: attachments.map((item) => ({
        id: item.id,
        name: item.caption,
        category: item.category,
      })),
      issuer: {
        legalName: approvedIssuer?.legalName || "CV. ANUGRAHPLASTIK MANDIRI BANDUNG",
        address: approvedIssuer?.address || "Perum Lebak Wangi Asri Blok A2 No.16, Bojong Pulus, Banjaran, Bandung",
        phone: approvedIssuer?.phone || "081 22 33 95 87",
        email: approvedIssuer?.email || "cs@anugrahplastik.com",
        website: approvedIssuer?.website || "www.anugrahplastik.com",
        signerName: approvedIssuer?.signerName || "Nirmala",
        signerTitle: approvedIssuer?.signerTitle || "Hormat kami",
        logoDataUri,
      },
    });
    await database
      .update(transactionDocuments)
      .set({ payload: docGenPayload({ header, quote, letter, attachments, renderData }) })
      .where(eq(transactionDocuments.id, documentId));
    const pdf = await renderDocGenPdf({
      templateId,
      operationKey,
      transactionId,
      documentId,
      filename: `penawaran-${header.referenceNo}-v${version}.pdf`,
      data: docGenPayload(renderData),
      postProcess: (pdf) => appendQuotationAttachments(pdf, attachments, docGenDummyMode()),
    });
    await database.transaction(async (tx) => {
      await tx
        .update(transactionDocuments)
        .set({ ...pdf, status: "ready" })
        .where(eq(transactionDocuments.id, documentId));
      await tx.insert(auditLogs).values({
        actorId: user.id,
        action: "transaction.quotation_ready",
        entityType: "transaction",
        entityId: transactionId,
        metadata: { documentId, version },
      });
    });
  } catch (error) {
    await markDocumentForReview(documentId, error);
    revalidatePath(`/admin/transactions/${transactionId}`);
    redirect(transactionPath(transactionId, "quote", "pdf-check"));
  }
  revalidatePath(`/admin/transactions/${transactionId}`);
  redirect(transactionPath(transactionId, "quote", "pdf-ready"));
}

export async function createTransactionInvoice(formData: FormData) {
  const user = await administrator();
  const input = z
    .object({
      transactionId: z.string().uuid(),
      kind: z.enum(["dp", "final"]),
      amount: z
        .string()
        .regex(/^\d{1,12}(?:\.\d{1,2})?$/)
        .optional(),
      shipmentId: z.string().uuid().optional(),
      dpApplied: z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      paymentTerms: z.string().trim().min(8).max(800),
      taxConfirmed: z.literal("yes"),
    })
    .parse({
      transactionId: field(formData, "transactionId"),
      kind: field(formData, "kind"),
      amount: field(formData, "amount") || undefined,
      shipmentId: field(formData, "shipmentId") || undefined,
      dpApplied: field(formData, "dpApplied") || "0",
      dueDate: field(formData, "dueDate"),
      paymentTerms: field(formData, "paymentTerms"),
      taxConfirmed: field(formData, "taxConfirmed"),
    });
  const templateId = await resolveDocumentProviderTemplateId("invoice", docGenTemplateId("INVOICE"));
  if (!templateId) {
    redirect(transactionPath(input.transactionId, "payment", "invoice-template-unavailable"));
  }
  const dueAt = new Date(`${input.dueDate}T12:00:00+07:00`);
  if (Number.isNaN(dueAt.valueOf())) throw new Error("Tanggal jatuh tempo tidak valid.");
  if (input.kind === "dp" && !input.amount) throw new Error("Isi jumlah uang muka.");
  if (input.kind === "final" && !input.shipmentId) throw new Error("Pilih pengiriman yang akan ditagih.");
  if (input.kind === "dp" && Number(input.dpApplied) > 0)
    throw new Error("DP tidak dapat diterapkan pada invoice DP sendiri.");
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  await assertDocGenTestTransaction(input.transactionId);
  const [issuer] = await database.select().from(invoiceIssuerSettings).where(eq(invoiceIssuerSettings.id, 1));
  if (officialDocumentFlowEnabled() && !invoiceIssuerIsReady(issuer ?? null)) {
    throw new Error("Identitas, rekening, logo, dan penanda tangan invoice belum disetujui administrator.");
  }
  const logoDataUrl = issuer?.logoPath && issuer.approvedAt ? await readInvoiceLogo(issuer.logoPath) : undefined;
  const prepared = await database.transaction(async (tx) => {
    await tx.execute(sql`select id from business_transactions where id = ${input.transactionId} for update`);
    const [rawHeader] = await tx
      .select({
        id: businessTransactions.id,
        referenceNo: businessTransactions.referenceNo,
        title: businessTransactions.title,
        cancelledAt: businessTransactions.cancelledAt,
        fulfilmentStatus: businessTransactions.fulfilmentStatus,
        customerSnapshot: businessTransactions.customerSnapshot,
        customerName: customers.displayName,
        customerAddress: customers.billingAddress,
        customerTaxId: customers.taxId,
        dataClass: businessTransactions.dataClass,
      })
      .from(businessTransactions)
      .innerJoin(customers, eq(customers.id, businessTransactions.customerId))
      .where(eq(businessTransactions.id, input.transactionId));
    const snapshot = customerSnapshotView(rawHeader?.customerSnapshot);
    const header = rawHeader
      ? {
          ...rawHeader,
          customerName: snapshot?.name || rawHeader.customerName,
          customerAddress: snapshot?.billingAddress || rawHeader.customerAddress,
          customerTaxId: snapshot?.taxId || rawHeader.customerTaxId,
        }
      : null;
    if (!header || header.cancelledAt || header.fulfilmentStatus === "completed")
      throw new Error("Transaksi tidak tersedia atau sudah ditutup.");
    if (officialDocumentFlowEnabled() && !header.customerAddress?.trim())
      throw new Error("Alamat penagihan pelanggan harus dilengkapi sebelum membuat invoice.");
    const [po] = await tx
      .select({ id: transactionDocuments.id, documentNo: transactionDocuments.documentNo })
      .from(transactionDocuments)
      .where(
        and(
          eq(transactionDocuments.transactionId, input.transactionId),
          eq(transactionDocuments.type, "purchase_order"),
        ),
      )
      .orderBy(desc(transactionDocuments.createdAt))
      .limit(1);
    if (!po) throw new Error("Simpan PO pelanggan sebelum membuat invoice.");
    if (!po.documentNo && officialDocumentFlowEnabled())
      throw new Error("Nomor PO pelanggan harus diisi sebelum invoice resmi.");
    const lines = await tx
      .select({
        id: transactionLines.id,
        description: transactionLines.description,
        quantity: transactionLines.quantity,
        unit: transactionLines.unit,
        unitPrice: transactionLines.unitPrice,
        taxRate: transactionLines.taxRate,
        taxMethod: transactionLines.taxMethod,
        discountKind: transactionLines.discountKind,
        discountValue: transactionLines.discountValue,
        materialName: materials.name,
      })
      .from(transactionLines)
      .leftJoin(materials, eq(materials.id, transactionLines.materialId))
      .where(eq(transactionLines.transactionId, input.transactionId))
      .orderBy(transactionLines.sortOrder);
    if (lines.some((line) => line.taxMethod === "legacy")) {
      throw new Error("Metode pajak lama belum ditinjau. Buka Penawaran dan pilih metode pajak setiap item.");
    }
    const quote = calculateQuote(lines);
    const existing = await tx
      .select()
      .from(transactionInvoices)
      .where(eq(transactionInvoices.transactionId, input.transactionId));
    if (existing.some((invoice) => invoice.status === "draft")) {
      throw new Error("Ada tagihan draf yang perlu diperiksa sebelum membuat tagihan baru.");
    }
    const issued = existing.filter((invoice) =>
      ["issued", "sent", "partial", "paid", "overdue"].includes(invoice.status),
    );
    if (issued.some((invoice) => !invoice.snapshot)) {
      throw new Error(
        "Ada invoice lama tanpa rincian pajak. Tinjau transaksi ini secara manual sebelum menerbitkan invoice baru.",
      );
    }
    const priorSnapshots = issued.map(
      (invoice) =>
        invoice.snapshot as {
          kind: "dp" | "final";
          lines?: { lineId: string; quantity: string }[];
          tax: string;
          dpp: string;
        },
    );
    const dpInvoices = issued.filter((invoice) => invoice.kind === "dp");
    const [verified] = await tx
      .select({
        total: sql<string>`coalesce(sum(${transactionFinancialEntries.amount}) filter (where ${transactionFinancialEntries.status} = 'verified' and ${transactionFinancialEntries.direction} = 'in' and ${transactionFinancialEntries.kind} = 'customer_payment'), 0)`,
      })
      .from(transactionFinancialEntries)
      .where(eq(transactionFinancialEntries.transactionId, input.transactionId));
    let shipmentItems: { lineId: string; quantity: string }[] = [];
    if (input.kind === "final") {
      const [shipment] = await tx
        .select({ id: shipments.id, status: shipments.status })
        .from(shipments)
        .where(and(eq(shipments.id, input.shipmentId!), eq(shipments.transactionId, input.transactionId)));
      if (!shipment || !["shipped", "received", "received_partial"].includes(shipment.status))
        throw new Error("Pengiriman belum dilakukan atau tidak tersedia.");
      if (issued.some((invoice) => invoice.shipmentId === shipment.id))
        throw new Error("Pengiriman ini sudah memiliki invoice.");
      shipmentItems = await tx
        .select({ lineId: shipmentLines.transactionLineId, quantity: shipmentLines.quantity })
        .from(shipmentLines)
        .where(eq(shipmentLines.shipmentId, shipment.id));
    }
    const sumMoney = (values: string[]) =>
      centsText(values.reduce((total, value) => total + moneyCents(value), BigInt(0)));
    const preview =
      input.kind === "dp"
        ? calculateDpInvoice(lines, input.amount!)
        : calculateDeliveryInvoice({
            lines,
            shipment: shipmentItems,
            previouslyBilled: priorSnapshots.flatMap((snapshot) =>
              snapshot.kind === "final" ? (snapshot.lines ?? []) : [],
            ),
            dpApplied: input.dpApplied,
            priorDpApplied: sumMoney(issued.map((invoice) => invoice.dpApplied)),
            dpIssued: sumMoney(dpInvoices.map((invoice) => invoice.amount)),
            dpTax: sumMoney(
              priorSnapshots.filter((snapshot) => snapshot.kind === "dp").map((snapshot) => snapshot.tax),
            ),
            dpDpp: sumMoney(
              priorSnapshots.filter((snapshot) => snapshot.kind === "dp").map((snapshot) => snapshot.dpp),
            ),
            verifiedPayments: verified?.total ?? "0",
          });
    const billed = issued.reduce((total, invoice) => total + moneyCents(invoice.amount), BigInt(0));
    if (billed + moneyCents(preview.amountDue) > moneyCents(quote.total)) {
      throw new Error("Jumlah invoice baru melebihi nilai order setelah diskon dan pajak.");
    }
    const issuedAt = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "numeric",
    }).formatToParts(issuedAt);
    const year = Number(parts.find((part) => part.type === "year")?.value);
    const month = Number(parts.find((part) => part.type === "month")?.value);
    let invoiceNo: string;
    if (header.dataClass === "test") {
      invoiceNo = `UJI-${header.referenceNo}-INV-${String(existing.length + 1).padStart(2, "0")}`;
    } else {
      const [counter] = await tx
        .update(invoiceNumberCounters)
        .set({ lastValue: sql`${invoiceNumberCounters.lastValue} + 1`, updatedAt: issuedAt })
        .where(eq(invoiceNumberCounters.referenceYear, year))
        .returning({ lastValue: invoiceNumberCounters.lastValue });
      if (!counter) throw new Error("Nomor invoice tahun ini belum diinisialisasi oleh administrator.");
      invoiceNo = formatInvoiceNumber(counter.lastValue, year, month);
    }
    const filename = `invoice-${invoiceNo.replaceAll("/", "-")}.pdf`;
    const renderData = invoiceRenderData({
      number: invoiceNo,
      date: issuedAt,
      dueAt,
      transactionNo: header.referenceNo,
      title: header.title,
      customerName: header.customerName,
      customerAddress: header.customerAddress ?? "",
      customerTaxId: header.customerTaxId ?? "",
      poNumber: po.documentNo ?? "",
      terms: input.paymentTerms,
      preview,
      issuer: issuer?.approvedAt ? issuer : null,
      logoDataUrl,
    });
    const [invoice] = await tx
      .insert(transactionInvoices)
      .values({
        transactionId: input.transactionId,
        invoiceNo,
        kind: input.kind,
        amount: preview.amountDue,
        dueAt,
        shipmentId: input.shipmentId ?? null,
        dpApplied: input.dpApplied,
        paymentTerms: input.paymentTerms,
        snapshot: {
          ...preview,
          poNumber: po.documentNo,
          customerName: header.customerName,
          customerAddress: header.customerAddress,
          customerTaxId: header.customerTaxId,
          issuer: issuer?.approvedAt ? issuer : null,
          taxConfirmedBy: user.id,
          taxConfirmedAt: issuedAt.toISOString(),
        },
      })
      .returning({ id: transactionInvoices.id });
    const operationKey = randomUUID();
    const [document] = await tx
      .insert(transactionDocuments)
      .values({
        transactionId: input.transactionId,
        invoiceId: invoice.id,
        type: input.kind === "dp" ? "invoice_dp" : "invoice_final",
        direction: "outbound",
        documentNo: invoiceNo,
        status: "generating",
        templateId,
        operationKey,
        payload: docGenPayload({ header, preview, renderData }),
        originalName: filename,
        createdBy: user.id,
      })
      .returning({ id: transactionDocuments.id });
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "transaction.invoice_generation_started",
      entityType: "transaction",
      entityId: input.transactionId,
      metadata: {
        invoiceId: invoice.id,
        documentId: document.id,
        amount: preview.amountDue,
        dpApplied: input.dpApplied,
        shipmentId: input.shipmentId ?? null,
        taxConfirmed: true,
      },
    });
    return {
      header,
      invoiceNo,
      filename,
      invoiceId: invoice.id,
      documentId: document.id,
      operationKey,
      renderData,
      amount: preview.amountDue,
    };
  });
  try {
    const pdf = await renderDocGenPdf({
      templateId,
      operationKey: prepared.operationKey,
      transactionId: input.transactionId,
      documentId: prepared.documentId,
      filename: prepared.filename,
      data: docGenPayload(prepared.renderData),
    });
    await database.transaction(async (tx) => {
      await tx
        .update(transactionDocuments)
        .set({ ...pdf, status: "ready" })
        .where(eq(transactionDocuments.id, prepared.documentId));
      await tx
        .update(transactionInvoices)
        .set({ status: "issued", issuedAt: new Date() })
        .where(eq(transactionInvoices.id, prepared.invoiceId));
      await tx
        .update(businessTransactions)
        .set({ paymentStatus: "awaiting_payment", commercialStatus: "invoice_issued", updatedAt: new Date() })
        .where(eq(businessTransactions.id, input.transactionId));
      await tx.insert(auditLogs).values({
        actorId: user.id,
        action: "transaction.invoice_issued",
        entityType: "transaction",
        entityId: input.transactionId,
        metadata: { invoiceId: prepared.invoiceId, documentId: prepared.documentId, amount: prepared.amount },
      });
    });
  } catch (error) {
    await markDocumentForReview(prepared.documentId, error);
    revalidatePath(`/admin/transactions/${input.transactionId}`);
    redirect(transactionPath(input.transactionId, "payment", "invoice-check"));
  }
  revalidatePath(`/admin/transactions/${input.transactionId}`);
  redirect(transactionPath(input.transactionId, "payment", "invoice-ready"));
}

export async function linkTransactionEmail(formData: FormData) {
  const user = await operationsUser();
  const transactionId = z.string().uuid().parse(field(formData, "transactionId"));
  const emailId = z.string().uuid().parse(field(formData, "emailId"));
  const containsPo = field(formData, "containsPo") === "yes";
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  await database.transaction(async (tx) => {
    const [email] = await tx
      .select({ id: csEmails.id, linkedTransactionId: csEmails.linkedTransactionId, subject: csEmails.subject })
      .from(csEmails)
      .where(and(eq(csEmails.id, emailId), eq(csEmails.folder, "inbox")));
    if (!email || (email.linkedTransactionId && email.linkedTransactionId !== transactionId)) {
      throw new Error("Email tidak ditemukan atau sudah terhubung ke transaksi lain.");
    }
    await tx.update(csEmails).set({ linkedTransactionId: transactionId }).where(eq(csEmails.id, emailId));
    if (containsPo) {
      const [existing] = await tx
        .select({ id: transactionDocuments.id })
        .from(transactionDocuments)
        .where(
          and(
            eq(transactionDocuments.transactionId, transactionId),
            eq(transactionDocuments.type, "purchase_order"),
            sql`${transactionDocuments.payload}->>'emailId' = ${emailId}`,
          ),
        )
        .limit(1);
      if (!existing) {
        await tx.insert(transactionDocuments).values({
          transactionId,
          type: "purchase_order",
          direction: "inbound",
          status: "received",
          originalName: `PO melalui email: ${email.subject}`.slice(0, 255),
          payload: { emailId },
          createdBy: user.id,
        });
        await tx
          .update(businessTransactions)
          .set({ commercialStatus: "po_received", updatedAt: new Date() })
          .where(
            and(
              eq(businessTransactions.id, transactionId),
              eq(businessTransactions.commercialStatus, "quotation"),
              sql`${businessTransactions.fulfilmentStatus} <> 'completed'`,
            ),
          );
      }
    }
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "transaction.email_linked",
      entityType: "transaction",
      entityId: transactionId,
      metadata: { emailId, containsPo },
    });
  });
  revalidatePath(`/admin/transactions/${transactionId}`);
  redirect(transactionPath(transactionId, "order", "email-linked"));
}

export async function createProductionBatch(formData: FormData) {
  const user = await administrator();
  const input = z
    .object({
      transactionId: z.string().uuid(),
      kind: z.enum(["sample", "production"]),
      lineId: z.string().uuid().optional(),
      plannedQuantity: z.string().regex(/^\d{1,7}(?:\.\d{1,3})?$/),
    })
    .parse({
      transactionId: field(formData, "transactionId"),
      kind: field(formData, "kind"),
      lineId: field(formData, "lineId") || undefined,
      plannedQuantity: field(formData, "plannedQuantity"),
    });
  if (Number(input.plannedQuantity) <= 0) throw new Error("Jumlah harus lebih dari nol.");
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  await database.transaction(async (tx) => {
    await tx.execute(sql`select id from business_transactions where id = ${input.transactionId} for update`);
    const [header] = await tx
      .select({
        referenceNo: businessTransactions.referenceNo,
        fulfilmentStatus: businessTransactions.fulfilmentStatus,
      })
      .from(businessTransactions)
      .where(eq(businessTransactions.id, input.transactionId));
    if (!header || header.fulfilmentStatus === "not_released" || header.fulfilmentStatus === "completed") {
      throw new Error("Lepaskan pekerjaan ke produksi sebelum mencatat sampel atau batch.");
    }
    const lines = await tx
      .select({ id: transactionLines.id })
      .from(transactionLines)
      .where(eq(transactionLines.transactionId, input.transactionId));
    const lineId = input.lineId ?? (lines.length === 1 ? lines[0].id : undefined);
    if (!lineId || !lines.some((line) => line.id === lineId)) {
      throw new Error("Pilih barang atau jasa yang dikerjakan pada batch ini.");
    }
    const [count] = await tx
      .select({ total: sql<number>`count(*)` })
      .from(productionBatches)
      .where(eq(productionBatches.transactionId, input.transactionId));
    const batchNo = `${header.referenceNo}-${input.kind === "sample" ? "SPL" : "PRD"}-${String(Number(count?.total ?? 0) + 1).padStart(2, "0")}`;
    const [batch] = await tx
      .insert(productionBatches)
      .values({
        transactionId: input.transactionId,
        transactionLineId: lineId,
        batchNo,
        kind: input.kind,
        plannedQuantity: input.plannedQuantity,
      })
      .returning({ id: productionBatches.id });
    await tx
      .update(businessTransactions)
      .set({ fulfilmentStatus: input.kind === "sample" ? "sample" : "production", updatedAt: new Date() })
      .where(eq(businessTransactions.id, input.transactionId));
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "transaction.batch_created",
      entityType: "transaction",
      entityId: input.transactionId,
      metadata: { batchId: batch.id, kind: input.kind, plannedQuantity: input.plannedQuantity },
    });
  });
  revalidatePath(`/admin/transactions/${input.transactionId}`);
  redirect(transactionPath(input.transactionId, "production", "batch-created"));
}

export async function completeProductionBatch(formData: FormData) {
  const user = await administrator();
  const batchId = z.string().uuid().parse(field(formData, "batchId"));
  const completedQuantity = z
    .string()
    .regex(/^\d{1,7}(?:\.\d{1,3})?$/)
    .parse(field(formData, "completedQuantity"));
  if (Number(completedQuantity) <= 0) throw new Error("Jumlah selesai harus lebih dari nol.");
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  const result = await database.transaction(async (tx) => {
    const [batch] = await tx
      .update(productionBatches)
      .set({ status: "completed", completedQuantity, completedAt: new Date() })
      .where(and(eq(productionBatches.id, batchId), sql`${productionBatches.status} <> 'completed'`))
      .returning({
        transactionId: productionBatches.transactionId,
        plannedQuantity: productionBatches.plannedQuantity,
      });
    if (!batch) throw new Error("Batch sudah selesai atau tidak ditemukan.");
    if (batch.plannedQuantity && Number(completedQuantity) > Number(batch.plannedQuantity)) {
      throw new Error("Jumlah selesai melebihi rencana. Perbarui rencana terlebih dahulu.");
    }
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "transaction.batch_completed",
      entityType: "transaction",
      entityId: batch.transactionId,
      metadata: { batchId, completedQuantity },
    });
    return batch;
  });
  revalidatePath(`/admin/transactions/${result.transactionId}`);
  redirect(transactionPath(result.transactionId, "production", "batch-completed"));
}

export async function mapProductionBatchToLine(formData: FormData) {
  const user = await administrator();
  const batchId = z.string().uuid().parse(field(formData, "batchId"));
  const lineId = z.string().uuid().parse(field(formData, "lineId"));
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  const transactionId = await database.transaction(async (tx) => {
    const [batch] = await tx
      .select({ transactionId: productionBatches.transactionId, lineId: productionBatches.transactionLineId })
      .from(productionBatches)
      .where(eq(productionBatches.id, batchId));
    if (!batch || batch.lineId) throw new Error("Batch sudah ditautkan atau tidak ditemukan.");
    await tx.execute(sql`select id from business_transactions where id = ${batch.transactionId} for update`);
    const [line] = await tx
      .select({ id: transactionLines.id })
      .from(transactionLines)
      .where(and(eq(transactionLines.id, lineId), eq(transactionLines.transactionId, batch.transactionId)));
    if (!line) throw new Error("Item penawaran tidak termasuk transaksi ini.");
    const [updated] = await tx
      .update(productionBatches)
      .set({ transactionLineId: lineId })
      .where(and(eq(productionBatches.id, batchId), sql`${productionBatches.transactionLineId} is null`))
      .returning({ id: productionBatches.id });
    if (!updated) throw new Error("Batch baru saja ditautkan. Muat ulang halaman.");
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "transaction.batch_line_mapped",
      entityType: "transaction",
      entityId: batch.transactionId,
      metadata: { batchId, lineId },
    });
    return batch.transactionId;
  });
  revalidatePath(`/admin/transactions/${transactionId}`);
  redirect(transactionPath(transactionId, "production", "batch-mapped"));
}

export async function createShipment(formData: FormData) {
  const user = await operationsUser();
  const transactionId = z.string().uuid().parse(field(formData, "transactionId"));
  const operationKey = z
    .string()
    .uuid()
    .parse(field(formData, "operationKey") || randomUUID());
  const { items, recipient, address, details, plannedShipAt } = parseShipmentForm(formData);
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  await database.transaction(async (tx) => {
    await tx.execute(sql`select id from business_transactions where id = ${transactionId} for update`);
    const [duplicate] = await tx
      .select({ id: shipments.id, transactionId: shipments.transactionId })
      .from(shipments)
      .where(eq(shipments.operationKey, operationKey));
    if (duplicate) {
      if (duplicate.transactionId !== transactionId)
        throw new Error("Kunci pengiriman sudah digunakan transaksi lain.");
      return;
    }
    const [header] = await tx
      .select({
        referenceNo: businessTransactions.referenceNo,
        fulfilmentStatus: businessTransactions.fulfilmentStatus,
        customerSnapshot: businessTransactions.customerSnapshot,
      })
      .from(businessTransactions)
      .where(eq(businessTransactions.id, transactionId));
    if (!header || header.fulfilmentStatus === "not_released" || header.fulfilmentStatus === "completed") {
      throw new Error("Pekerjaan belum dilepas ke produksi.");
    }
    validateShipmentSnapshotSources(details, header.customerSnapshot);
    const lines = await tx
      .select({ id: transactionLines.id, quantity: transactionLines.quantity, unit: transactionLines.unit })
      .from(transactionLines)
      .where(eq(transactionLines.transactionId, transactionId));
    const shipped = await tx
      .select({
        shipmentId: shipments.id,
        lineId: shipmentLines.transactionLineId,
        quantity: shipmentLines.quantity,
        accepted: shipmentLines.acceptedQuantity,
        acceptedQuantity: shipmentLines.acceptedQuantity,
        status: shipments.status,
      })
      .from(shipmentLines)
      .innerJoin(shipments, eq(shipments.id, shipmentLines.shipmentId))
      .where(eq(shipments.transactionId, transactionId));
    const stockBatches = await tx
      .select({
        transactionLineId: productionBatches.transactionLineId,
        kind: productionBatches.kind,
        status: productionBatches.status,
        completedQuantity: productionBatches.completedQuantity,
      })
      .from(productionBatches)
      .where(eq(productionBatches.transactionId, transactionId));
    const available = shipmentAvailableByLine(lines, stockBatches, shipped);
    for (const item of items) {
      const line = lines.find((entry) => entry.id === item.lineId);
      const used = shipped
        .filter((entry) => entry.lineId === item.lineId)
        .reduce((total, entry) => total + committedAmount(entry.status, entry.quantity, entry.accepted), 0);
      if (!line || Number(item.quantity) + used > Number(line.quantity) + 0.0001) {
        throw new Error("Jumlah pengiriman melebihi barang dalam penawaran.");
      }
      if (Number(item.quantity) > (available.get(item.lineId) ?? 0) + 0.0001) {
        throw new ShipmentInlineFieldError(
          "Jumlah pengiriman melebihi hasil produksi yang belum dialokasikan.",
          `items:${item.lineId}`,
        );
      }
      try {
        validateShipmentLogistics(item.logistics, item.quantity, line.unit);
      } catch (error) {
        throw new ShipmentInlineFieldError(
          error instanceof Error ? error.message : "Periksa jumlah dan kemasan barang ini.",
          `items:${item.lineId}`,
        );
      }
    }
    const [count] = await tx
      .select({ total: sql<number>`count(*)` })
      .from(shipments)
      .where(eq(shipments.transactionId, transactionId));
    const shipmentNo = `${header.referenceNo}-SJ-${String(Number(count?.total ?? 0) + 1).padStart(2, "0")}`;
    const [shipment] = await tx
      .insert(shipments)
      .values({
        transactionId,
        shipmentNo,
        operationKey,
        recipientName: recipient,
        deliveryAddress: address,
        deliveryDetails: details,
        plannedShipAt,
      })
      .returning({ id: shipments.id });
    await tx.insert(shipmentLines).values(
      items.map((item) => ({
        shipmentId: shipment.id,
        transactionLineId: item.lineId,
        quantity: item.quantity,
        logistics: item.logistics,
      })),
    );
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "transaction.shipment_planned",
      entityType: "transaction",
      entityId: transactionId,
      metadata: { shipmentId: shipment.id, itemCount: items.length },
    });
  });
  if (field(formData, "inlineResult") === "yes") return { ok: true as const, message: "Rencana pengiriman disimpan." };
  revalidatePath(`/admin/transactions/${transactionId}`);
  redirect(transactionPath(transactionId, "delivery", "shipment-planned"));
}

export async function updatePlannedShipment(formData: FormData) {
  const user = await operationsUser();
  const transactionId = z.string().uuid().parse(field(formData, "transactionId"));
  const shipmentId = z.string().uuid().parse(field(formData, "shipmentId"));
  const { items, recipient, address, details, plannedShipAt } = parseShipmentForm(formData);
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  await database.transaction(async (tx) => {
    await tx.execute(sql`select id from business_transactions where id = ${transactionId} for update`);
    const [shipment] = await tx
      .select()
      .from(shipments)
      .where(and(eq(shipments.id, shipmentId), eq(shipments.transactionId, transactionId)));
    if (!shipment || shipment.status !== "planned") throw new Error("Pengiriman sudah dikirim atau tidak ditemukan.");
    const [transaction] = await tx
      .select({ customerSnapshot: businessTransactions.customerSnapshot })
      .from(businessTransactions)
      .where(eq(businessTransactions.id, transactionId));
    validateShipmentSnapshotSources(details, transaction?.customerSnapshot);
    if (shipment.deliveryDocumentId) {
      const [document] = await tx
        .select({ status: transactionDocuments.status, documentNo: transactionDocuments.documentNo })
        .from(transactionDocuments)
        .where(eq(transactionDocuments.id, shipment.deliveryDocumentId));
      const expectedNumber = shipment.deliveryNo ?? `UJI-${shipment.shipmentNo}`;
      if (document?.status !== "ready" || document.documentNo !== expectedNumber) {
        throw new Error("Surat jalan lama atau dokumen yang belum selesai harus diperiksa sebelum koreksi.");
      }
    }
    const lines = await tx
      .select({ id: transactionLines.id, quantity: transactionLines.quantity, unit: transactionLines.unit })
      .from(transactionLines)
      .where(eq(transactionLines.transactionId, transactionId));
    const others = await tx
      .select({
        shipmentId: shipments.id,
        lineId: shipmentLines.transactionLineId,
        quantity: shipmentLines.quantity,
        accepted: shipmentLines.acceptedQuantity,
        acceptedQuantity: shipmentLines.acceptedQuantity,
        status: shipments.status,
      })
      .from(shipmentLines)
      .innerJoin(shipments, eq(shipments.id, shipmentLines.shipmentId))
      .where(and(eq(shipments.transactionId, transactionId), ne(shipments.id, shipmentId)));
    const stockBatches = await tx
      .select({
        transactionLineId: productionBatches.transactionLineId,
        kind: productionBatches.kind,
        status: productionBatches.status,
        completedQuantity: productionBatches.completedQuantity,
      })
      .from(productionBatches)
      .where(eq(productionBatches.transactionId, transactionId));
    const available = shipmentAvailableByLine(lines, stockBatches, others);
    for (const item of items) {
      const line = lines.find((entry) => entry.id === item.lineId);
      const used = others
        .filter((entry) => entry.lineId === item.lineId)
        .reduce((total, entry) => total + committedAmount(entry.status, entry.quantity, entry.accepted), 0);
      if (!line || Number(item.quantity) + used > Number(line.quantity) + 0.0001) {
        throw new Error("Jumlah pengiriman melebihi barang dalam penawaran.");
      }
      if (Number(item.quantity) > (available.get(item.lineId) ?? 0) + 0.0001) {
        throw new ShipmentInlineFieldError(
          "Jumlah pengiriman melebihi hasil produksi yang belum dialokasikan.",
          `items:${item.lineId}`,
        );
      }
      try {
        validateShipmentLogistics(item.logistics, item.quantity, line.unit);
      } catch (error) {
        throw new ShipmentInlineFieldError(
          error instanceof Error ? error.message : "Periksa jumlah dan kemasan barang ini.",
          `items:${item.lineId}`,
        );
      }
    }
    await tx.delete(shipmentLines).where(eq(shipmentLines.shipmentId, shipmentId));
    await tx.insert(shipmentLines).values(
      items.map((item) => ({
        shipmentId,
        transactionLineId: item.lineId,
        quantity: item.quantity,
        logistics: item.logistics,
      })),
    );
    await tx
      .update(shipments)
      .set({
        recipientName: recipient,
        deliveryAddress: address,
        deliveryDetails: details,
        plannedShipAt,
        deliveryDocumentId: null,
      })
      .where(eq(shipments.id, shipmentId));
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "transaction.shipment_revised",
      entityType: "transaction",
      entityId: transactionId,
      metadata: { shipmentId, itemCount: items.length, previousDocumentId: shipment.deliveryDocumentId },
    });
  });
  if (field(formData, "inlineResult") === "yes") return { ok: true as const, message: "Koreksi pengiriman disimpan." };
  revalidatePath(`/admin/transactions/${transactionId}`);
  redirect(transactionPath(transactionId, "delivery", "shipment-revised"));
}

export type ShipmentActionState = {
  ok: boolean;
  message: string;
  fieldErrors: Record<string, string>;
};

export async function saveShipmentInline(
  _previous: ShipmentActionState,
  formData: FormData,
): Promise<ShipmentActionState> {
  formData.set("inlineResult", "yes");
  try {
    const result = field(formData, "shipmentId")
      ? await updatePlannedShipment(formData)
      : await createShipment(formData);
    return { ok: true, message: result?.message ?? "Pengiriman disimpan.", fieldErrors: {} };
  } catch (error) {
    const message =
      error instanceof Error &&
      /jumlah|pack|berat|tanggal|jam|penerima|alamat|produksi|penawaran|pengiriman/i.test(error.message)
        ? error.message
        : "Pengiriman belum tersimpan. Periksa data dan coba lagi.";
    const fieldName =
      error instanceof ShipmentInlineFieldError
        ? error.fieldName
        : /pack|berat|jumlah|produksi|penawaran/i.test(message)
          ? "items"
          : /tanggal|jam/i.test(message)
            ? "plannedShipAt"
            : /alamat/i.test(message)
              ? "address"
              : /penerima/i.test(message)
                ? "recipient"
                : "form";
    return { ok: false, message, fieldErrors: { [fieldName]: message } };
  }
}

export async function generateDeliveryNote(formData: FormData) {
  const user = await operationsUser();
  const shipmentId = z.string().uuid().parse(field(formData, "shipmentId"));
  const templateId = await resolveDocumentProviderTemplateId("delivery", docGenTemplateId("DELIVERY"));
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  const [shipment] = await database
    .select({ transactionId: shipments.transactionId })
    .from(shipments)
    .where(eq(shipments.id, shipmentId));
  if (!shipment) throw new Error("Pengiriman tidak ditemukan.");
  if (!templateId) {
    redirect(transactionPath(shipment.transactionId, "delivery", "delivery-template-unavailable"));
  }
  await assertDocGenTestTransaction(shipment.transactionId);
  const [issuerSettings] = await database.select().from(invoiceIssuerSettings).limit(1);
  if (officialDocumentFlowEnabled() && !invoiceIssuerIsReady(issuerSettings ?? null)) {
    throw new Error("Identitas penerbit belum disetujui administrator.");
  }
  const issuedAt = new Date();
  const prepared = await database.transaction(async (tx) => {
    await tx.execute(sql`select id from business_transactions where id = ${shipment.transactionId} for update`);
    const [rawDetail] = await tx
      .select({
        shipmentNo: shipments.shipmentNo,
        deliveryNo: shipments.deliveryNo,
        deliveryDetails: shipments.deliveryDetails,
        plannedShipAt: shipments.plannedShipAt,
        status: shipments.status,
        transactionId: shipments.transactionId,
        recipientName: shipments.recipientName,
        deliveryAddress: shipments.deliveryAddress,
        deliveryDocumentId: shipments.deliveryDocumentId,
        customerSnapshot: businessTransactions.customerSnapshot,
        customerName: customers.displayName,
      })
      .from(shipments)
      .innerJoin(businessTransactions, eq(businessTransactions.id, shipments.transactionId))
      .innerJoin(customers, eq(customers.id, businessTransactions.customerId))
      .where(eq(shipments.id, shipmentId));
    const detailSnapshot = customerSnapshotView(rawDetail?.customerSnapshot);
    const detail = rawDetail ? { ...rawDetail, customerName: detailSnapshot?.name || rawDetail.customerName } : null;
    if (!detail || detail.status !== "planned" || detail.deliveryDocumentId)
      throw new Error("Surat jalan sudah tersedia atau pengiriman tidak dapat diubah.");
    const items = await tx
      .select({
        description: transactionLines.description,
        quantity: shipmentLines.quantity,
        unit: transactionLines.unit,
        logistics: shipmentLines.logistics,
      })
      .from(shipmentLines)
      .innerJoin(transactionLines, eq(transactionLines.id, shipmentLines.transactionLineId))
      .where(eq(shipmentLines.shipmentId, shipmentId));
    if (!items.length) throw new Error("Pengiriman belum memiliki barang.");
    const [po] = await tx
      .select({ documentNo: transactionDocuments.documentNo })
      .from(transactionDocuments)
      .where(
        and(
          eq(transactionDocuments.transactionId, detail.transactionId),
          eq(transactionDocuments.type, "purchase_order"),
        ),
      )
      .orderBy(desc(transactionDocuments.createdAt))
      .limit(1);
    const [latest] = await tx
      .select({ version: transactionDocuments.version, status: transactionDocuments.status })
      .from(transactionDocuments)
      .where(
        and(
          eq(transactionDocuments.transactionId, detail.transactionId),
          eq(transactionDocuments.type, "delivery_note"),
          sql`${transactionDocuments.payload}->>'shipmentId' = ${shipmentId}`,
        ),
      )
      .orderBy(desc(transactionDocuments.version))
      .limit(1);
    if (latest && latest.status !== "ready") return null;
    const version = (latest?.version ?? 0) + 1;
    let deliveryNo = detail.deliveryNo;
    if (!deliveryNo && officialDocumentFlowEnabled()) {
      const year = jakartaYear(issuedAt);
      const [counter] = await tx
        .update(deliveryNumberCounters)
        .set({ lastValue: sql`${deliveryNumberCounters.lastValue} + 1`, updatedAt: issuedAt })
        .where(eq(deliveryNumberCounters.referenceYear, year))
        .returning({ lastValue: deliveryNumberCounters.lastValue });
      if (!counter) throw new Error(`Nomor surat jalan tahun ${year} belum diinisialisasi administrator.`);
      deliveryNo = formatDeliveryNumber(counter.lastValue, issuedAt);
      await tx.update(shipments).set({ deliveryNo }).where(eq(shipments.id, shipmentId));
    }
    const documentNo = deliveryNo ?? `UJI-${detail.shipmentNo}`;
    const operationKey = randomUUID();
    const [document] = await tx
      .insert(transactionDocuments)
      .values({
        transactionId: detail.transactionId,
        type: "delivery_note",
        direction: "outbound",
        documentNo,
        version,
        status: "generating",
        templateId,
        operationKey,
        payload: docGenPayload({ shipmentId, detail, items, poNo: po?.documentNo ?? "" }),
        originalName: `surat-jalan-${detail.shipmentNo}-v${version}.pdf`,
        createdBy: user.id,
      })
      .returning({ id: transactionDocuments.id });
    await tx.update(shipments).set({ deliveryDocumentId: document.id }).where(eq(shipments.id, shipmentId));
    return { detail, items, documentNo, version, poNo: po?.documentNo ?? "", documentId: document.id, operationKey };
  });
  if (!prepared) redirect(transactionPath(shipment.transactionId, "delivery", "delivery-pending-review"));
  try {
    const approvedIssuer = invoiceIssuerIsReady(issuerSettings ?? null) ? issuerSettings : null;
    const logoDataUri = approvedIssuer?.logoPath
      ? await readInvoiceLogo(approvedIssuer.logoPath)
      : await readInvoiceLogo("/brand/quotation-logo.png");
    const renderData = deliveryRenderData({
      number: prepared.documentNo,
      version: prepared.version,
      issuedAt,
      plannedShipAt: prepared.detail.plannedShipAt,
      customerName: prepared.detail.customerName,
      recipientName: prepared.detail.recipientName ?? prepared.detail.customerName,
      address: prepared.detail.deliveryAddress ?? "",
      poNo: prepared.poNo,
      details: readDeliveryDetails(prepared.detail.deliveryDetails),
      lines: prepared.items.map((item) => ({ ...item, logistics: readShipmentLogistics(item.logistics) })),
      issuer: {
        legalName: approvedIssuer?.legalName || "CV. ANUGRAHPLASTIK MANDIRI BANDUNG",
        address: approvedIssuer?.address || "Perum Lebak Wangi Asri Blok A2 No.16, Bojong Pulus, Banjaran, Bandung",
        phone: approvedIssuer?.phone || "081 22 33 95 87",
        email: approvedIssuer?.email || "cs@anugrahplastik.com",
        website: approvedIssuer?.website || "www.anugrahplastik.com",
        logoDataUri,
      },
    });
    await database
      .update(transactionDocuments)
      .set({
        payload: docGenPayload({
          shipmentId,
          detail: prepared.detail,
          items: prepared.items,
          poNo: prepared.poNo,
          issuedAt: issuedAt.toISOString(),
          renderData,
        }),
      })
      .where(eq(transactionDocuments.id, prepared.documentId));
    const pdf = await renderDocGenPdf({
      templateId,
      operationKey: prepared.operationKey,
      transactionId: prepared.detail.transactionId,
      documentId: prepared.documentId,
      filename: `surat-jalan-${prepared.detail.shipmentNo}-v${prepared.version}.pdf`,
      data: docGenPayload(renderData),
    });
    await database.transaction(async (tx) => {
      await tx
        .update(transactionDocuments)
        .set({ ...pdf, status: "ready" })
        .where(eq(transactionDocuments.id, prepared.documentId));
      await tx.insert(auditLogs).values({
        actorId: user.id,
        action: "transaction.delivery_note_ready",
        entityType: "transaction",
        entityId: prepared.detail.transactionId,
        metadata: {
          shipmentId,
          documentId: prepared.documentId,
          version: prepared.version,
          documentNo: prepared.documentNo,
        },
      });
    });
  } catch (error) {
    await markDocumentForReview(prepared.documentId, error);
    revalidatePath(`/admin/transactions/${prepared.detail.transactionId}`);
    redirect(transactionPath(prepared.detail.transactionId, "delivery", "delivery-check"));
  }
  revalidatePath(`/admin/transactions/${prepared.detail.transactionId}`);
  redirect(transactionPath(prepared.detail.transactionId, "delivery", "delivery-ready"));
}

export async function markShipmentSent(formData: FormData) {
  const user = await operationsUser();
  const shipmentId = z.string().uuid().parse(field(formData, "shipmentId"));
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  const transactionId = await database.transaction(async (tx) => {
    const [target] = await tx
      .select({ transactionId: shipments.transactionId })
      .from(shipments)
      .where(eq(shipments.id, shipmentId));
    if (!target) throw new Error("Pengiriman tidak ditemukan.");
    await tx.execute(sql`select id from business_transactions where id = ${target.transactionId} for update`);
    const [shipment] = await tx
      .select({
        transactionId: shipments.transactionId,
        documentId: shipments.deliveryDocumentId,
        status: shipments.status,
      })
      .from(shipments)
      .where(eq(shipments.id, shipmentId));
    if (!shipment || shipment.status !== "planned" || !shipment.documentId) throw new Error("Pengiriman belum siap.");
    const [document] = await tx
      .select({ id: transactionDocuments.id })
      .from(transactionDocuments)
      .where(and(eq(transactionDocuments.id, shipment.documentId), eq(transactionDocuments.status, "ready")));
    if (!document) throw new Error("Surat jalan belum siap.");
    await tx.update(shipments).set({ status: "shipped", shippedAt: new Date() }).where(eq(shipments.id, shipmentId));
    await tx
      .update(businessTransactions)
      .set({ fulfilmentStatus: "shipping", updatedAt: new Date() })
      .where(eq(businessTransactions.id, shipment.transactionId));
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "transaction.shipment_sent",
      entityType: "transaction",
      entityId: shipment.transactionId,
      metadata: { shipmentId },
    });
    return shipment.transactionId;
  });
  revalidatePath(`/admin/transactions/${transactionId}`);
  redirect(transactionPath(transactionId, "delivery", "shipment-sent"));
}

export async function closeTransaction(formData: FormData) {
  const user = await administrator();
  const transactionId = z.string().uuid().parse(field(formData, "transactionId"));
  const reason = field(formData, "exceptionReason");
  const exceptionConfirmed = field(formData, "exceptionConfirmed") === "yes";
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  await database.transaction(async (tx) => {
    await tx.execute(sql`select id from business_transactions where id = ${transactionId} for update`);
    const [header] = await tx
      .select({
        fulfilmentStatus: businessTransactions.fulfilmentStatus,
        cancelledAt: businessTransactions.cancelledAt,
      })
      .from(businessTransactions)
      .where(eq(businessTransactions.id, transactionId));
    if (!header || header.cancelledAt || header.fulfilmentStatus === "completed")
      throw new Error("Transaksi tidak dapat ditutup.");
    const [delivery] = await tx
      .select({
        total: sql<number>`count(*)`,
        pending: sql<number>`count(*) filter (where ${shipments.status} not in ('received', 'received_partial') or ${shipments.bastDocumentId} is null)`,
        damaged: sql<number>`count(*) filter (where ${shipments.handoverDetails}->>'condition' = 'damaged')`,
      })
      .from(shipments)
      .where(eq(shipments.transactionId, transactionId));
    const [invoices] = await tx
      .select({
        total: sql<string>`coalesce(sum(${transactionInvoices.amount}) filter (where ${transactionInvoices.status} in ('issued', 'sent', 'partial', 'paid', 'overdue')), 0)`,
      })
      .from(transactionInvoices)
      .where(eq(transactionInvoices.transactionId, transactionId));
    const [received] = await tx
      .select({
        total: sql<string>`coalesce(sum(${transactionFinancialEntries.amount}) filter (where ${transactionFinancialEntries.status} = 'verified' and ${transactionFinancialEntries.direction} = 'in' and ${transactionFinancialEntries.kind} = 'customer_payment'), 0)`,
      })
      .from(transactionFinancialEntries)
      .where(eq(transactionFinancialEntries.transactionId, transactionId));
    const lines = await tx
      .select({ id: transactionLines.id, quantity: transactionLines.quantity })
      .from(transactionLines)
      .where(eq(transactionLines.transactionId, transactionId));
    const delivered = await tx
      .select({
        lineId: shipmentLines.transactionLineId,
        total: sql<string>`sum(coalesce(${shipmentLines.acceptedQuantity}, case when ${shipments.status} = 'received' then ${shipmentLines.quantity} else 0 end))`,
      })
      .from(shipmentLines)
      .innerJoin(shipments, eq(shipments.id, shipmentLines.shipmentId))
      .where(
        and(
          eq(shipments.transactionId, transactionId),
          inArray(shipments.status, ["received", "received_partial"]),
          isNotNull(shipments.bastDocumentId),
        ),
      )
      .groupBy(shipmentLines.transactionLineId);
    const fullQuantity =
      lines.length > 0 &&
      lines.every(
        (line) =>
          quantityMillis(delivered.find((item) => item.lineId === line.id)?.total ?? "0") >=
          quantityMillis(line.quantity),
      );
    const quote = lines.length
      ? calculateQuote(
          await tx
            .select({
              description: transactionLines.description,
              quantity: transactionLines.quantity,
              unit: transactionLines.unit,
              unitPrice: transactionLines.unitPrice,
              taxRate: transactionLines.taxRate,
              taxMethod: transactionLines.taxMethod,
              discountKind: transactionLines.discountKind,
              discountValue: transactionLines.discountValue,
            })
            .from(transactionLines)
            .where(eq(transactionLines.transactionId, transactionId)),
        )
      : null;
    const needsException =
      Number(delivery?.total ?? 0) === 0 ||
      Number(delivery?.pending ?? 0) > 0 ||
      Number(delivery?.damaged ?? 0) > 0 ||
      !fullQuantity ||
      !quote ||
      moneyCents(invoices?.total ?? "0") < moneyCents(quote.total) ||
      moneyCents(received?.total ?? "0") < moneyCents(invoices?.total ?? "0");
    if (needsException && (reason.length < 8 || reason.length > 500 || !exceptionConfirmed)) {
      throw new Error(
        "Transaksi belum dapat ditutup normal. Untuk penutupan sebagai pengecualian, tulis alasan dan konfirmasikan tindakan tersebut.",
      );
    }
    await tx
      .update(businessTransactions)
      .set({ fulfilmentStatus: "completed", commercialStatus: "completed", updatedAt: new Date() })
      .where(eq(businessTransactions.id, transactionId));
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "transaction.closed",
      entityType: "transaction",
      entityId: transactionId,
      metadata: { exception: needsException, reason: needsException ? reason : null },
    });
  });
  revalidatePath(`/admin/transactions/${transactionId}`);
  redirect(transactionPath(transactionId, "handover", "closed"));
}

export async function updateTransactionTitle(formData: FormData) {
  const user = await operationsUser();
  const id = z.string().uuid().parse(field(formData, "transactionId"));
  const title = z.string().trim().min(2, "Judul minimal dua karakter.").max(180).parse(field(formData, "title"));
  const step = z
    .enum(["quote", "order", "payment", "production", "delivery", "handover"])
    .catch("quote")
    .parse(field(formData, "step"));
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  await database.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: businessTransactions.id, title: businessTransactions.title })
      .from(businessTransactions)
      .where(eq(businessTransactions.id, id));
    if (!existing) throw new Error("Transaksi tidak ditemukan.");
    await tx.update(businessTransactions).set({ title, updatedAt: new Date() }).where(eq(businessTransactions.id, id));
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "transaction.title_updated",
      entityType: "transaction",
      entityId: id,
      metadata: { previousTitle: existing.title, title },
    });
  });
  revalidatePath(`/admin/transactions/${id}`);
  revalidatePath("/admin/transactions");
  redirect(transactionPath(id, step, "title-updated"));
}

export async function saveTransactionTitleInline(_previous: { ok: boolean; message: string }, formData: FormData) {
  const user = await operationsUser();
  const id = z.string().uuid().safeParse(field(formData, "transactionId"));
  const title = z
    .string()
    .trim()
    .min(2, "Judul minimal dua karakter.")
    .max(180, "Judul maksimal 180 karakter.")
    .safeParse(field(formData, "title"));
  if (!id.success) return { ok: false, message: "Transaksi tidak valid. Muat ulang halaman." };
  if (!title.success) return { ok: false, message: title.error.issues[0]?.message ?? "Periksa judul pekerjaan." };
  const database = getDatabase();
  if (!database) return { ok: false, message: "Database belum terhubung. Coba lagi setelah koneksi pulih." };
  try {
    await database.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: businessTransactions.id, title: businessTransactions.title })
        .from(businessTransactions)
        .where(eq(businessTransactions.id, id.data));
      if (!existing) throw new Error("Transaksi tidak ditemukan.");
      if (existing.title === title.data) return;
      await tx
        .update(businessTransactions)
        .set({ title: title.data, updatedAt: new Date() })
        .where(eq(businessTransactions.id, id.data));
      await tx.insert(auditLogs).values({
        actorId: user.id,
        action: "transaction.title_updated",
        entityType: "transaction",
        entityId: id.data,
        metadata: { previousTitle: existing.title, title: title.data },
      });
    });
  } catch {
    return { ok: false, message: "Judul belum tersimpan. Periksa koneksi lalu coba lagi." };
  }
  revalidatePath(`/admin/transactions/${id.data}`);
  revalidatePath("/admin/transactions");
  return { ok: true, message: "Judul pekerjaan tersimpan." };
}

export async function setTransactionArchived(formData: FormData) {
  const user = await administrator();
  const id = z.string().uuid().parse(field(formData, "transactionId"));
  const archive = field(formData, "archive") === "yes";
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  await database.transaction(async (tx) => {
    await tx.execute(sql`select id from business_transactions where id = ${id} for update`);
    const [existing] = await tx
      .select({ archivedAt: businessTransactions.archivedAt, referenceNo: businessTransactions.referenceNo })
      .from(businessTransactions)
      .where(eq(businessTransactions.id, id));
    if (!existing) throw new Error("Transaksi tidak ditemukan.");
    await tx
      .update(businessTransactions)
      .set({ archivedAt: archive ? new Date() : null, archivedBy: archive ? user.id : null, updatedAt: new Date() })
      .where(eq(businessTransactions.id, id));
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: archive ? "transaction.archived" : "transaction.restored",
      entityType: "transaction",
      entityId: id,
      metadata: { referenceNo: existing.referenceNo },
    });
  });
  revalidatePath(`/admin/transactions/${id}`);
  revalidatePath("/admin/transactions");
  redirect("/admin/transactions");
}

export async function generateHandoverNote(formData: FormData) {
  const user = await operationsUser();
  const shipmentId = z.string().uuid().parse(field(formData, "shipmentId"));
  const details = handoverDetailsSchema.parse(JSON.parse(z.string().max(20_000).parse(field(formData, "details"))));
  const templateId = await resolveDocumentProviderTemplateId("handover", docGenTemplateId("BAST"));
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  const [target] = await database
    .select({ transactionId: shipments.transactionId })
    .from(shipments)
    .where(eq(shipments.id, shipmentId));
  if (!target) throw new Error("Pengiriman tidak ditemukan.");
  if (!templateId) redirect(transactionPath(target.transactionId, "handover", "template-unavailable"));
  await assertDocGenTestTransaction(target.transactionId);
  const [issuerSettings] = await database.select().from(invoiceIssuerSettings).limit(1);
  if (officialDocumentFlowEnabled() && !invoiceIssuerIsReady(issuerSettings ?? null))
    throw new Error("Identitas penerbit belum disetujui administrator.");
  const issuedAt = new Date();
  const prepared = await database.transaction(async (tx) => {
    await tx.execute(sql`select id from business_transactions where id = ${target.transactionId} for update`);
    const [rawShipment] = await tx
      .select({
        id: shipments.id,
        shipmentNo: shipments.shipmentNo,
        handoverNo: shipments.handoverNo,
        status: shipments.status,
        bastDocumentId: shipments.bastDocumentId,
        deliveryNo: shipments.deliveryNo,
        deliveryDetails: shipments.deliveryDetails,
        customerSnapshot: businessTransactions.customerSnapshot,
        customerName: customers.displayName,
        transactionId: shipments.transactionId,
      })
      .from(shipments)
      .innerJoin(businessTransactions, eq(businessTransactions.id, shipments.transactionId))
      .innerJoin(customers, eq(customers.id, businessTransactions.customerId))
      .where(eq(shipments.id, shipmentId));
    const shipmentSnapshot = customerSnapshotView(rawShipment?.customerSnapshot);
    const shipment = rawShipment
      ? { ...rawShipment, customerName: shipmentSnapshot?.name || rawShipment.customerName }
      : null;
    if (!shipment || shipment.status !== "shipped" || shipment.bastDocumentId)
      throw new Error("STB hanya dapat dibuat untuk kiriman yang sudah dikirim dan belum memiliki bukti penerimaan.");
    const lines = await tx
      .select({
        lineId: shipmentLines.transactionLineId,
        description: transactionLines.description,
        quantity: shipmentLines.quantity,
        unit: transactionLines.unit,
        logistics: shipmentLines.logistics,
      })
      .from(shipmentLines)
      .innerJoin(transactionLines, eq(transactionLines.id, shipmentLines.transactionLineId))
      .where(eq(shipmentLines.shipmentId, shipmentId));
    validateHandoverDetails(details, lines);
    const [latest] = await tx
      .select({ version: transactionDocuments.version, status: transactionDocuments.status })
      .from(transactionDocuments)
      .where(
        and(
          eq(transactionDocuments.transactionId, shipment.transactionId),
          eq(transactionDocuments.type, "bast"),
          sql`${transactionDocuments.payload}->>'shipmentId' = ${shipmentId}`,
        ),
      )
      .orderBy(desc(transactionDocuments.version))
      .limit(1);
    if (latest && latest.status !== "ready") return null;
    const version = (latest?.version ?? 0) + 1;
    let handoverNo = shipment.handoverNo;
    if (!handoverNo && officialDocumentFlowEnabled()) {
      const year = jakartaYear(issuedAt);
      const [counter] = await tx
        .update(handoverNumberCounters)
        .set({ lastValue: sql`${handoverNumberCounters.lastValue} + 1`, updatedAt: issuedAt })
        .where(eq(handoverNumberCounters.referenceYear, year))
        .returning({ lastValue: handoverNumberCounters.lastValue });
      if (!counter) throw new Error(`Nomor STB tahun ${year} belum ditetapkan administrator.`);
      handoverNo = formatHandoverNumber(counter.lastValue, issuedAt);
      await tx.update(shipments).set({ handoverNo }).where(eq(shipments.id, shipmentId));
    }
    const documentNo = handoverNo ?? `UJI-${shipment.shipmentNo}-STB`;
    const [po] = await tx
      .select({ documentNo: transactionDocuments.documentNo })
      .from(transactionDocuments)
      .where(
        and(
          eq(transactionDocuments.transactionId, shipment.transactionId),
          eq(transactionDocuments.type, "purchase_order"),
        ),
      )
      .orderBy(desc(transactionDocuments.createdAt))
      .limit(1);
    const operationKey = randomUUID();
    const [document] = await tx
      .insert(transactionDocuments)
      .values({
        transactionId: shipment.transactionId,
        type: "bast",
        direction: "outbound",
        documentNo,
        version,
        status: "generating",
        templateId,
        operationKey,
        payload: docGenPayload({ shipmentId, details, lines, poNo: po?.documentNo ?? "" }),
        originalName: `stb-${shipment.shipmentNo}-v${version}.pdf`,
        createdBy: user.id,
      })
      .returning({ id: transactionDocuments.id });
    return { shipment, lines, poNo: po?.documentNo ?? "", documentNo, version, documentId: document.id, operationKey };
  });
  if (!prepared) redirect(transactionPath(target.transactionId, "handover", "handover-pending-review"));
  try {
    const approvedIssuer = invoiceIssuerIsReady(issuerSettings ?? null) ? issuerSettings : null;
    const logoDataUri = approvedIssuer?.logoPath
      ? await readInvoiceLogo(approvedIssuer.logoPath)
      : await readInvoiceLogo("/brand/quotation-logo.png");
    const deliveryDetails = readDeliveryDetails(prepared.shipment.deliveryDetails);
    const renderData = handoverRenderData({
      number: prepared.documentNo,
      version: prepared.version,
      issuedAt,
      customerName: prepared.shipment.customerName,
      shipmentNo: prepared.shipment.shipmentNo,
      deliveryNo: prepared.shipment.deliveryNo ?? "",
      poNo: prepared.poNo,
      deliveryOrderNo: deliveryDetails.deliveryOrderNo,
      vehiclePlate: deliveryDetails.vehiclePlate,
      details,
      lines: prepared.lines.map((line) => ({ ...line, logistics: readShipmentLogistics(line.logistics) })),
      issuer: {
        legalName: approvedIssuer?.legalName || "CV. ANUGRAHPLASTIK MANDIRI BANDUNG",
        address: approvedIssuer?.address || "Perum Lebak Wangi Asri Blok A2 No.16, Bojong Pulus, Banjaran, Bandung",
        phone: approvedIssuer?.phone || "081 22 33 95 87",
        email: approvedIssuer?.email || "cs@anugrahplastik.com",
        website: approvedIssuer?.website || "www.anugrahplastik.com",
        logoDataUri,
      },
    });
    await database
      .update(transactionDocuments)
      .set({
        payload: docGenPayload({
          shipmentId,
          details,
          lines: prepared.lines,
          poNo: prepared.poNo,
          issuedAt: issuedAt.toISOString(),
          renderData,
        }),
      })
      .where(eq(transactionDocuments.id, prepared.documentId));
    const pdf = await renderDocGenPdf({
      templateId,
      operationKey: prepared.operationKey,
      transactionId: prepared.shipment.transactionId,
      documentId: prepared.documentId,
      filename: `stb-${prepared.shipment.shipmentNo}-v${prepared.version}.pdf`,
      data: docGenPayload(renderData),
    });
    await database.transaction(async (tx) => {
      await tx
        .update(transactionDocuments)
        .set({ ...pdf, status: "ready" })
        .where(eq(transactionDocuments.id, prepared.documentId));
      await tx.insert(auditLogs).values({
        actorId: user.id,
        action: "transaction.stb_ready",
        entityType: "transaction",
        entityId: prepared.shipment.transactionId,
        metadata: {
          shipmentId,
          documentId: prepared.documentId,
          version: prepared.version,
          documentNo: prepared.documentNo,
        },
      });
    });
  } catch (error) {
    await markDocumentForReview(prepared.documentId, error);
    revalidatePath(`/admin/transactions/${prepared.shipment.transactionId}`);
    redirect(transactionPath(prepared.shipment.transactionId, "handover", "document-check"));
  }
  revalidatePath(`/admin/transactions/${prepared.shipment.transactionId}`);
  redirect(transactionPath(prepared.shipment.transactionId, "handover", "document-ready"));
}

export async function retryDocumentGeneration(formData: FormData) {
  const user = await administrator();
  const documentId = z.string().uuid().parse(field(formData, "documentId"));
  if (field(formData, "confirmed") !== "yes") throw new Error("Periksa DocGen sebelum melanjutkan.");
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  const [document] = await database.select().from(transactionDocuments).where(eq(transactionDocuments.id, documentId));
  if (!document) redirect("/admin/transactions");
  const step =
    document.type === "quotation"
      ? "quote"
      : document.type === "invoice_dp" || document.type === "invoice_final"
        ? "payment"
        : document.type === "delivery_note"
          ? "delivery"
          : "handover";
  const recoveryIssue = documentRecoveryBlocker({
    status: document.status,
    operationKey: document.operationKey,
    templateId: document.templateId,
    providerDocumentId: document.providerDocumentId,
    hasRenderData: Boolean((document.payload as { renderData?: unknown } | null)?.renderData),
    createdAt: document.createdAt,
    local: localQaRendererEnabled(),
  });
  if (recoveryIssue) redirect(transactionPath(document.transactionId, step, "document-check"));
  if (!document.operationKey || !document.templateId)
    redirect(transactionPath(document.transactionId, step, "document-check"));
  if (document.type === "contract") {
    redirect(transactionPath(document.transactionId, step, "document-check"));
  }
  await assertDocGenTestTransaction(document.transactionId);
  const renderData = z
    .record(z.string(), z.string())
    .safeParse((document.payload as { renderData?: unknown })?.renderData);
  if (!renderData.success) redirect(transactionPath(document.transactionId, step, "document-check"));
  const quotationAttachments =
    document.type === "quotation"
      ? z
          .array(
            z.object({
              id: z.string().uuid(),
              originalName: z.string().nullable(),
              storagePath: z.string().nullable(),
              checksum: z.string().nullable(),
              category: z.string(),
              caption: z.string(),
            }),
          )
          .safeParse((document.payload as { attachments?: unknown })?.attachments)
      : null;
  if (quotationAttachments && !quotationAttachments.success) {
    redirect(transactionPath(document.transactionId, step, "document-check"));
  }
  if (!localQaRendererEnabled() && !process.env.DOCGEN_API_KEY)
    redirect(transactionPath(document.transactionId, step, "document-check"));
  const [claimed] = await database
    .update(transactionDocuments)
    .set({ status: "generating" })
    .where(and(eq(transactionDocuments.id, documentId), eq(transactionDocuments.status, "needs_review")))
    .returning({ id: transactionDocuments.id });
  if (!claimed) redirect(transactionPath(document.transactionId, step, "document-check"));
  try {
    const pdf = await renderDocGenPdf({
      templateId: document.templateId,
      operationKey: document.operationKey,
      transactionId: document.transactionId,
      documentId,
      filename: document.originalName ?? `dokumen-${documentId}.pdf`,
      data: {
        ...renderData.data,
        isDummy: (document.payload as { isDummy?: boolean } | null)?.isDummy === true,
      },
      postProcess:
        document.type === "quotation"
          ? (buffer) =>
              appendQuotationAttachments(
                buffer,
                quotationAttachments?.data ?? [],
                (document.payload as { isDummy?: boolean } | null)?.isDummy === true,
              )
          : undefined,
    });
    await database.transaction(async (tx) => {
      await tx
        .update(transactionDocuments)
        .set({ ...pdf, status: "ready" })
        .where(eq(transactionDocuments.id, documentId));
      if (document.invoiceId) {
        await tx
          .update(transactionInvoices)
          .set({ status: "issued", issuedAt: new Date() })
          .where(and(eq(transactionInvoices.id, document.invoiceId), eq(transactionInvoices.status, "draft")));
        await tx
          .update(businessTransactions)
          .set({ paymentStatus: "awaiting_payment", commercialStatus: "invoice_issued", updatedAt: new Date() })
          .where(eq(businessTransactions.id, document.transactionId));
      }
      await tx.insert(auditLogs).values({
        actorId: user.id,
        action: "transaction.document_generation_recovered",
        entityType: "transaction",
        entityId: document.transactionId,
        metadata: { documentId, invoiceId: document.invoiceId, type: document.type },
      });
    });
  } catch (error) {
    await markDocumentForReview(documentId, error);
    revalidatePath(`/admin/transactions/${document.transactionId}`);
    redirect(transactionPath(document.transactionId, step, "document-check"));
  }
  revalidatePath(`/admin/transactions/${document.transactionId}`);
  redirect(transactionPath(document.transactionId, step, "document-ready"));
}
