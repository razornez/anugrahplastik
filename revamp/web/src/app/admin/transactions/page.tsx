import Link from "next/link";
import { TransactionCreateForm } from "@/components/transaction-create-form";
import { getActiveCustomerCount, getTransactionPage } from "@/features/operations/service";
import { requireOperationsAccess } from "@/features/operations/access";
import {
  transactionMainStage,
  transactionStageLabel,
  transactionStatusLabel,
} from "@/features/operations/transaction-status";
import { TransactionListScrollRestorer, TransactionResultLink } from "@/components/transaction-list-navigation";

export const instant = false;

function transactionUrl(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  return search.size ? `/admin/transactions?${search}` : "/admin/transactions";
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; cursor?: string; direction?: string }>;
}) {
  const user = await requireOperationsAccess();
  const query = await searchParams;
  const [transactions, customerCount] = await Promise.all([
    getTransactionPage({
      search: query.q,
      status: query.status,
      cursor: query.cursor,
      direction: query.direction === "previous" ? "previous" : "next",
    }),
    getActiveCustomerCount(),
  ]);
  const listUrl = transactionUrl({
    q: query.q,
    status: query.status,
    cursor: query.cursor,
    direction: query.direction,
  });

  return (
    <section className="operations-page transactions-page">
      <header className="operations-head transactions-page__head">
        <div>
          <p className="eyebrow">Transaksi</p>
          <h1>Semua pekerjaan, jelas tahapnya.</h1>
          <p>Pilih pekerjaan untuk melihat tindakan berikutnya, atau mulai transaksi baru dari kebutuhan customer.</p>
        </div>
        <TransactionCreateForm customerCount={customerCount} />
      </header>

      {!customerCount ? (
        <p className="operations-notice">Tambahkan customer di Data master sebelum membuat transaksi pertama.</p>
      ) : null}
      <div className="transaction-workspace">
        <TransactionListScrollRestorer listUrl={listUrl} />
        <aside className="transaction-list">
          <form className="transaction-list-head" method="get">
            <strong>Semua transaksi</strong>
            <label className="sr-only" htmlFor="transaction-search">
              Cari pekerjaan atau customer
            </label>
            <input
              id="transaction-search"
              name="q"
              defaultValue={query.q}
              aria-label="Cari transaksi"
              placeholder="Cari pekerjaan atau customer"
            />
            <select name="status" defaultValue={query.status ?? ""} aria-label="Filter status penawaran">
              <option value="">Semua status penawaran</option>
              <option value="quotation">Penawaran</option>
              <option value="po_received">PO diterima</option>
              <option value="contract">Kontrak</option>
              <option value="completed">Selesai</option>
            </select>
            <button type="submit">Cari</button>
          </form>
          {transactions?.rows.length ? (
            transactions.rows.map((transaction) => (
              <TransactionResultLink
                href={`/admin/transactions/${transaction.id}?returnTo=${encodeURIComponent(listUrl)}`}
                returnTo={listUrl}
                key={transaction.id}
              >
                <span className="transaction-mark">{transaction.referenceNo.slice(-2)}</span>
                <span>
                  <strong>{transaction.title}</strong>
                  <small>
                    {transaction.referenceNo} · {transaction.customerName}
                  </small>
                  <small>
                    Penawaran: {transactionStatusLabel("commercial", transaction.commercialStatus)} · Pembayaran:{" "}
                    {transactionStatusLabel("payment", transaction.paymentStatus)} · Produksi:{" "}
                    {transactionStatusLabel("fulfilment", transaction.fulfilmentStatus)}
                  </small>
                </span>
                <em className="transaction-status">
                  Tahap utama · {transactionStageLabel(transactionMainStage(transaction))}
                </em>
              </TransactionResultLink>
            ))
          ) : (
            <div className="transaction-list-empty">
              <p className="empty-copy">
                {query.q || query.status
                  ? `Tidak ada transaksi yang cocok${query.q ? ` dengan “${query.q}”` : " dengan filter ini"}.`
                  : "Belum ada transaksi. Mulai dari customer dan penawaran pertama."}
              </p>
              {query.q || query.status ? <Link href="/admin/transactions">Hapus pencarian dan filter</Link> : null}
            </div>
          )}
          <nav className="directory-pagination" aria-label="Pindah halaman transaksi">
            {transactions?.hasPrevious ? (
              <Link
                href={transactionUrl({
                  q: query.q,
                  status: query.status,
                  cursor: transactions.previousCursor ?? undefined,
                  direction: "previous",
                })}
              >
                ← Sebelumnya
              </Link>
            ) : (
              <span>← Sebelumnya</span>
            )}
            <span>25 transaksi per halaman</span>
            {transactions?.hasNext ? (
              <Link
                href={transactionUrl({
                  q: query.q,
                  status: query.status,
                  cursor: transactions.nextCursor ?? undefined,
                  direction: "next",
                })}
              >
                Berikutnya →
              </Link>
            ) : (
              <span>Berikutnya →</span>
            )}
          </nav>
        </aside>
        <section className="transaction-empty-detail">
          <p className="eyebrow">Pilih pekerjaan</p>
          <h2>Semua keputusan penting tinggal di satu tempat.</h2>
          <p>
            Masuk ke satu transaksi untuk meninjau jalur komersial, pembayaran, produksi &amp; pengiriman, serta
            riwayatnya.
          </p>
        </section>
      </div>
      {user.role === "sales" ? (
        <p className="operations-footnote">
          Anda dapat membuat customer, membuat transaksi, dan menyiapkan penawaran. Verifikasi pembayaran dan pelepasan
          produksi memerlukan persetujuan administrator.
        </p>
      ) : null}
    </section>
  );
}
