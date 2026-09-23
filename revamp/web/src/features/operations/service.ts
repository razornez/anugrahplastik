import { and, asc, count, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
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
import { decodeTimeCursor, encodeTimeCursor } from "@/lib/pagination/cursor";

export const masterKinds = ["customers", "suppliers", "materials", "products", "moulds", "designs"] as const;
export type MasterKind = (typeof masterKinds)[number];
export type DirectoryQuery = {
  query?: string;
  status?: string;
  order?: "newest" | "oldest";
  cursor?: string;
  direction?: "next" | "previous";
};
export type DirectoryRow = { id: string; code: string; title: string; detail: string; status: string; createdAt: Date };

function money(value: string | number | null) {
  return Number(value ?? 0);
}

export async function getOperationsOverview() {
  const database = getDatabase();
  if (!database) return null;
  const [customersTotal, suppliersTotal, materialsTotal, productsTotal, mouldsTotal, designsTotal] = await Promise.all([
    database.select({ total: sql<number>`count(*)` }).from(customers),
    database.select({ total: sql<number>`count(*)` }).from(suppliers),
    database.select({ total: sql<number>`count(*)` }).from(materials),
    database.select({ total: sql<number>`count(*)` }).from(products),
    database.select({ total: sql<number>`count(*)` }).from(moulds),
    database.select({ total: sql<number>`count(*)` }).from(productDesignFiles),
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

export async function getMasterDirectoryPage(kind: MasterKind, query: DirectoryQuery) {
  const database = getDatabase();
  if (!database) return null;
  const term = query.query?.trim().slice(0, 120) ?? "";
  const status = query.status?.trim().slice(0, 40) ?? "";
  const cursor = decodeTimeCursor(query.cursor);
  const backwards = query.direction === "previous";
  const newestFirst = query.order !== "oldest";
  const cursorDate = cursor ? new Date(cursor.createdAt) : null;
  const cursorId = cursor?.id ?? "";
  const ascending = newestFirst ? backwards : !backwards;
  const cursorWhere = (createdAt: AnyPgColumn, id: AnyPgColumn) =>
    cursorDate
      ? ascending
        ? or(sql`${createdAt} > ${cursorDate}`, and(eq(createdAt, cursorDate), sql`${id} > ${cursorId}`))
        : or(sql`${createdAt} < ${cursorDate}`, and(eq(createdAt, cursorDate), sql`${id} < ${cursorId}`))
      : undefined;
  const ordering = (createdAt: AnyPgColumn, id: AnyPgColumn) =>
    ascending ? [asc(createdAt), asc(id)] : [desc(createdAt), desc(id)];

  let rows: DirectoryRow[];
  if (kind === "customers") {
    rows = await database
      .select({
        id: customers.id,
        code: customers.code,
        title: customers.displayName,
        detail: sql<string>`coalesce(${customers.phone}, ${customers.email}, 'Kontak belum diisi')`,
        status: customers.status,
        createdAt: customers.createdAt,
      })
      .from(customers)
      .where(
        and(
          status ? eq(customers.status, status) : undefined,
          term ? or(ilike(customers.displayName, `%${term}%`), ilike(customers.code, `%${term}%`)) : undefined,
          cursorWhere(customers.createdAt, customers.id),
        ),
      )
      .orderBy(...ordering(customers.createdAt, customers.id))
      .limit(26);
  } else if (kind === "suppliers") {
    rows = await database
      .select({
        id: suppliers.id,
        code: suppliers.code,
        title: suppliers.name,
        detail: sql<string>`coalesce(${suppliers.contactName}, ${suppliers.phone}, 'Kontak belum diisi')`,
        status: suppliers.status,
        createdAt: suppliers.createdAt,
      })
      .from(suppliers)
      .where(
        and(
          status ? eq(suppliers.status, status) : undefined,
          term ? or(ilike(suppliers.name, `%${term}%`), ilike(suppliers.code, `%${term}%`)) : undefined,
          cursorWhere(suppliers.createdAt, suppliers.id),
        ),
      )
      .orderBy(...ordering(suppliers.createdAt, suppliers.id))
      .limit(26);
  } else if (kind === "materials") {
    rows = await database
      .select({
        id: materials.id,
        code: materials.code,
        title: materials.name,
        detail: sql<string>`concat_ws(' · ', ${materials.polymerFamily}, ${materials.grade})`,
        status: materials.status,
        createdAt: materials.createdAt,
      })
      .from(materials)
      .where(
        and(
          status ? eq(materials.status, status) : undefined,
          term ? or(ilike(materials.name, `%${term}%`), ilike(materials.code, `%${term}%`)) : undefined,
          cursorWhere(materials.createdAt, materials.id),
        ),
      )
      .orderBy(...ordering(materials.createdAt, materials.id))
      .limit(26);
  } else if (kind === "products") {
    rows = await database
      .select({
        id: products.id,
        code: products.sku,
        title: products.name,
        detail: sql<string>`coalesce(${products.unitWeightGrams}::text || ' gram / ' || ${products.unit}, 'Berat belum diisi')`,
        status: products.status,
        createdAt: products.createdAt,
      })
      .from(products)
      .where(
        and(
          status ? eq(products.status, status) : undefined,
          term ? or(ilike(products.name, `%${term}%`), ilike(products.sku, `%${term}%`)) : undefined,
          cursorWhere(products.createdAt, products.id),
        ),
      )
      .orderBy(...ordering(products.createdAt, products.id))
      .limit(26);
  } else if (kind === "moulds") {
    rows = await database
      .select({
        id: moulds.id,
        code: moulds.code,
        title: moulds.name,
        detail: sql<string>`coalesce(${moulds.cavityCount}::text || ' cavity', 'Cavity belum diisi')`,
        status: moulds.status,
        createdAt: moulds.createdAt,
      })
      .from(moulds)
      .where(
        and(
          status ? eq(moulds.status, status) : undefined,
          term ? or(ilike(moulds.name, `%${term}%`), ilike(moulds.code, `%${term}%`)) : undefined,
          cursorWhere(moulds.createdAt, moulds.id),
        ),
      )
      .orderBy(...ordering(moulds.createdAt, moulds.id))
      .limit(26);
  } else {
    rows = await database
      .select({
        id: productDesignFiles.id,
        code: sql<string>`upper(${productDesignFiles.format})`,
        title: productDesignFiles.originalName,
        detail: sql<string>`coalesce(${products.name}, ${customers.displayName}, 'Belum ditautkan')`,
        status: productDesignFiles.origin,
        createdAt: productDesignFiles.createdAt,
      })
      .from(productDesignFiles)
      .leftJoin(products, eq(products.id, productDesignFiles.productId))
      .leftJoin(customers, eq(customers.id, productDesignFiles.customerId))
      .where(
        and(
          status ? eq(productDesignFiles.origin, status) : undefined,
          term ? ilike(productDesignFiles.originalName, `%${term}%`) : undefined,
          cursorWhere(productDesignFiles.createdAt, productDesignFiles.id),
        ),
      )
      .orderBy(...ordering(productDesignFiles.createdAt, productDesignFiles.id))
      .limit(26);
  }

  const hasAdjacent = rows.length > 25;
  const pageRows = rows.slice(0, 25);
  const visible = backwards ? [...pageRows].reverse() : pageRows;
  return {
    rows: visible,
    nextCursor: visible.length ? encodeTimeCursor(visible.at(-1)!) : null,
    previousCursor: visible.length ? encodeTimeCursor(visible[0]) : null,
    hasNext: backwards ? Boolean(query.cursor) : hasAdjacent,
    hasPrevious: backwards ? hasAdjacent : Boolean(query.cursor),
  };
}

export async function getActiveCustomerCount() {
  const database = getDatabase();
  if (!database) return 0;
  const [result] = await database.select({ total: count() }).from(customers).where(eq(customers.status, "active"));
  return Number(result?.total ?? 0);
}

export async function getTransactionPage(
  query: { search?: string; status?: string; cursor?: string; direction?: "next" | "previous" } = {},
) {
  const database = getDatabase();
  if (!database) return null;
  const cursor = decodeTimeCursor(query.cursor);
  const cursorDate = cursor ? new Date(cursor.createdAt) : null;
  const cursorId = cursor?.id ?? "";
  const backwards = query.direction === "previous";
  const conditions = and(
    query.status ? eq(businessTransactions.commercialStatus, query.status) : undefined,
    query.search
      ? or(
          ilike(businessTransactions.title, `%${query.search.slice(0, 120)}%`),
          ilike(businessTransactions.referenceNo, `%${query.search.slice(0, 120)}%`),
          ilike(customers.displayName, `%${query.search.slice(0, 120)}%`),
        )
      : undefined,
    cursorDate
      ? backwards
        ? or(
            sql`${businessTransactions.updatedAt} > ${cursorDate}`,
            and(eq(businessTransactions.updatedAt, cursorDate), sql`${businessTransactions.id} > ${cursorId}`),
          )
        : or(
            sql`${businessTransactions.updatedAt} < ${cursorDate}`,
            and(eq(businessTransactions.updatedAt, cursorDate), sql`${businessTransactions.id} < ${cursorId}`),
          )
      : undefined,
  );
  const loaded = await database
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
    .where(conditions)
    .orderBy(
      ...(backwards
        ? [asc(businessTransactions.updatedAt), asc(businessTransactions.id)]
        : [desc(businessTransactions.updatedAt), desc(businessTransactions.id)]),
    )
    .limit(26);
  const hasAdjacent = loaded.length > 25;
  const rows = backwards ? loaded.slice(0, 25).reverse() : loaded.slice(0, 25);
  return {
    rows,
    hasNext: backwards ? Boolean(query.cursor) : hasAdjacent,
    hasPrevious: backwards ? hasAdjacent : Boolean(query.cursor),
    nextCursor: rows.length ? encodeTimeCursor({ id: rows.at(-1)!.id, createdAt: rows.at(-1)!.updatedAt }) : null,
    previousCursor: rows.length ? encodeTimeCursor({ id: rows[0].id, createdAt: rows[0].updatedAt }) : null,
  };
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
