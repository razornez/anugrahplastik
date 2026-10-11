import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { getDatabase } from "@/lib/database/client";
import {
  businessTransactions,
  financeAccounts,
  financeCategories,
  financeEmployees,
  financeEntries,
  financePayrollItems,
  financePayrollRuns,
  suppliers,
  transactionInvoices,
} from "@/lib/database/schema";

const money = (value: string | number | null | undefined) => Number(value ?? 0);

export const financeCategoryDefaults = [
  ["customer_payment", "Pembayaran pelanggan", "in"],
  ["other_income", "Pendapatan lain", "in"],
  ["material_purchase", "Pembelian bahan", "out"],
  ["vendor_payment", "Pembayaran vendor", "out"],
  ["payroll", "Payroll", "out"],
  ["utilities", "Utilitas", "out"],
  ["rent", "Sewa", "out"],
  ["marketing", "Pemasaran", "out"],
  ["tax", "Pajak", "out"],
  ["bank_fee", "Biaya bank", "out"],
  ["owner_draw", "Prive owner", "out"],
  ["other_expense", "Pengeluaran lain", "out"],
] as const;

export type FinanceQuery = { from?: string; to?: string; account?: string; status?: string };

function range(query: FinanceQuery) {
  const now = new Date();
  const from = query.from ? new Date(`${query.from}T00:00:00+07:00`) : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = query.to ? new Date(`${query.to}T23:59:59.999+07:00`) : now;
  return { from, to };
}

export async function getFinanceWorkspace(query: FinanceQuery = {}) {
  const database = getDatabase();
  if (!database) return null;
  const { from, to } = range(query);
  const dateWhere = and(gte(financeEntries.occurredAt, from), lte(financeEntries.occurredAt, to));
  const entryWhere = and(
    dateWhere,
    query.account ? eq(financeEntries.accountId, query.account) : undefined,
    query.status ? eq(financeEntries.status, query.status) : undefined,
  );
  const [accounts, categories, employees, supplierRows, entries, invoiceRows, payrollRuns] = await Promise.all([
    database.select().from(financeAccounts).orderBy(financeAccounts.name),
    database
      .select()
      .from(financeCategories)
      .where(eq(financeCategories.isActive, true))
      .orderBy(financeCategories.sortOrder),
    database
      .select()
      .from(financeEmployees)
      .where(eq(financeEmployees.status, "active"))
      .orderBy(financeEmployees.name),
    database
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers)
      .where(eq(suppliers.status, "active"))
      .orderBy(suppliers.name),
    database
      .select({
        entry: financeEntries,
        accountName: financeAccounts.name,
        categoryName: financeCategories.name,
        supplierName: suppliers.name,
        transactionReference: businessTransactions.referenceNo,
      })
      .from(financeEntries)
      .innerJoin(financeAccounts, eq(financeAccounts.id, financeEntries.accountId))
      .leftJoin(financeCategories, eq(financeCategories.id, financeEntries.categoryId))
      .leftJoin(suppliers, eq(suppliers.id, financeEntries.supplierId))
      .leftJoin(businessTransactions, eq(businessTransactions.id, financeEntries.transactionId))
      .where(entryWhere)
      .orderBy(desc(financeEntries.occurredAt), desc(financeEntries.createdAt))
      .limit(80),
    database
      .select({
        id: transactionInvoices.id,
        invoiceNo: transactionInvoices.invoiceNo,
        amount: transactionInvoices.amount,
        dueAt: transactionInvoices.dueAt,
        status: transactionInvoices.status,
        transactionReference: businessTransactions.referenceNo,
        customerName: sql<string>`coalesce(${businessTransactions.title}, '')`,
      })
      .from(transactionInvoices)
      .innerJoin(businessTransactions, eq(businessTransactions.id, transactionInvoices.transactionId))
      .where(
        and(
          eq(businessTransactions.dataClass, "production"),
          inArray(transactionInvoices.status, ["issued", "sent", "partial", "overdue"]),
          isNull(businessTransactions.cancelledAt),
        ),
      )
      .orderBy(transactionInvoices.dueAt)
      .limit(30),
    database
      .select({ run: financePayrollRuns, total: sql<string>`coalesce(sum(${financePayrollItems.netPay}), 0)` })
      .from(financePayrollRuns)
      .leftJoin(financePayrollItems, eq(financePayrollItems.payrollRunId, financePayrollRuns.id))
      .groupBy(financePayrollRuns.id)
      .orderBy(desc(financePayrollRuns.periodEnd))
      .limit(8),
  ]);

  const accountBalances = await Promise.all(
    accounts.map(async (account) => {
      const [row] = await database
        .select({
          incoming: sql<string>`coalesce(sum(${financeEntries.amount}) filter (where ${financeEntries.status} = 'verified' and ${financeEntries.direction} = 'in'), 0)`,
          outgoing: sql<string>`coalesce(sum(${financeEntries.amount}) filter (where ${financeEntries.status} = 'verified' and ${financeEntries.direction} = 'out'), 0)`,
        })
        .from(financeEntries)
        .where(eq(financeEntries.accountId, account.id));
      return { ...account, balance: money(row?.incoming) - money(row?.outgoing) };
    }),
  );
  const verified = entries.filter(({ entry }) => entry.status === "verified");
  const incoming = verified
    .filter(({ entry }) => entry.direction === "in")
    .reduce((sum, { entry }) => sum + money(entry.amount), 0);
  const outgoing = verified
    .filter(({ entry }) => entry.direction === "out")
    .reduce((sum, { entry }) => sum + money(entry.amount), 0);
  const pending = entries.filter(({ entry }) => entry.status === "pending");
  const overdueInvoices = invoiceRows.filter((invoice) => invoice.dueAt && invoice.dueAt < new Date());

  return {
    range: { from, to },
    accounts: accountBalances,
    categories: categories.length
      ? categories
      : financeCategoryDefaults.map(([code, name, direction], sortOrder) => ({
          id: code,
          code,
          name,
          direction,
          sortOrder,
        })),
    employees,
    suppliers: supplierRows,
    entries,
    invoices: invoiceRows,
    payrollRuns,
    summary: {
      incoming,
      outgoing,
      net: incoming - outgoing,
      pendingCount: pending.length,
      overdueCount: overdueInvoices.length,
    },
  };
}
