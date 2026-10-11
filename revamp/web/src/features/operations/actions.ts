"use server";

import { createHash, randomUUID } from "node:crypto";
import { localQaRendererEnabled } from "./docgen-policy";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { moneyCents } from "./invoice-math";
import {
  auditLogs,
  businessTransactions,
  customers,
  materials,
  materialSuppliers,
  masterNumberCounters,
  moulds,
  productDesignFiles,
  products,
  productionBatches,
  suppliers,
  transactionFinancialEntries,
  transactionDocuments,
  transactionInvoices,
  transactionLines,
  transactionNumberCounters,
} from "@/lib/database/schema";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

async function actor(required: "operations" | "owner") {
  const user = await getSession();
  const allowed =
    user && (required === "owner" ? user.role === "admin" : user.role === "admin" || user.role === "sales");
  if (!allowed) throw new Error("Anda tidak memiliki akses untuk tindakan ini.");
  return user;
}

function refreshOperations() {
  revalidatePath("/admin");
  revalidatePath("/admin/masters");
  revalidatePath("/admin/transactions");
}

type MasterKind = "customer" | "supplier" | "material" | "product" | "mould";

const masterCodePrefix: Record<MasterKind, string> = {
  customer: "CUS",
  supplier: "SUP",
  material: "MAT",
  product: "PRD",
  mould: "MLD",
};

async function nextMasterCode(
  transaction: Parameters<Parameters<NonNullable<ReturnType<typeof getDatabase>>["transaction"]>[0]>[0],
  kind: MasterKind,
) {
  const [counter] = await transaction
    .insert(masterNumberCounters)
    .values({ kind, lastValue: 1 })
    .onConflictDoUpdate({
      target: masterNumberCounters.kind,
      set: { lastValue: sql`${masterNumberCounters.lastValue} + 1`, updatedAt: new Date() },
    })
    .returning({ lastValue: masterNumberCounters.lastValue });
  if (!counter) throw new Error("Kode master belum dapat dibuat.");
  return `${masterCodePrefix[kind]}-${String(counter.lastValue).padStart(6, "0")}`;
}

export async function createCustomer(formData: FormData) {
  const user = await actor("operations");
  const input = z
    .object({
      name: z.string().min(2).max(180),
      email: z.string().email().optional(),
      phone: z.string().max(32).optional(),
    })
    .parse({
      name: value(formData, "name"),
      email: value(formData, "email") || undefined,
      phone: value(formData, "phone") || undefined,
    });
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  await database.transaction(async (transaction) => {
    const code = await nextMasterCode(transaction, "customer");
    const [record] = await transaction
      .insert(customers)
      .values({
        code,
        legalName: input.name,
        displayName: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
      })
      .returning({ id: customers.id });
    if (!record) throw new Error("Pelanggan belum dapat disimpan.");
    await transaction.insert(auditLogs).values({
      actorId: user.id,
      action: "master.customer_created",
      entityType: "customer",
      entityId: record.id,
      metadata: { code },
    });
  });
  refreshOperations();
}

export async function createSupplier(formData: FormData) {
  const user = await actor("owner");
  const input = z.object({ name: z.string().min(2).max(180) }).parse({ name: value(formData, "name") });
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  await database.transaction(async (transaction) => {
    const code = await nextMasterCode(transaction, "supplier");
    const [record] = await transaction
      .insert(suppliers)
      .values({ ...input, code })
      .returning({ id: suppliers.id });
    if (!record) throw new Error("Pemasok belum dapat disimpan.");
    await transaction.insert(auditLogs).values({
      actorId: user.id,
      action: "master.supplier_created",
      entityType: "supplier",
      entityId: record.id,
      metadata: { code },
    });
  });
  refreshOperations();
}

export async function createMaterial(formData: FormData) {
  const user = await actor("owner");
  const input = z
    .object({
      name: z.string().min(2).max(160),
      polymerFamily: z.string().min(2).max(100),
      grade: z.string().max(120).optional(),
    })
    .parse({
      name: value(formData, "name"),
      polymerFamily: value(formData, "family"),
      grade: value(formData, "grade") || undefined,
    });
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  await database.transaction(async (transaction) => {
    const code = await nextMasterCode(transaction, "material");
    const [record] = await transaction
      .insert(materials)
      .values({ ...input, code })
      .returning({ id: materials.id });
    if (!record) throw new Error("Bahan belum dapat disimpan.");
    await transaction.insert(auditLogs).values({
      actorId: user.id,
      action: "master.material_created",
      entityType: "material",
      entityId: record.id,
      metadata: { code },
    });
  });
  refreshOperations();
}

