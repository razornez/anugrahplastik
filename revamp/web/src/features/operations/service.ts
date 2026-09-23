import { count, desc, eq, getTableColumns, sql } from "drizzle-orm";
import {
  auditLogs,
  businessTransactions,
  customers,
  materials,
  moulds,
  productDesignFiles,
  products,
  productionBatches,
  shipments,
  suppliers,
  transactionDocuments,
  transactionFinancialEntries,
  transactionInvoices,
  transactionLines,
  users,
} from "@/lib/database/schema";
import { getDatabase } from "@/lib/database/client";

function money(value: string | number | null) {
  return Number(value ?? 0);
}

export async function getOperationsOverview() {
  const database = getDatabase();
  if (!database) return null;
  const [customersTotal, suppliersTotal, materialsTotal, productsTotal, mouldsTotal, designsTotal, transactions] =
    await Promise.all([
      database.select({ total: sql<number>`count(*)` }).from(customers),
      database.select({ total: sql<number>`count(*)` }).from(suppliers),
      database.select({ total: sql<number>`count(*)` }).from(materials),
      database.select({ total: sql<number>`count(*)` }).from(products),
      database.select({ total: sql<number>`count(*)` }).from(moulds),
      database.select({ total: sql<number>`count(*)` }).from(productDesignFiles),
      database
        .select({
          id: businessTransactions.id,
          referenceNo: businessTransactions.referenceNo,
          title: businessTransactions.title,
          commercialStatus: businessTransactions.commercialStatus,
          paymentStatus: businessTransactions.paymentStatus,
          fulfilmentStatus: businessTransactions.fulfilmentStatus,
          updatedAt: businessTransactions.updatedAt,
          customerName: customers.displayName,
          ownerName: users.name,
        })
        .from(businessTransactions)
        .innerJoin(customers, eq(customers.id, businessTransactions.customerId))
        .leftJoin(users, eq(users.id, businessTransactions.ownerId))
        .orderBy(desc(businessTransactions.updatedAt))
        .limit(30),
    ]);
  return {
    counts: {
      customers: Number(customersTotal[0]?.total ?? 0),
      suppliers: Number(suppliersTotal[0]?.total ?? 0),
      materials: Number(materialsTotal[0]?.total ?? 0),
      products: Number(productsTotal[0]?.total ?? 0),
      moulds: Number(mouldsTotal[0]?.total ?? 0),
      designs: Number(designsTotal[0]?.total ?? 0),
    },
    transactions,
  };
}

export async function getMasterDirectory() {
  const database = getDatabase();
  if (!database) return null;
  const [customerRows, supplierRows, materialRows, productRows, mouldRows, designRows] = await Promise.all([
    database.select().from(customers).orderBy(desc(customers.updatedAt)).limit(30),
    database.select().from(suppliers).orderBy(desc(suppliers.updatedAt)).limit(30),
    database.select().from(materials).orderBy(desc(materials.updatedAt)).limit(30),
    database
      .select({ ...getTableColumns(products), materialName: materials.name })
      .from(products)
      .leftJoin(materials, eq(materials.id, products.defaultMaterialId))
      .orderBy(desc(products.updatedAt))
      .limit(30),
    database
      .select({ ...getTableColumns(moulds), productName: products.name })
      .from(moulds)
      .leftJoin(products, eq(products.id, moulds.productId))
      .orderBy(desc(moulds.updatedAt))
      .limit(30),
    database
      .select({
        id: productDesignFiles.id,
        originalName: productDesignFiles.originalName,
        format: productDesignFiles.format,
        byteSize: productDesignFiles.byteSize,
        origin: productDesignFiles.origin,
        fileKind: productDesignFiles.fileKind,
        createdAt: productDesignFiles.createdAt,
        productName: products.name,
        customerName: customers.displayName,
      })
      .from(productDesignFiles)
      .leftJoin(products, eq(products.id, productDesignFiles.productId))
      .leftJoin(customers, eq(customers.id, productDesignFiles.customerId))
      .orderBy(desc(productDesignFiles.createdAt))
      .limit(30),
  ]);
  return { customerRows, supplierRows, materialRows, productRows, mouldRows, designRows };
}

export async function getActiveCustomerCount() {
  const database = getDatabase();
  if (!database) return 0;
  const [result] = await database.select({ total: count() }).from(customers).where(eq(customers.status, "active"));
  return Number(result?.total ?? 0);
}

