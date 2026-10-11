"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import {
  auditLogs,
  financeAccounts,
  financeCategories,
  financeEmployees,
  financeEntries,
  financePayrollItems,
  financePayrollRuns,
} from "@/lib/database/schema";
import { financeCategoryDefaults } from "./service";

const amount = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d{1,2})?$/, "Nominal harus berupa angka positif.")
  .refine((value) => Number(value) > 0, "Nominal harus lebih dari nol.");

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}
async function requireFinanceUser() {
  const user = await getSession();
  if (!user || !["admin", "sales"].includes(user.role)) throw new Error("Akses Keuangan ditolak.");
  return user;
}
function refresh() {
  revalidatePath("/admin/finance");
  revalidatePath("/admin");
}
async function seedCategories(database: NonNullable<ReturnType<typeof getDatabase>>) {
  await database
    .insert(financeCategories)
    .values(
      financeCategoryDefaults.map(([code, name, direction], sortOrder) => ({
        code,
        name,
        direction,
        isSystem: true,
        sortOrder,
      })),
    )
    .onConflictDoNothing({ target: financeCategories.code });
}

export async function createFinanceAccount(formData: FormData) {
  const user = await requireFinanceUser();
  const input = z
    .object({
      name: z.string().min(2).max(120),
      bankName: z.string().min(2).max(120),
      accountNoMasked: z.string().min(4).max(48),
    })
    .parse({
      name: text(formData, "name"),
      bankName: text(formData, "bankName"),
      accountNoMasked: text(formData, "accountNoMasked"),
    });
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  const [record] = await database
    .insert(financeAccounts)
    .values({ ...input, createdBy: user.id })
    .returning({ id: financeAccounts.id });
  await database.insert(auditLogs).values({
    actorId: user.id,
    action: "finance.account_created",
    entityType: "finance_account",
    entityId: record?.id,
    metadata: { name: input.name },
  });
  refresh();
}

export async function createFinanceEntry(formData: FormData) {
  const user = await requireFinanceUser();
  const input = z
    .object({
      accountId: z.string().uuid(),
      categoryCode: z.string().min(2).max(48),
      amount,
      occurredAt: z.string().datetime(),
      kind: z.enum(["opening_balance", "bank_movement", "owner_draw", "payroll", "vendor_bill"]),
      reference: z.string().max(160).optional(),
      counterpartyName: z.string().max(180).optional(),
      notes: z.string().max(3000).optional(),
      supplierId: z.string().uuid().optional(),
    })
    .parse({
      accountId: text(formData, "accountId"),
      categoryCode: text(formData, "categoryCode"),
      amount: text(formData, "amount"),
      occurredAt: new Date(`${text(formData, "occurredAt")}T12:00:00+07:00`).toISOString(),
      kind: text(formData, "kind"),
      reference: text(formData, "reference") || undefined,
      counterpartyName: text(formData, "counterpartyName") || undefined,
      notes: text(formData, "notes") || undefined,
      supplierId: text(formData, "supplierId") || undefined,
    });
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  await seedCategories(database);
  const [account] = await database
    .select({ id: financeAccounts.id })
    .from(financeAccounts)
    .where(and(eq(financeAccounts.id, input.accountId), eq(financeAccounts.status, "active")));
  if (!account) throw new Error("Rekening bank tidak tersedia.");
  const forcedCategory =
    input.kind === "opening_balance"
      ? "other_income"
      : input.kind === "owner_draw"
        ? "owner_draw"
        : input.kind === "vendor_bill"
          ? "vendor_payment"
          : input.categoryCode;
  const [category] = await database
    .select({ id: financeCategories.id, direction: financeCategories.direction })
    .from(financeCategories)
    .where(eq(financeCategories.code, forcedCategory));
  if (!category) throw new Error("Kategori transaksi tidak tersedia.");
  const [record] = await database
    .insert(financeEntries)
    .values({
      accountId: input.accountId,
      categoryId: category?.id,
      supplierId: input.supplierId ?? null,
      kind: input.kind,
      direction: category.direction,
      amount: input.amount,
      occurredAt: new Date(input.occurredAt),
      reference: input.reference ?? null,
      counterpartyName: input.counterpartyName ?? null,
      notes: input.notes ?? null,
      createdBy: user.id,
      status: "pending",
    })
    .returning({ id: financeEntries.id });
  await database.insert(auditLogs).values({
    actorId: user.id,
    action: "finance.entry_created",
    entityType: "finance_entry",
    entityId: record?.id,
    metadata: { kind: input.kind, direction: category.direction, amount: input.amount },
  });
  refresh();
}

export async function verifyFinanceEntry(formData: FormData) {
  const user = await requireFinanceUser();
  const entryId = z.string().uuid().parse(text(formData, "entryId"));
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  const [record] = await database
    .update(financeEntries)
    .set({ status: "verified", verifiedBy: user.id, verifiedAt: new Date() })
    .where(and(eq(financeEntries.id, entryId), eq(financeEntries.status, "pending")))
    .returning({ id: financeEntries.id, amount: financeEntries.amount });
  if (!record) throw new Error("Catatan sudah diproses atau tidak tersedia.");
  await database.insert(auditLogs).values({
    actorId: user.id,
    action: "finance.entry_verified",
    entityType: "finance_entry",
    entityId: record.id,
    metadata: { amount: record.amount },
  });
  refresh();
}