export async function createProduct(formData: FormData) {
  const user = await actor("owner");
  const input = z
    .object({
      name: z.string().min(2).max(180),
      weight: z.coerce.number().nonnegative().optional(),
    })
    .parse({
      name: value(formData, "name"),
      weight: value(formData, "weight") || undefined,
    });
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  await database.transaction(async (transaction) => {
    const sku = await nextMasterCode(transaction, "product");
    const [record] = await transaction
      .insert(products)
      .values({ sku, name: input.name, unitWeightGrams: input.weight ? String(input.weight) : null })
      .returning({ id: products.id });
    if (!record) throw new Error("Barang belum dapat disimpan.");
    await transaction.insert(auditLogs).values({
      actorId: user.id,
      action: "master.product_created",
      entityType: "product",
      entityId: record.id,
      metadata: { code: sku },
    });
  });
  refreshOperations();
}

export async function createMould(formData: FormData) {
  const user = await actor("owner");
  const input = z
    .object({
      name: z.string().min(2).max(180),
      cavities: z.coerce.number().int().positive().optional(),
    })
    .parse({
      name: value(formData, "name"),
      cavities: value(formData, "cavities") || undefined,
    });
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  await database.transaction(async (transaction) => {
    const code = await nextMasterCode(transaction, "mould");
    const [record] = await transaction
      .insert(moulds)
      .values({ code, name: input.name, cavityCount: input.cavities ?? null })
      .returning({ id: moulds.id });
    if (!record) throw new Error("Mould belum dapat disimpan.");
    await transaction.insert(auditLogs).values({
      actorId: user.id,
      action: "master.mould_created",
      entityType: "mould",
      entityId: record.id,
      metadata: { code },
    });
  });
  refreshOperations();
}

const masterManageSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["customer", "supplier", "material", "product", "mould"]),
  name: z.string().min(2).max(180),
  status: z.enum(["active", "inactive", "planned"]),
});

export async function updateMasterRecord(formData: FormData) {
  const user = await actor("owner");
  const input = masterManageSchema.parse({
    id: value(formData, "id"),
    kind: value(formData, "kind"),
    name: value(formData, "name"),
    status: value(formData, "status"),
  });
  if (input.kind !== "mould" && input.status === "planned")
    throw new Error("Status direncanakan hanya berlaku untuk mould.");
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  await database.transaction(async (transaction) => {
    const updatedAt = new Date();
    if (input.kind === "customer")
      await transaction
        .update(customers)
        .set({ legalName: input.name, displayName: input.name, status: input.status, updatedAt })
        .where(eq(customers.id, input.id));
    else if (input.kind === "supplier")
      await transaction
        .update(suppliers)
        .set({ name: input.name, status: input.status, updatedAt })
        .where(eq(suppliers.id, input.id));
    else if (input.kind === "material")
      await transaction
        .update(materials)
        .set({ name: input.name, status: input.status, updatedAt })
        .where(eq(materials.id, input.id));
    else if (input.kind === "product")
      await transaction
        .update(products)
        .set({ name: input.name, status: input.status, updatedAt })
        .where(eq(products.id, input.id));
    else
      await transaction
        .update(moulds)
        .set({ name: input.name, status: input.status, updatedAt })
        .where(eq(moulds.id, input.id));
    await transaction.insert(auditLogs).values({
      actorId: user.id,
      action: `master.${input.kind}_updated`,
      entityType: input.kind,
      entityId: input.id,
      metadata: { name: input.name, status: input.status },
    });
  });
  refreshOperations();
}

