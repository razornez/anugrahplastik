"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import {
  auditLogs,
  businessTransactions,
  customers,
  materials,
  masterNumberCounters,
  moulds,
  products,
  suppliers,
  transactionFinancialEntries,
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

async function writeAudit(
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, string | number | boolean | null> = {},
) {
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  await database.insert(auditLogs).values({ actorId, action, entityType, entityId, metadata });
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
      amount: z.coerce.number().positive(),
      reference: z.string().max(160).optional(),
    })
    .parse({
      transactionId: value(formData, "transactionId"),
      amount: value(formData, "amount"),
      reference: value(formData, "reference") || undefined,
    });
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  const [record] = await database
    .insert(transactionFinancialEntries)
    .values({
      transactionId: input.transactionId,
      kind: "customer_payment",
      direction: "in",
      amount: String(input.amount),
      occurredAt: new Date(),
      reference: input.reference ?? null,
    })
    .returning({ id: transactionFinancialEntries.id });
  await writeAudit(user.id, "transaction.payment_recorded", "transaction", input.transactionId, {
    entryId: record.id,
    amount: input.amount,
  });
  revalidatePath(`/admin/transactions/${input.transactionId}`);
}

export async function verifyTransactionPayment(formData: FormData) {
  const user = await actor("owner");
  const entryId = z.string().uuid().parse(value(formData, "entryId"));
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  const [entry] = await database
    .update(transactionFinancialEntries)
    .set({ status: "verified", verifiedBy: user.id, verifiedAt: new Date() })
    .where(eq(transactionFinancialEntries.id, entryId))
    .returning({
      transactionId: transactionFinancialEntries.transactionId,
      amount: transactionFinancialEntries.amount,
    });
  if (!entry) throw new Error("Catatan pembayaran tidak ditemukan.");
  await writeAudit(user.id, "transaction.payment_verified", "transaction", entry.transactionId, {
    entryId,
    amount: Number(entry.amount),
  });
  revalidatePath(`/admin/transactions/${entry.transactionId}`);
}

export async function releaseProduction(formData: FormData) {
  const user = await actor("owner");
  const transactionId = z.string().uuid().parse(value(formData, "transactionId"));
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  const [funds] = await database
    .select({
      total: sql<string>`coalesce(sum(${transactionFinancialEntries.amount}) filter (where ${transactionFinancialEntries.direction} = 'in' and ${transactionFinancialEntries.status} = 'verified'), 0)`,
    })
    .from(transactionFinancialEntries)
    .where(eq(transactionFinancialEntries.transactionId, transactionId));
  if (Number(funds?.total ?? 0) <= 0) throw new Error("Produksi hanya dapat dilepas setelah pembayaran terverifikasi.");
  await database
    .update(businessTransactions)
    .set({ fulfilmentStatus: "released", paymentStatus: "verified", updatedAt: new Date() })
    .where(and(eq(businessTransactions.id, transactionId), sql`${businessTransactions.cancelledAt} is null`));
  await writeAudit(user.id, "transaction.production_released", "transaction", transactionId);
  revalidatePath(`/admin/transactions/${transactionId}`);
}

const transactionTrackSchema = z.discriminatedUnion("track", [
  z.object({
    track: z.literal("commercial"),
    status: z.enum(["quotation", "po_received", "contract", "completed"]),
    reason: z.string().min(3).max(240),
    transactionId: z.string().uuid(),
  }),
  z.object({
    track: z.literal("payment"),
    status: z.enum(["awaiting_invoice", "payment_recorded", "verified"]),
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
  await database.transaction(async (transaction) => {
    const [current] = await transaction
      .select({
        commercialStatus: businessTransactions.commercialStatus,
        paymentStatus: businessTransactions.paymentStatus,
        fulfilmentStatus: businessTransactions.fulfilmentStatus,
      })
      .from(businessTransactions)
      .where(eq(businessTransactions.id, input.transactionId));
    if (!current) throw new Error("Transaksi tidak ditemukan.");

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
