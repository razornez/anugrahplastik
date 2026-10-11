import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { businessTransactions, customers, transactionDocuments, users } from "@/lib/database/schema";
import { transactionPickerDataClass, transactionSearchPattern } from "@/features/integrations/transaction-picker-model";

export async function GET(request: Request) {
  const user = await getSession();
  const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };
  if (!user || !["admin", "sales"].includes(user.role))
    return Response.json({ error: "Akses ditolak." }, { status: 403, headers });
  const params = new URL(request.url).searchParams;
  const query = params.get("q")?.trim() ?? "";
  if (query.length > 120) return Response.json({ error: "Pencarian maksimal 120 karakter." }, { status: 400, headers });
  const database = getDatabase();
  if (!database) return Response.json({ error: "Database belum terhubung." }, { status: 503, headers });
  try {
    const pattern = transactionSearchPattern(query);
    const rows = await database
      .select({
        id: businessTransactions.id,
        referenceNo: businessTransactions.referenceNo,
        title: businessTransactions.title,
        customerName: customers.displayName,
        ownerName: users.name,
        updatedAt: businessTransactions.updatedAt,
        dataClass: businessTransactions.dataClass,
      })
      .from(businessTransactions)
      .innerJoin(customers, eq(customers.id, businessTransactions.customerId))
      .leftJoin(users, eq(users.id, businessTransactions.ownerId))
      .where(
        and(
          eq(businessTransactions.dataClass, transactionPickerDataClass()),
          query
            ? or(
                ilike(businessTransactions.title, pattern),
                ilike(businessTransactions.referenceNo, pattern),
                ilike(businessTransactions.quotationNo, pattern),
                ilike(customers.displayName, pattern),
              )
            : undefined,
        ),
      )
      .orderBy(desc(businessTransactions.updatedAt), desc(businessTransactions.id))
      .limit(10);
    const photos = rows.length
      ? await database
          .select({
            id: transactionDocuments.id,
            transactionId: transactionDocuments.transactionId,
          })
          .from(transactionDocuments)
          .where(
            and(
              inArray(
                transactionDocuments.transactionId,
                rows.map((row) => row.id),
              ),
              eq(transactionDocuments.type, "quotation_attachment"),
              sql`${transactionDocuments.storagePath} is not null`,
              sql`${transactionDocuments.originalName} ~* '\\.(png|jpe?g|webp)$'`,
            ),
          )
          .orderBy(desc(transactionDocuments.createdAt))
      : [];
    return Response.json(
      {
        items: rows.map((row) => ({
          ...row,
          updatedAt: row.updatedAt.toISOString(),
          photoId: photos.find((photo) => photo.transactionId === row.id)?.id ?? null,
        })),
      },
      { headers },
    );
  } catch {
    return Response.json({ error: "Transaksi belum berhasil dimuat. Coba lagi." }, { status: 503, headers });
  }
}