export async function deleteMasterRecord(formData: FormData) {
  const user = await actor("owner");
  const input = z
    .object({ id: z.string().uuid(), kind: z.enum(["customer", "supplier", "material", "product", "mould"]) })
    .parse({ id: value(formData, "id"), kind: value(formData, "kind") });
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  await database.transaction(async (transaction) => {
    const dependencies =
      input.kind === "customer"
        ? await Promise.all([
            transaction
              .select({ total: sql<number>`count(*)` })
              .from(businessTransactions)
              .where(eq(businessTransactions.customerId, input.id)),
            transaction
              .select({ total: sql<number>`count(*)` })
              .from(productDesignFiles)
              .where(eq(productDesignFiles.customerId, input.id)),
          ])
        : input.kind === "supplier"
          ? [
              await transaction
                .select({ total: sql<number>`count(*)` })
                .from(materialSuppliers)
                .where(eq(materialSuppliers.supplierId, input.id)),
            ]
          : input.kind === "material"
            ? [
                await transaction
                  .select({ total: sql<number>`count(*)` })
                  .from(products)
                  .where(eq(products.defaultMaterialId, input.id)),
              ]
            : input.kind === "product"
              ? await Promise.all([
                  transaction
                    .select({ total: sql<number>`count(*)` })
                    .from(moulds)
                    .where(eq(moulds.productId, input.id)),
                  transaction
                    .select({ total: sql<number>`count(*)` })
                    .from(productDesignFiles)
                    .where(eq(productDesignFiles.productId, input.id)),
                  transaction
                    .select({ total: sql<number>`count(*)` })
                    .from(transactionLines)
                    .where(eq(transactionLines.productId, input.id)),
                ])
              : await Promise.all([
                  transaction
                    .select({ total: sql<number>`count(*)` })
                    .from(productDesignFiles)
                    .where(eq(productDesignFiles.mouldId, input.id)),
                  transaction
                    .select({ total: sql<number>`count(*)` })
                    .from(productionBatches)
                    .where(eq(productionBatches.mouldId, input.id)),
                ]);
    if (dependencies.some(([row]) => Number(row?.total ?? 0) > 0)) {
      throw new Error(
        "Data ini masih dipakai oleh pekerjaan atau file lain. Nonaktifkan terlebih dahulu agar riwayat tetap aman.",
      );
    }
    if (input.kind === "customer") await transaction.delete(customers).where(eq(customers.id, input.id));
    else if (input.kind === "supplier") await transaction.delete(suppliers).where(eq(suppliers.id, input.id));
    else if (input.kind === "material") await transaction.delete(materials).where(eq(materials.id, input.id));
    else if (input.kind === "product") await transaction.delete(products).where(eq(products.id, input.id));
    else await transaction.delete(moulds).where(eq(moulds.id, input.id));
    await transaction.insert(auditLogs).values({
      actorId: user.id,
      action: `master.${input.kind}_deleted`,
      entityType: input.kind,
      entityId: input.id,
    });
  });
  refreshOperations();
}

export type CreateTransactionState = {
  status: "idle" | "error" | "success";
  message?: string;
  transactionId?: string;
};

export async function createTransaction(
  _previousState: CreateTransactionState,
  formData: FormData,
): Promise<CreateTransactionState> {
  const parsed = z
    .object({ customerId: z.string().uuid(), title: z.string().min(4).max(220) })
    .safeParse({ customerId: value(formData, "customerId"), title: value(formData, "title") });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Pilih customer dari daftar, lalu isi judul pekerjaan minimal 4 karakter.",
    };
  }

  try {
    const user = await actor("operations");
    const database = getDatabase();
    if (!database) return { status: "error", message: "Data belum dapat diakses. Coba lagi sesaat lagi." };

    const year = new Date().getFullYear();
    const transaction = await database.transaction(async (tx) => {
      const [customer] = await tx
        .select({ id: customers.id, email: customers.email })
        .from(customers)
        .where(and(eq(customers.id, parsed.data.customerId), eq(customers.status, "active")));
      if (!customer) throw new Error("Customer yang dipilih tidak aktif atau tidak ditemukan.");
      if (localQaRendererEnabled()) {
        if (!parsed.data.title.startsWith("[UJI]") || !customer.email?.endsWith("@example.invalid")) {
          throw new Error("Proses QA hanya menerima customer fiktif example.invalid dan judul [UJI].");
        }
        const referenceNo = `QA-${randomUUID().replaceAll("-", "").slice(0, 24)}`;
        const [record] = await tx
          .insert(businessTransactions)
          .values({
            referenceNo,
            customerId: customer.id,
            ownerId: user.id,
            title: parsed.data.title,
            dataClass: "test",
          })
          .returning({ id: businessTransactions.id });
        await tx.insert(auditLogs).values({
          actorId: user.id,
          action: "transaction.created",
          entityType: "transaction",
          entityId: record.id,
          metadata: { referenceNo, localQa: true },
        });
        return record;
      }
      const [counter] = await tx
        .insert(transactionNumberCounters)
        .values({ referenceYear: year, lastValue: 1 })
        .onConflictDoUpdate({
          target: transactionNumberCounters.referenceYear,
          set: { lastValue: sql`${transactionNumberCounters.lastValue} + 1`, updatedAt: new Date() },
        })
        .returning({ lastValue: transactionNumberCounters.lastValue });

      if (!counter) throw new Error("Nomor transaksi belum dapat dibuat.");

      const referenceNo = `TRX-${year}-${String(counter.lastValue).padStart(5, "0")}`;
      const [record] = await tx
        .insert(businessTransactions)
        .values({ referenceNo, customerId: parsed.data.customerId, ownerId: user.id, title: parsed.data.title })
        .returning({ id: businessTransactions.id });

      if (!record) throw new Error("Transaksi belum dapat disimpan.");

      await tx.insert(auditLogs).values({
        actorId: user.id,
        action: "transaction.created",
        entityType: "transaction",
        entityId: record.id,
        metadata: { referenceNo },
      });

      return record;
    });

    refreshOperations();
    return {
      status: "success",
      message: "Transaksi berhasil dibuat. Menyiapkan halaman pekerjaan.",
      transactionId: transaction.id,
    };
  } catch {
    return {
      status: "error",
      message: "Transaksi belum tersimpan. Periksa data lalu coba lagi.",
    };
  }
}