export async function getDesignFile(id: string) {
  const database = getDatabase();
  if (!database) return null;
  const [file] = await database
    .select({
      id: productDesignFiles.id,
      originalName: productDesignFiles.originalName,
      format: productDesignFiles.format,
      byteSize: productDesignFiles.byteSize,
      origin: productDesignFiles.origin,
      fileKind: productDesignFiles.fileKind,
      productName: products.name,
      customerName: customers.displayName,
    })
    .from(productDesignFiles)
    .leftJoin(products, eq(products.id, productDesignFiles.productId))
    .leftJoin(customers, eq(customers.id, productDesignFiles.customerId))
    .where(eq(productDesignFiles.id, id));
  return file ?? null;
}

export async function getTransactionDetail(id: string) {
  const database = getDatabase();
  if (!database) return null;
  const [header] = await database
    .select({
      id: businessTransactions.id,
      referenceNo: businessTransactions.referenceNo,
      title: businessTransactions.title,
      commercialStatus: businessTransactions.commercialStatus,
      paymentStatus: businessTransactions.paymentStatus,
      fulfilmentStatus: businessTransactions.fulfilmentStatus,
      holdReason: businessTransactions.holdReason,
      dueAt: businessTransactions.dueAt,
      createdAt: businessTransactions.createdAt,
      updatedAt: businessTransactions.updatedAt,
      customerName: customers.displayName,
      customerEmail: customers.email,
      customerPhone: customers.phone,
      customerAddress: customers.deliveryAddress,
      ownerName: users.name,
    })
    .from(businessTransactions)
    .innerJoin(customers, eq(customers.id, businessTransactions.customerId))
    .leftJoin(users, eq(users.id, businessTransactions.ownerId))
    .where(eq(businessTransactions.id, id));
  if (!header) return null;

  const [lines, invoices, documents, entries, batches, deliveryRows, activity] = await Promise.all([
    database
      .select({ ...getTableColumns(transactionLines), productName: products.name, materialName: materials.name })
      .from(transactionLines)
      .leftJoin(products, eq(products.id, transactionLines.productId))
      .leftJoin(materials, eq(materials.id, transactionLines.materialId))
      .where(eq(transactionLines.transactionId, id))
      .orderBy(transactionLines.sortOrder),
    database
      .select()
      .from(transactionInvoices)
      .where(eq(transactionInvoices.transactionId, id))
      .orderBy(desc(transactionInvoices.createdAt)),
    database
      .select()
      .from(transactionDocuments)
      .where(eq(transactionDocuments.transactionId, id))
      .orderBy(desc(transactionDocuments.createdAt)),
    database
      .select({ ...getTableColumns(transactionFinancialEntries), verifiedByName: users.name })
      .from(transactionFinancialEntries)
      .leftJoin(users, eq(users.id, transactionFinancialEntries.verifiedBy))
      .where(eq(transactionFinancialEntries.transactionId, id))
      .orderBy(desc(transactionFinancialEntries.occurredAt)),
    database
      .select({ ...getTableColumns(productionBatches), productName: products.name, mouldName: moulds.name })
      .from(productionBatches)
      .leftJoin(products, eq(products.id, productionBatches.productId))
      .leftJoin(moulds, eq(moulds.id, productionBatches.mouldId))
      .where(eq(productionBatches.transactionId, id))
      .orderBy(desc(productionBatches.createdAt)),
    database.select().from(shipments).where(eq(shipments.transactionId, id)).orderBy(desc(shipments.createdAt)),
    database
      .select({ ...getTableColumns(auditLogs), actorName: users.name })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorId))
      .where(sql`${auditLogs.entityType} = 'transaction' and ${auditLogs.entityId} = ${id}`)
      .orderBy(desc(auditLogs.createdAt))
      .limit(30),
  ]);
  const quotedAmount = lines.reduce((total, line) => total + money(line.quantity) * money(line.unitPrice), 0);
  const invoiceAmount = invoices.reduce((total, invoice) => total + money(invoice.amount), 0);
  const receivedAmount = entries
    .filter((entry) => entry.status === "verified" && entry.direction === "in")
    .reduce((total, entry) => total + money(entry.amount), 0);
  const expenseAmount = entries
    .filter((entry) => entry.status === "verified" && entry.direction === "out")
    .reduce((total, entry) => total + money(entry.amount), 0);

  return {
    header,
    lines,
    invoices,
    documents,
    entries,
    batches,
    shipments: deliveryRows,
    activity,
    totals: {
      quotedAmount,
      invoiceAmount,
      receivedAmount,
      expenseAmount,
      outstandingAmount: Math.max(0, invoiceAmount - receivedAmount),
    },
  };
}
