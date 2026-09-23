import Link from "next/link";
import { TransactionCreateForm } from "@/components/transaction-create-form";
import { getActiveCustomerCount, getTransactionPage } from "@/features/operations/service";
import { requireOperationsAccess } from "@/features/operations/access";

export const instant = false;

function stageLabel(value: string) {
  const labels: Record<string, string> = {
    quotation: "Penawaran disiapkan",
    po_received: "PO diterima",
    contract: "Kontrak / invoice",
    completed: "Selesai",
    cancelled: "Dibatalkan",
  };
  return labels[value] ?? value;
}

function transactionUrl(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  return `/admin/transactions?${search}`;
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
        <aside className="transaction-list">
          <form className="transaction-list-head" method="get">
            <strong>Semua transaksi</strong>
            <input
              name="q"
              defaultValue={query.q}
              aria-label="Cari transaksi"
              placeholder="Cari pekerjaan atau customer"
            />
            <select name="status" defaultValue={query.status ?? ""} aria-label="Status transaksi">
              <option value="">Semua tahap</option>
              <option value="quotation">Penawaran</option>
              <option value="po_received">PO diterima</option>
              <option value="contract">Kontrak</option>
              <option value="completed">Selesai</option>
            </select>
            <button type="submit">Cari</button>
          </form>
          {transactions?.rows.length ? (
            transactions.rows.map((transaction) => (
              <Link href={`/admin/transactions/${transaction.id}`} key={transaction.id}>
                <span className="transaction-mark">{transaction.referenceNo.slice(-2)}</span>
                <span>
                  <strong>{transaction.title}</strong>
                  <small>
                    {transaction.referenceNo} · {transaction.customerName}
                  </small>
                </span>
                <em className={`transaction-status transaction-status--${transaction.commercialStatus}`}>
                  {stageLabel(transaction.commercialStatus)}
                </em>
              </Link>
            ))
          ) : (
            <p className="empty-copy">Belum ada transaksi. Mulai dari customer dan penawaran pertama.</p>
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