export async function recordTransactionPayment(formData: FormData) {
  const user = await actor("operations");
  const input = z
    .object({
      transactionId: z.string().uuid(),
      operationKey: z.string().uuid(),
      amount: z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/),
      reference: z.string().max(160).optional(),
      proofDocumentId: z.string().uuid().optional(),
    })
    .parse({
      transactionId: value(formData, "transactionId"),
      operationKey: value(formData, "operationKey"),
      amount: value(formData, "amount"),
      reference: value(formData, "reference") || undefined,
      proofDocumentId: value(formData, "proofDocumentId") || undefined,
    });
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  if (Number(input.amount) <= 0) throw new Error("Jumlah pembayaran harus lebih dari nol.");
  const requestFingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        actorId: user.id,
        transactionId: input.transactionId,
        amountCents: moneyCents(input.amount).toString(),
        reference: input.reference ?? null,
        proofDocumentId: input.proofDocumentId ?? null,
      }),
    )
    .digest("hex");
  await database.transaction(async (tx) => {
    // Serialize the operation across transactions as well as duplicate browser requests.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.operationKey}, 0))`);
    const [previous] = await tx
      .select({ fingerprint: transactionFinancialEntries.requestFingerprint })
      .from(transactionFinancialEntries)
      .where(eq(transactionFinancialEntries.operationKey, input.operationKey));
    if (previous) {
      if (previous.fingerprint !== requestFingerprint)
        throw new Error("Kunci pembayaran sudah digunakan dengan isi berbeda. Muat ulang formulir.");
      return;
    }
    await tx.execute(sql`select id from business_transactions where id = ${input.transactionId} for update`);
    const [openTransaction] = await tx
      .select({ id: businessTransactions.id })
      .from(businessTransactions)
      .where(
        and(
          eq(businessTransactions.id, input.transactionId),
          sql`${businessTransactions.cancelledAt} is null`,
          sql`${businessTransactions.fulfilmentStatus} <> 'completed'`,
        ),
      );
    if (!openTransaction) throw new Error("Transaksi sudah ditutup atau tidak tersedia.");
    if (input.proofDocumentId) {
      const [proof] = await tx
        .select({ id: transactionDocuments.id })
        .from(transactionDocuments)
        .where(
          and(
            eq(transactionDocuments.id, input.proofDocumentId),
            eq(transactionDocuments.transactionId, input.transactionId),
            eq(transactionDocuments.type, "payment_proof"),
          ),
        );
      if (!proof) throw new Error("Bukti pembayaran tidak ditemukan di transaksi ini.");
    }
    const [record] = await tx
      .insert(transactionFinancialEntries)
      .values({
        transactionId: input.transactionId,
        operationKey: input.operationKey,
        requestFingerprint,
        kind: "customer_payment",
        direction: "in",
        amount: input.amount,
        occurredAt: new Date(),
        reference: input.reference ?? null,
        proofDocumentId: input.proofDocumentId ?? null,
      })
      .returning({ id: transactionFinancialEntries.id });
    await tx
      .update(businessTransactions)
      .set({ paymentStatus: "payment_recorded", updatedAt: new Date() })
      .where(eq(businessTransactions.id, input.transactionId));
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "transaction.payment_recorded",
      entityType: "transaction",
      entityId: input.transactionId,
      metadata: { entryId: record.id, amount: input.amount, hasProof: Boolean(input.proofDocumentId) },
    });
  });
  revalidatePath(`/admin/transactions/${input.transactionId}`);
}

