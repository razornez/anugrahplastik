"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import {
  auditLogs,
  businessTransactions,
  financeEntries,
  financeEntryDocuments,
  shipments,
  transactionDocuments,
  transactionFileCleanupJobs,
  transactionInvoices,
} from "@/lib/database/schema";

export type TransactionDeletionImpact = {
  referenceNo: string;
  documents: number;
  invoices: number;
  payments: number;
  batches: number;
  shipments: number;
  emails: number;
  designFiles: number;
  privateFiles: number;
  uncertain: boolean;
};

type Database = NonNullable<ReturnType<typeof getDatabase>>;

async function readImpact(database: Database, id: string): Promise<TransactionDeletionImpact | null> {
  const result = await database.execute(sql`
    select t.reference_no as "referenceNo",
      (select count(*)::int from transaction_documents d where d.transaction_id=t.id) as documents,
      (select count(*)::int from transaction_invoices i where i.transaction_id=t.id) as invoices,
      ((select count(*)::int from transaction_financial_entries p where p.transaction_id=t.id) +
       (select count(*)::int from finance_entries f where f.transaction_id=t.id)) as payments,
      (select count(*)::int from production_batches b where b.transaction_id=t.id) as batches,
      (select count(*)::int from shipments s where s.transaction_id=t.id) as shipments,
      ((select count(*)::int from cs_emails e where e.linked_transaction_id=t.id) +
       (select count(*)::int from cs_email_outbox o where o.linked_transaction_id=t.id)) as emails,
      (select count(*)::int from product_design_files f where f.transaction_id=t.id) as "designFiles",
      ((select count(*)::int from transaction_documents d where d.transaction_id=t.id and d.storage_path is not null) +
       (select count(*)::int from finance_entry_documents fd join finance_entries f on f.id=fd.entry_id where f.transaction_id=t.id)) as "privateFiles",
      (exists(select 1 from transaction_documents d where d.transaction_id=t.id and
        (d.status in ('generating','needs_review') or d.payload->>'sendState' in ('pending','uncertain'))) or
       exists(select 1 from cs_email_outbox o where o.linked_transaction_id=t.id and
         o.status not in ('sent','failed','partial'))) as uncertain
    from business_transactions t where t.id=${id}
  `);
  return (result.rows[0] as TransactionDeletionImpact | undefined) ?? null;
}

export async function getTransactionDeletionImpact(id: string) {
  const user = await getSession();
  if (user?.role !== "admin") return null;
  const database = getDatabase();
  if (!database) return null;
  return readImpact(database, id);
}

export type DeleteTransactionState = { ok: boolean; message: string };

export async function deleteTransactionPermanently(
  _previous: DeleteTransactionState,
  formData: FormData,
): Promise<DeleteTransactionState> {
  const user = await getSession();
  if (user?.role !== "admin") return { ok: false, message: "Hanya Admin yang dapat menghapus transaksi." };
  const id = String(formData.get("transactionId") ?? "");
  const referenceNo = String(formData.get("referenceNo") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id) || !referenceNo || formData.get("dummyConfirmed") !== "yes") {
    return { ok: false, message: "Masukkan nomor transaksi dan centang pernyataan data dummy/testing." };
  }
  const database = getDatabase();
  if (!database) return { ok: false, message: "Database belum tersedia. Tidak ada data yang dihapus." };
  try {
    await database.transaction(async (tx) => {
      await tx.execute(sql`select id from business_transactions where id=${id} for update`);
      const impact = await readImpact(tx as unknown as Database, id);
      if (!impact || impact.referenceNo !== referenceNo)
        throw new Error("Nomor transaksi tidak cocok. Tidak ada data yang dihapus.");
      if (impact.uncertain)
        throw new Error("PDF atau email masih belum pasti. Periksa statusnya sebelum menghapus transaksi.");
      const [documents, financeFiles] = await Promise.all([
        tx
          .select({ path: transactionDocuments.storagePath })
          .from(transactionDocuments)
          .where(eq(transactionDocuments.transactionId, id)),
        tx
          .select({ path: financeEntryDocuments.storagePath })
          .from(financeEntryDocuments)
          .innerJoin(financeEntries, eq(financeEntries.id, financeEntryDocuments.entryId))
          .where(eq(financeEntries.transactionId, id)),
      ]);
      const paths = [
        ...new Set(
          [...documents, ...financeFiles].map((row) => row.path).filter((path): path is string => Boolean(path)),
        ),
      ];
      if (paths.length) {
        await tx
          .insert(transactionFileCleanupJobs)
          .values(paths.map((path) => ({ storagePath: path, transactionReference: referenceNo })))
          .onConflictDoNothing({ target: transactionFileCleanupJobs.storagePath });
      }
      await tx.delete(transactionInvoices).where(eq(transactionInvoices.transactionId, id));
      await tx.delete(shipments).where(eq(shipments.transactionId, id));
      await tx.delete(financeEntries).where(eq(financeEntries.transactionId, id));
      await tx.delete(businessTransactions).where(eq(businessTransactions.id, id));
      await tx.insert(auditLogs).values({
        actorId: user.id,
        action: "transaction.deleted_permanently",
        entityType: "transaction",
        entityId: id,
        metadata: { ...impact, deletedAt: new Date().toISOString(), privateCleanupQueued: paths.length },
      });
    });
    revalidatePath("/admin/transactions");
  } catch (error) {
    const message =
      error instanceof Error && /tidak cocok|belum pasti/.test(error.message)
        ? error.message
        : "Penghapusan gagal dan dibatalkan seluruhnya. Periksa status relasi atau hubungi administrator teknis.";
    return { ok: false, message };
  }
  redirect("/admin/transactions?notice=deleted");
}
