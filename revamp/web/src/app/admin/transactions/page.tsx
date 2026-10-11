import Link from "next/link";
import { AdminPageHeader } from "@/components/admin-page-header";
import { TransactionCreateForm } from "@/components/transaction-create-form";
import { TransactionListScrollRestorer, TransactionResultLink } from "@/components/transaction-list-navigation";
import { getActiveCustomerCount, getTransactionPage } from "@/features/operations/service";
import { requireOperationsAccess } from "@/features/operations/access";
import { transactionStatusLabel } from "@/features/operations/transaction-status";
import { workspaceMoney } from "@/features/operations/transaction-workspace";
import styles from "./transactions.module.css";

export const instant = false;
type Query = {
  q?: string;
  status?: string;
  payment?: string;
  fulfilment?: string;
  cursor?: string;
  direction?: string;
};
function transactionUrl(params: Query) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  return search.size ? `/admin/transactions?${search}` : "/admin/transactions";
}
const stepLabels = {
  quote: "Penawaran",
  order: "PO pelanggan",
  payment: "Invoice & pembayaran",
  production: "Produksi",
  delivery: "Surat jalan",
  handover: "STB bertanda tangan",
};
const updated = (value: Date) =>
  value.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await requireOperationsAccess();
  const raw = await searchParams;
  const query = { ...raw, status: raw.status === "contract" ? "invoice_issued" : raw.status };
  const [transactions, customerCount] = await Promise.all([
    getTransactionPage({
      search: query.q,
      status: query.status,
      payment: query.payment,
      fulfilment: query.fulfilment,
      cursor: query.cursor,
      direction: query.direction === "previous" ? "previous" : "next",
    }),
    getActiveCustomerCount(),
  ]);
  const listUrl = transactionUrl(query);
  const resetUrl = transactionUrl({});
  const filtered = Boolean(query.q || query.status || query.payment || query.fulfilment);
  return (
    <section className={styles.workspace}>
      <TransactionListScrollRestorer listUrl={listUrl} />
      <AdminPageHeader
        title="Transaksi"
        description="Kelola penawaran, tagihan, produksi, dan pengiriman pelanggan."
        actions={<TransactionCreateForm customerCount={customerCount} />}
      />
      {!customerCount ? (
        <p className="operations-notice">Tambahkan pelanggan di Data master sebelum membuat transaksi.</p>
      ) : null}
      <form className={styles.filters} method="get">
        <label className={styles.search}>
          Cari transaksi
          <input name="q" defaultValue={query.q} placeholder="Pelanggan, pekerjaan, atau nomor" />
        </label>
        <label>
          Komersial
          <select name="status" defaultValue={query.status ?? ""}>
            <option value="">Semua status</option>
            <option value="quotation">Penawaran</option>
            <option value="po_received">PO diterima</option>
            <option value="invoice_issued">Invoice terbit</option>
            <option value="completed">Selesai</option>
            <option value="cancelled">Dibatalkan</option>
          </select>
        </label>
        <label>
          Pembayaran
          <select name="payment" defaultValue={query.payment ?? ""}>
            <option value="">Semua status</option>
            <option value="awaiting_invoice">Belum ada invoice</option>
            <option value="awaiting_payment">Menunggu pembayaran</option>
            <option value="payment_recorded">Menunggu verifikasi</option>
            <option value="partial">Dibayar sebagian</option>
            <option value="verified">Pembayaran terverifikasi</option>
          </select>
        </label>
        <label>
          Produksi / pengiriman
          <select name="fulfilment" defaultValue={query.fulfilment ?? ""}>
            <option value="">Semua status</option>
            {["not_released", "released", "sample", "production", "shipping", "bast_pending", "completed"].map(
              (value) => (
                <option key={value} value={value}>
                  {transactionStatusLabel("fulfilment", value)}
                </option>
              ),
            )}
          </select>
        </label>
        <button type="submit">Terapkan</button>
        {filtered ? <Link href={resetUrl}>Hapus filter</Link> : null}
      </form>
      <div className={styles.list}>
        <div className={styles.listCaption}>
          <strong>{transactions?.rows.length ?? 0} transaksi di halaman ini</strong>
          <span>Terbaru diperbarui · WIB</span>
        </div>
        <div className={styles.columnHead} aria-hidden="true">
          <span>Pelanggan & pekerjaan</span>
          <span>Referensi</span>
          <span>Tahap & tindak lanjut</span>
          <span>Pembayaran</span>
          <span>Nilai & sisa invoice</span>
          <span>Penanggung jawab</span>
          <span>Diperbarui</span>
        </div>
        {!transactions ? (
          <div className={styles.empty} role="alert">
            <h2>Database belum tersedia</h2>
            <p>Daftar belum dapat dibaca. Ini bukan berarti transaksi kosong.</p>
            <Link href={listUrl}>Coba lagi</Link>
          </div>
        ) : transactions.rows.length ? (
          transactions.rows.map((row) => (
            <article className={styles.row} key={row.id}>
              <div className={styles.identity}>
                <span>{row.customerName}</span>
                <TransactionResultLink
                  href={`/admin/transactions/${row.id}?step=${row.workspace.step}&returnTo=${encodeURIComponent(listUrl)}`}
                  returnTo={listUrl}
                >
                  {row.title}
                </TransactionResultLink>
              </div>
              <div className={styles.reference}> {row.referenceNo}</div>
              <div className={styles.stage}>
                <strong>{stepLabels[row.workspace.step]}</strong>
                <small>{row.workspace.action}</small>
              </div>
              <div className={styles.payment}>
                <span className={styles.badge}>{row.workspace.paymentLabel}</span>
                {row.workspace.pendingPayment ? (
                  <small className={styles.attention}>Pembayaran menunggu verifikasi</small>
                ) : null}
              </div>
              <div className={styles.amount}>
                <small>Penawaran</small>
                <strong>{workspaceMoney(row.workspace.quote)}</strong>
                <small>Sisa invoice terbit</small>
                <span>
                  {row.workspace.issuedCount ? workspaceMoney(row.workspace.outstanding) : "Belum ada invoice"}
                </span>
                {row.workspace.overpayment && row.workspace.overpayment !== "0.00" ? (
                  <small>Kelebihan: {workspaceMoney(row.workspace.overpayment)}</small>
                ) : null}
              </div>
              <div className={styles.owner}>{row.ownerName ?? "Belum ada penanggung jawab"}</div>
              <time className={styles.updated} dateTime={row.updatedAt.toISOString()}>
                {updated(row.updatedAt)} WIB
              </time>
              <details className={styles.mobileDetails}>
                <summary>Informasi pendukung</summary>
                <dl>
                  <dt>Referensi</dt>
                  <dd>{row.referenceNo}</dd>
                  <dt>Komersial</dt>
                  <dd>{transactionStatusLabel("commercial", row.commercialStatus)}</dd>
                  <dt>Produksi / pengiriman</dt>
                  <dd>{transactionStatusLabel("fulfilment", row.fulfilmentStatus)}</dd>
                  <dt>Penanggung jawab</dt>
                  <dd>{row.ownerName ?? "Belum ditentukan"}</dd>
                  <dt>Diperbarui</dt>
                  <dd>{updated(row.updatedAt)} WIB</dd>
                </dl>
              </details>
            </article>
          ))
        ) : (
          <div className={styles.empty}>
            <h2>{filtered ? "Tidak ada transaksi yang cocok" : "Belum ada transaksi pelanggan"}</h2>
            <p>
              {filtered
                ? "Ubah pencarian atau hapus filter untuk melihat transaksi lainnya."
                : "Mulai dengan membuat transaksi dan rincian penawaran pelanggan."}
            </p>
            {filtered ? <Link href={resetUrl}>Hapus pencarian dan filter</Link> : null}
          </div>
        )}
        <nav className={styles.pagination} aria-label="Halaman transaksi">
          {transactions?.hasPrevious ? (
            <Link
              href={transactionUrl({
                ...query,
                cursor: transactions.previousCursor ?? undefined,
                direction: "previous",
              })}
            >
              ← Sebelumnya
            </Link>
          ) : (
            <span>← Sebelumnya</span>
          )}
          <span>25 per halaman</span>
          {transactions?.hasNext ? (
            <Link href={transactionUrl({ ...query, cursor: transactions.nextCursor ?? undefined, direction: "next" })}>
              Berikutnya →
            </Link>
          ) : (
            <span>Berikutnya →</span>
          )}
        </nav>
      </div>
      {user.role === "sales" ? (
        <p className={styles.footnote}>
          Verifikasi pembayaran dan pelepasan produksi memerlukan persetujuan administrator.
        </p>
      ) : null}
    </section>
  );
}
