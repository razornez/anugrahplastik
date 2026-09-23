import Link from "next/link";
import { TransactionCreateForm } from "@/components/transaction-create-form";
import { getActiveCustomerCount, getOperationsOverview } from "@/features/operations/service";
import { requireOperationsAccess } from "@/features/operations/access";

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

export default async function TransactionsPage() {
  const user = await requireOperationsAccess();
  const [overview, customerCount] = await Promise.all([getOperationsOverview(), getActiveCustomerCount()]);

  return (
    <section className="operations-page">
      <header className="operations-head operations-head--with-action">
        <div>
          <p className="eyebrow">Transaksi</p>
          <h1>Jaga pekerjaan tetap bergerak dari penawaran sampai serah terima.</h1>
          <p>
            Setiap transaksi menyatukan dokumen, pembayaran, produksi, pengiriman, dan aktivitas dalam satu nomor kerja.
          </p>
        </div>
        <TransactionCreateForm customerCount={customerCount} />
      </header>

      {!customerCount ? (
        <p className="operations-notice">Tambahkan customer di Data master sebelum membuat transaksi pertama.</p>
      ) : null}
      <div className="transaction-workspace">
        <aside className="transaction-list">
          <div className="transaction-list-head">
            <strong>Semua transaksi</strong>
            <span>{overview?.transactions.length ?? 0} pekerjaan</span>
          </div>
          {overview?.transactions.length ? (
            overview.transactions.map((transaction) => (
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