export async function verifyTransactionPayment(formData: FormData) {
  const user = await actor("owner");
  const entryId = z.string().uuid().parse(value(formData, "entryId"));
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  const entry = await database.transaction(async (tx) => {
    const [target] = await tx
      .select({ transactionId: transactionFinancialEntries.transactionId })
      .from(transactionFinancialEntries)
      .where(eq(transactionFinancialEntries.id, entryId));
    if (!target) throw new Error("Pembayaran sudah diverifikasi atau tidak ditemukan.");
    // Serialize all financial changes for the order before updating an individual payment.
    await tx.execute(sql`select id from business_transactions where id = ${target.transactionId} for update`);
    const [openTransaction] = await tx
      .select({ id: businessTransactions.id })
      .from(businessTransactions)
      .where(
        and(
          eq(businessTransactions.id, target.transactionId),
          sql`${businessTransactions.cancelledAt} is null`,
          sql`${businessTransactions.fulfilmentStatus} <> 'completed'`,
        ),
      );
    if (!openTransaction) throw new Error("Transaksi sudah ditutup atau tidak tersedia.");
    const [verified] = await tx
      .update(transactionFinancialEntries)
      .set({ status: "verified", verifiedBy: user.id, verifiedAt: new Date() })
      .where(
        and(
          eq(transactionFinancialEntries.id, entryId),
          eq(transactionFinancialEntries.status, "unverified"),
          eq(transactionFinancialEntries.kind, "customer_payment"),
          eq(transactionFinancialEntries.direction, "in"),
        ),
      )
      .returning({
        transactionId: transactionFinancialEntries.transactionId,
        amount: transactionFinancialEntries.amount,
      });
    if (!verified) throw new Error("Pembayaran sudah diverifikasi atau tidak ditemukan.");
    const [invoice] = await tx
      .select({
        total: sql<string>`coalesce(sum(${transactionInvoices.amount}) filter (where ${transactionInvoices.status} in ('issued', 'sent', 'partial', 'paid', 'overdue')), 0)`,
      })
      .from(transactionInvoices)
      .where(eq(transactionInvoices.transactionId, verified.transactionId));
    const [payments] = await tx
      .select({
        total: sql<string>`coalesce(sum(${transactionFinancialEntries.amount}) filter (where ${transactionFinancialEntries.status} = 'verified' and ${transactionFinancialEntries.direction} = 'in' and ${transactionFinancialEntries.kind} = 'customer_payment'), 0)`,
      })
      .from(transactionFinancialEntries)
      .where(eq(transactionFinancialEntries.transactionId, verified.transactionId));
    const invoiced = moneyCents(invoice?.total ?? "0");
    const received = moneyCents(payments?.total ?? "0");
    await tx
      .update(businessTransactions)
      .set({
        paymentStatus: invoiced > BigInt(0) && received >= invoiced ? "verified" : "partial",
        updatedAt: new Date(),
      })
      .where(eq(businessTransactions.id, verified.transactionId));
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "transaction.payment_verified",
      entityType: "transaction",
      entityId: verified.transactionId,
      metadata: { entryId, amount: verified.amount },
    });
    return verified;
  });
  revalidatePath(`/admin/transactions/${entry.transactionId}`);
}