export async function rejectFinanceEntry(formData: FormData) {
  const user = await requireFinanceUser();
  const entryId = z.string().uuid().parse(text(formData, "entryId"));
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  const [record] = await database
    .update(financeEntries)
    .set({ status: "rejected" })
    .where(and(eq(financeEntries.id, entryId), eq(financeEntries.status, "pending")))
    .returning({ id: financeEntries.id });
  if (!record) throw new Error("Catatan sudah diproses atau tidak tersedia.");
  await database
    .insert(auditLogs)
    .values({ actorId: user.id, action: "finance.entry_rejected", entityType: "finance_entry", entityId: record.id });
  refresh();
}

export async function reconcileFinanceEntry(formData: FormData) {
  const user = await requireFinanceUser();
  const entryId = z.string().uuid().parse(text(formData, "entryId"));
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  const [record] = await database
    .update(financeEntries)
    .set({ reconciledAt: new Date(), reconciledBy: user.id })
    .where(and(eq(financeEntries.id, entryId), eq(financeEntries.status, "verified")))
    .returning({ id: financeEntries.id });
  if (!record) throw new Error("Hanya catatan terverifikasi yang dapat direkonsiliasi.");
  await database
    .insert(auditLogs)
    .values({ actorId: user.id, action: "finance.entry_reconciled", entityType: "finance_entry", entityId: record.id });
  refresh();
}

export async function createPayrollRecord(formData: FormData) {
  const user = await requireFinanceUser();
  const input = z
    .object({
      employeeName: z.string().min(2).max(160),
      position: z.string().max(120).optional(),
      accountId: z.string().uuid(),
      periodStart: z.string().date(),
      periodEnd: z.string().date(),
      basePay: amount,
      overtimePay: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
      allowance: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
      deduction: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
      notes: z.string().max(1000).optional(),
    })
    .parse({
      employeeName: text(formData, "employeeName"),
      position: text(formData, "position") || undefined,
      accountId: text(formData, "accountId"),
      periodStart: text(formData, "periodStart"),
      periodEnd: text(formData, "periodEnd"),
      basePay: text(formData, "basePay"),
      overtimePay: text(formData, "overtimePay") || "0",
      allowance: text(formData, "allowance") || "0",
      deduction: text(formData, "deduction") || "0",
      notes: text(formData, "notes") || undefined,
    });
  if (input.periodStart > input.periodEnd) throw new Error("Periode payroll tidak valid.");
  const netPay = Number(input.basePay) + Number(input.overtimePay) + Number(input.allowance) - Number(input.deduction);
  if (netPay <= 0) throw new Error("Gaji bersih harus lebih dari nol.");
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  await seedCategories(database);
  await database.transaction(async (tx) => {
    const [knownEmployee] = await tx
      .select({ id: financeEmployees.id })
      .from(financeEmployees)
      .where(eq(financeEmployees.name, input.employeeName))
      .limit(1);
    const [employee] = knownEmployee
      ? [knownEmployee]
      : await tx
          .insert(financeEmployees)
          .values({ name: input.employeeName, position: input.position ?? null })
          .returning({ id: financeEmployees.id });
    const person = employee;
    if (!person) throw new Error("Data karyawan belum dapat dibuat.");
    const [category] = await tx
      .select({ id: financeCategories.id })
      .from(financeCategories)
      .where(eq(financeCategories.code, "payroll"));
    const [existingRun] = await tx
      .select({ id: financePayrollRuns.id, status: financePayrollRuns.status })
      .from(financePayrollRuns)
      .where(
        and(eq(financePayrollRuns.periodStart, input.periodStart), eq(financePayrollRuns.periodEnd, input.periodEnd)),
      )
      .limit(1);
    if (existingRun && existingRun.status !== "pending" && existingRun.status !== "draft")
      throw new Error("Payroll periode ini sudah diproses dan tidak dapat ditambah.");
    const [createdRun] = existingRun
      ? []
      : await tx
          .insert(financePayrollRuns)
          .values({
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
            notes: input.notes ?? null,
            createdBy: user.id,
            status: "pending",
          })
          .returning({ id: financePayrollRuns.id });
    const run = existingRun ?? createdRun;
    if (!run) throw new Error("Payroll belum dapat dibuat.");
    const [entry] = await tx
      .insert(financeEntries)
      .values({
        accountId: input.accountId,
        categoryId: category?.id,
        employeeId: person.id,
        kind: "payroll",
        direction: "out",
        amount: netPay.toFixed(2),
        occurredAt: new Date(`${input.periodEnd}T12:00:00+07:00`),
        counterpartyName: input.employeeName,
        notes: input.notes ?? null,
        createdBy: user.id,
        status: "pending",
      })
      .returning({ id: financeEntries.id });
    await tx.insert(financePayrollItems).values({
      payrollRunId: run.id,
      employeeId: person.id,
      basePay: input.basePay,
      overtimePay: input.overtimePay,
      allowance: input.allowance,
      deduction: input.deduction,
      netPay: netPay.toFixed(2),
      entryId: entry!.id,
    });
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "finance.payroll_created",
      entityType: "finance_payroll",
      entityId: run.id,
      metadata: { employeeId: person.id, netPay },
    });
  });
  refresh();
}
