import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import {
  auditLogs,
  businessTransactions,
  shipmentLines,
  shipments,
  transactionDocuments,
  transactionLines,
} from "@/lib/database/schema";
import { preparePrivateDestination, removePrivateFile, safeOriginalName } from "@/features/operations/private-storage";
import {
  handoverDetailsEqual,
  handoverDetailsSchema,
  validateHandoverDetails,
} from "@/features/operations/handover-note";

const maxBytes = 10 * 1024 * 1024;
const accepted = new Set(["purchase_order", "payment_proof", "tax_invoice", "bast_signed", "quotation_attachment"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user || (user.role !== "admin" && user.role !== "sales"))
    return Response.json({ error: "Akses ditolak." }, { status: 403 });
  const length = Number(request.headers.get("content-length"));
  if (!length || length > maxBytes + 32_768) return Response.json({ error: "Berkas maksimal 10 MB." }, { status: 413 });
  const { id } = await params;
  const database = getDatabase();
  if (!database) return Response.json({ error: "Database belum terhubung." }, { status: 503 });
  const [transaction] = await database
    .select({ id: businessTransactions.id, fulfilmentStatus: businessTransactions.fulfilmentStatus })
    .from(businessTransactions)
    .where(and(eq(businessTransactions.id, id), sql`${businessTransactions.cancelledAt} is null`));
  if (!transaction) return Response.json({ error: "Transaksi tidak tersedia." }, { status: 404 });
  if (transaction.fulfilmentStatus === "completed")
    return Response.json({ error: "Transaksi sudah ditutup. Dokumen tidak dapat ditambahkan." }, { status: 409 });
  try {
    const form = await request.formData();
    const type = String(form.get("type") ?? "");
    const file = form.get("file");
    const documentNo = String(form.get("documentNo") ?? "")
      .trim()
      .slice(0, 100);
    const shipmentId = String(form.get("shipmentId") ?? "");
    const category = String(form.get("category") ?? "");
    const caption = String(form.get("caption") ?? "").trim();
    const receiptSource = String(form.get("receiptSource") ?? "external");
    const supersedeReason = String(form.get("supersedeReason") ?? "").trim();
    const receipt =
      type === "bast_signed" ? handoverDetailsSchema.parse(JSON.parse(String(form.get("receipt") ?? ""))) : null;
    if (!accepted.has(type) || (type === "tax_invoice" && user.role !== "admin")) {
      return Response.json({ error: "Jenis dokumen tidak diizinkan." }, { status: 400 });
    }
    if (
      type === "quotation_attachment" &&
      (!new Set(["Foto produk", "Drawing", "Spesifikasi"]).has(category) || caption.length < 3 || caption.length > 160)
    ) {
      return Response.json({ error: "Isi jenis dan keterangan lampiran yang sesuai." }, { status: 400 });
    }
    if (!(file instanceof File) || file.size < 5 || file.size > maxBytes) {
      return Response.json({ error: "Pilih berkas maksimal 10 MB." }, { status: 400 });
    }
    const name = safeOriginalName(file.name);
    const extension = name.split(".").at(-1)?.toLowerCase();
    const allowedExtension = extension === "pdf" || extension === "jpg" || extension === "jpeg" || extension === "png";
    if (!allowedExtension) return Response.json({ error: "Gunakan PDF, JPG, atau PNG." }, { status: 400 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const isPdf =
      buffer.subarray(0, 5).toString() === "%PDF-" && /%%EOF\s*$/.test(buffer.subarray(-1024).toString("latin1"));
    const isJpeg =
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff &&
      buffer.subarray(-2).equals(Buffer.from([0xff, 0xd9]));
    const isPng =
      buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      buffer.subarray(-8).equals(Buffer.from([73, 69, 78, 68, 174, 66, 96, 130]));
    if (!(
      (extension === "pdf" && isPdf) ||
      (["jpg", "jpeg"].includes(extension ?? "") && isJpeg) ||
      (extension === "png" && isPng)
    )) {
      return Response.json({ error: "Isi berkas tidak sesuai dengan jenisnya." }, { status: 400 });
    }
    const relativePath = join("transactions", id, `${randomUUID()}.${extension}`);
    await writeFile(await preparePrivateDestination(relativePath), buffer, { flag: "wx", mode: 0o600 });
    try {
      const [document] = await database.transaction(async (tx) => {
        await tx.execute(sql`select id from business_transactions where id = ${id} for update`);
        const [openTransaction] = await tx
          .select({ id: businessTransactions.id })
          .from(businessTransactions)
          .where(
            and(
              eq(businessTransactions.id, id),
              sql`${businessTransactions.cancelledAt} is null`,
              sql`${businessTransactions.fulfilmentStatus} <> 'completed'`,
            ),
          );
        if (!openTransaction) throw new Error("Transaksi tidak tersedia untuk unggahan.");
        let sourceDocumentId: string | null = null;
        let sourceDocumentNo: string | null = null;
        if (type === "bast_signed") {
          const [shipment] = await tx
            .select({ id: shipments.id, status: shipments.status, bastDocumentId: shipments.bastDocumentId })
            .from(shipments)
            .where(and(eq(shipments.id, shipmentId), eq(shipments.transactionId, id)));
          if (!shipment || !["shipped", "received", "received_partial"].includes(shipment.status))
            throw new Error("Pengiriman belum siap menerima STB.");
          if (
            shipment.bastDocumentId &&
            (user.role !== "admin" || supersedeReason.length < 8 || supersedeReason.length > 500)
          )
            throw new Error("Penggantian bukti memerlukan administrator dan alasan minimal 8 karakter.");
          if (!receipt || !["app", "external"].includes(receiptSource))
            throw new Error("Rincian penerimaan belum lengkap.");
          const lines = await tx
            .select({ lineId: shipmentLines.transactionLineId, quantity: shipmentLines.quantity })
            .from(shipmentLines)
            .where(eq(shipmentLines.shipmentId, shipmentId));
          validateHandoverDetails(receipt, lines);
          if (receiptSource === "app") {
            const [latest] = await tx
              .select({
                id: transactionDocuments.id,
                status: transactionDocuments.status,
                payload: transactionDocuments.payload,
                documentNo: transactionDocuments.documentNo,
              })
              .from(transactionDocuments)
              .where(
                and(
                  eq(transactionDocuments.transactionId, id),
                  eq(transactionDocuments.type, "bast"),
                  sql`${transactionDocuments.payload}->>'shipmentId' = ${shipmentId}`,
                ),
              )
              .orderBy(desc(transactionDocuments.version))
              .limit(1);
            const printed = handoverDetailsSchema.safeParse((latest?.payload as { details?: unknown } | null)?.details);
            if (
              !latest ||
              latest.status !== "ready" ||
              !printed.success ||
              !handoverDetailsEqual(printed.data, receipt) ||
              (documentNo && documentNo !== latest.documentNo)
            )
              throw new Error(
                "Bukti harus sesuai dengan versi STB terakhir yang siap. Buat revisi jika rincian berubah.",
              );
            sourceDocumentId = latest.id;
            sourceDocumentNo = latest.documentNo;
          }
          const otherLines = await tx
            .select({
              lineId: shipmentLines.transactionLineId,
              quantity: shipmentLines.quantity,
              accepted: shipmentLines.acceptedQuantity,
              status: shipments.status,
            })
            .from(shipmentLines)
            .innerJoin(shipments, eq(shipments.id, shipmentLines.shipmentId))
            .where(and(eq(shipments.transactionId, id), ne(shipments.id, shipmentId)));
          const orderLines = await tx
            .select({ id: transactionLines.id, quantity: transactionLines.quantity })
            .from(transactionLines)
            .where(eq(transactionLines.transactionId, id));
          for (const item of receipt.items) {
            const max = Number(orderLines.find((line) => line.id === item.lineId)?.quantity ?? 0);
            const used = otherLines
              .filter((line) => line.lineId === item.lineId)
              .reduce(
                (sum, line) =>
                  sum +
                  (["received", "received_partial"].includes(line.status)
                    ? Number(line.accepted ?? line.quantity)
                    : Number(line.quantity)),
                0,
              );
            if (!max || used + Number(item.accepted) > max + 0.0001)
              throw new Error("Jumlah diterima ditambah kiriman lain melebihi pesanan.");
          }
        }
        const [created] = await tx
          .insert(transactionDocuments)
          .values({
            transactionId: id,
            type,
            direction: type === "quotation_attachment" ? "internal" : "inbound",
            payload:
              type === "quotation_attachment"
                ? { category, caption }
                : type === "bast_signed"
                  ? {
                      shipmentId,
                      receipt,
                      source: receiptSource,
                      sourceDocumentId,
                      supersedeReason: supersedeReason || null,
                    }
                  : null,
            documentNo: documentNo || sourceDocumentNo || null,
            status: "received",
            storagePath: relativePath,
            originalName: name,
            checksum: createHash("sha256").update(buffer).digest("hex"),
            createdBy: user.id,
          })
          .returning({ id: transactionDocuments.id });
        await tx.insert(auditLogs).values({
          actorId: user.id,
          action: "transaction.document_received",
          entityType: "transaction",
          entityId: id,
          metadata: { documentId: created.id, type },
        });
        if (type === "purchase_order") {
          await tx
            .update(businessTransactions)
            .set({ commercialStatus: "po_received", updatedAt: new Date() })
            .where(
              and(
                eq(businessTransactions.id, id),
                eq(businessTransactions.commercialStatus, "quotation"),
                sql`${businessTransactions.fulfilmentStatus} <> 'completed'`,
              ),
            );
        }
        if (type === "bast_signed") {
          const lines = await tx
            .select({ id: shipmentLines.id, lineId: shipmentLines.transactionLineId, quantity: shipmentLines.quantity })
            .from(shipmentLines)
            .where(eq(shipmentLines.shipmentId, shipmentId));
          for (const line of lines) {
            const accepted = receipt!.items.find((item) => item.lineId === line.lineId)!.accepted;
            await tx.update(shipmentLines).set({ acceptedQuantity: accepted }).where(eq(shipmentLines.id, line.id));
          }
          const partial =
            lines.some(
              (line) =>
                Number(receipt!.items.find((item) => item.lineId === line.lineId)!.accepted) + 0.0001 <
                Number(line.quantity),
            ) || receipt!.condition !== "good";
          const [previous] = await tx
            .select({ bastDocumentId: shipments.bastDocumentId })
            .from(shipments)
            .where(eq(shipments.id, shipmentId));
          await tx
            .update(shipments)
            .set({
              bastDocumentId: created.id,
              status: partial ? "received_partial" : "received",
              receivedAt: new Date(),
              handoverDetails: receipt,
            })
            .where(eq(shipments.id, shipmentId));
          await tx.insert(auditLogs).values({
            actorId: user.id,
            action: previous?.bastDocumentId ? "transaction.stb_proof_replaced" : "transaction.stb_proof_received",
            entityType: "transaction",
            entityId: id,
            metadata: {
              shipmentId,
              documentId: created.id,
              previousDocumentId: previous?.bastDocumentId ?? null,
              source: receiptSource,
              partial,
              reason: supersedeReason || null,
            },
          });
          await tx
            .update(businessTransactions)
            .set({ fulfilmentStatus: "bast_pending", updatedAt: new Date() })
            .where(and(eq(businessTransactions.id, id), sql`${businessTransactions.fulfilmentStatus} <> 'completed'`));
        }
        return [created];
      });
      return Response.json({ id: document.id, message: "Dokumen tersimpan." });
    } catch {
      await removePrivateFile(relativePath).catch(() => undefined);
      throw new Error("Dokumen belum dapat disimpan.");
    }
  } catch {
    return Response.json({ error: "Berkas belum tersimpan. Periksa data lalu coba lagi." }, { status: 400 });
  }
}