export async function releaseProduction(formData: FormData) {
  const user = await actor("owner");
  const transactionId = z.string().uuid().parse(value(formData, "transactionId"));
  const reason = value(formData, "reason");
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  await database.transaction(async (tx) => {
    await tx.execute(sql`select id from business_transactions where id = ${transactionId} for update`);
    const [funds] = await tx
      .select({
        total: sql<string>`coalesce(sum(${transactionFinancialEntries.amount}) filter (where ${transactionFinancialEntries.direction} = 'in' and ${transactionFinancialEntries.status} = 'verified' and ${transactionFinancialEntries.kind} = 'customer_payment'), 0)`,
      })
      .from(transactionFinancialEntries)
      .where(eq(transactionFinancialEntries.transactionId, transactionId));
    const [transaction] = await tx
      .select({ dueAt: businessTransactions.dueAt, customerId: businessTransactions.customerId })
      .from(businessTransactions)
      .where(eq(businessTransactions.id, transactionId));
    const [lineCount] = await tx
      .select({
        total: sql<number>`count(*)`,
        value: sql<string>`coalesce(sum(${transactionLines.quantity} * ${transactionLines.unitPrice}), 0)`,
      })
      .from(transactionLines)
      .where(eq(transactionLines.transactionId, transactionId));
    const [invoice] = await tx
      .select({ total: sql<number>`count(*)` })
      .from(transactionInvoices)
      .where(
        and(
          eq(transactionInvoices.transactionId, transactionId),
          sql`${transactionInvoices.status} in ('issued', 'sent', 'partial', 'paid', 'overdue')`,
        ),
      );
    if (!transaction) throw new Error("Transaksi tidak ditemukan.");
    const incomplete =
      Number(funds?.total ?? 0) <= 0 ||
      Number(lineCount?.total ?? 0) <= 0 ||
      Number(lineCount?.value ?? 0) <= 0 ||
      Number(invoice?.total ?? 0) <= 0 ||
      !transaction.customerId ||
      !transaction.dueAt;
    if (incomplete && (reason.length < 8 || reason.length > 500)) {
      throw new Error("Ada data yang belum lengkap. Tulis alasan melanjutkan minimal 8 karakter.");
    }
    const [updated] = await tx
      .update(businessTransactions)
      .set({ fulfilmentStatus: "released", updatedAt: new Date() })
      .where(
        and(
          eq(businessTransactions.id, transactionId),
          eq(businessTransactions.fulfilmentStatus, "not_released"),
          sql`${businessTransactions.cancelledAt} is null`,
        ),
      )
      .returning({ id: businessTransactions.id });
    if (!updated) throw new Error("Pekerjaan sudah dilepas atau tidak tersedia.");
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "transaction.production_released",
      entityType: "transaction",
      entityId: transactionId,
      metadata: {
        hasVerifiedPayment: Number(funds?.total ?? 0) > 0,
        hasLineItem: Number(lineCount?.total ?? 0) > 0,
        hasValue: Number(lineCount?.value ?? 0) > 0,
        hasIssuedInvoice: Number(invoice?.total ?? 0) > 0,
        hasCustomer: Boolean(transaction.customerId),
        hasTargetDate: Boolean(transaction.dueAt),
        reason: incomplete ? reason : null,
      },
    });
  });
  revalidatePath(`/admin/transactions/${transactionId}`);
}

const transactionTrackSchema = z.discriminatedUnion("track", [
  z.object({
    track: z.literal("commercial"),
    status: z.enum(["quotation", "po_received", "invoice_issued", "completed"]),
    reason: z.string().min(3).max(240),
    transactionId: z.string().uuid(),
  }),
  z.object({
    track: z.literal("payment"),
    status: z.enum(["awaiting_invoice", "payment_recorded", "partial", "verified"]),
    reason: z.string().min(3).max(240),
    transactionId: z.string().uuid(),
  }),
  z.object({
    track: z.literal("fulfilment"),
    status: z.enum(["not_released", "released", "completed"]),
    reason: z.string().min(3).max(240),
    transactionId: z.string().uuid(),
  }),
]);

export async function updateTransactionTrackStatus(formData: FormData) {
  const user = await actor("owner");
  const input = transactionTrackSchema.parse({
    transactionId: value(formData, "transactionId"),
    track: value(formData, "track"),
    status: value(formData, "status"),
    reason: value(formData, "reason"),
  });
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  if (input.status === "completed")
    throw new Error("Gunakan tindakan Tutup transaksi pada tahap STB agar penerimaan dan pembayaran diperiksa.");
  if (input.track === "fulfilment" && input.status === "released")
    throw new Error("Gunakan tindakan Lepas produksi agar kelengkapan pekerjaan dan alasan pengecualian diperiksa.");
  await database.transaction(async (transaction) => {
    await transaction.execute(sql`select id from business_transactions where id = ${input.transactionId} for update`);
    const [current] = await transaction
      .select({
        commercialStatus: businessTransactions.commercialStatus,
        paymentStatus: businessTransactions.paymentStatus,
        fulfilmentStatus: businessTransactions.fulfilmentStatus,
        cancelledAt: businessTransactions.cancelledAt,
      })
      .from(businessTransactions)
      .where(eq(businessTransactions.id, input.transactionId));
    if (!current) throw new Error("Transaksi tidak ditemukan.");
    if (current.fulfilmentStatus === "completed")
      throw new Error("Transaksi sudah ditutup dan tidak dapat diubah melalui status manual.");
    if (current.cancelledAt || current.commercialStatus === "cancelled")
      throw new Error("Transaksi sudah dibatalkan dan tidak dapat diubah melalui status manual.");

    if (input.track === "payment") {
      const [invoiceTotal] = await transaction
        .select({ total: sql<string>`coalesce(sum(${transactionInvoices.amount}), 0)` })
        .from(transactionInvoices)
        .where(
          and(
            eq(transactionInvoices.transactionId, input.transactionId),
            sql`${transactionInvoices.status} in ('issued', 'sent', 'partial', 'paid', 'overdue')`,
          ),
        );
      const [verifiedPayments] = await transaction
        .select({ total: sql<string>`coalesce(sum(${transactionFinancialEntries.amount}), 0)` })
        .from(transactionFinancialEntries)
        .where(
          and(
            eq(transactionFinancialEntries.transactionId, input.transactionId),
            eq(transactionFinancialEntries.kind, "customer_payment"),
            eq(transactionFinancialEntries.direction, "in"),
            eq(transactionFinancialEntries.status, "verified"),
          ),
        );
      const [pendingPayments] = await transaction
        .select({ total: sql<number>`count(*)` })
        .from(transactionFinancialEntries)
        .where(
          and(
            eq(transactionFinancialEntries.transactionId, input.transactionId),
            eq(transactionFinancialEntries.kind, "customer_payment"),
            eq(transactionFinancialEntries.direction, "in"),
            eq(transactionFinancialEntries.status, "unverified"),
          ),
        );
      const invoiced = moneyCents(invoiceTotal?.total ?? "0");
      const received = moneyCents(verifiedPayments?.total ?? "0");
      const pending = Number(pendingPayments?.total ?? 0);
      const consistent =
        (input.status === "awaiting_invoice" && invoiced === BigInt(0) && pending === 0 && received === BigInt(0)) ||
        (input.status === "payment_recorded" && pending > 0) ||
        (input.status === "partial" && received > BigInt(0) && received < invoiced) ||
        (input.status === "verified" && invoiced > BigInt(0) && received >= invoiced);
      if (!consistent) {
        throw new Error(
          "Status pembayaran tidak sesuai dengan tagihan dan pembayaran yang tercatat. Periksa ringkasan pembayaran terlebih dahulu.",
        );
      }
    }

    if (input.track === "commercial" && input.status === "invoice_issued") {
      const [issuedInvoice] = await transaction
        .select({ id: transactionInvoices.id })
        .from(transactionInvoices)
        .where(
          and(
            eq(transactionInvoices.transactionId, input.transactionId),
            sql`${transactionInvoices.status} in ('issued', 'sent', 'partial', 'paid', 'overdue')`,
          ),
        )
        .limit(1);
      if (!issuedInvoice) throw new Error("Invoice belum diterbitkan; tahap komersial tidak dapat diubah.");
    }

    const previousStatus =
      input.track === "commercial"
        ? current.commercialStatus
        : input.track === "payment"
          ? current.paymentStatus
          : current.fulfilmentStatus;

    if (input.track === "commercial") {
      await transaction
        .update(businessTransactions)
        .set({ commercialStatus: input.status, updatedAt: new Date() })
        .where(eq(businessTransactions.id, input.transactionId));
    } else if (input.track === "payment") {
      await transaction
        .update(businessTransactions)
        .set({ paymentStatus: input.status, updatedAt: new Date() })
        .where(eq(businessTransactions.id, input.transactionId));
    } else {
      await transaction
        .update(businessTransactions)
        .set({ fulfilmentStatus: input.status, updatedAt: new Date() })
        .where(eq(businessTransactions.id, input.transactionId));
    }

    await transaction.insert(auditLogs).values({
      actorId: user.id,
      action: "transaction.track_status_changed",
      entityType: "transaction",
      entityId: input.transactionId,
      metadata: {
        track: input.track,
        previousStatus,
        nextStatus: input.status,
        reason: input.reason,
      },
    });
  });
  refreshOperations();
  revalidatePath(`/admin/transactions/${input.transactionId}`);
}
