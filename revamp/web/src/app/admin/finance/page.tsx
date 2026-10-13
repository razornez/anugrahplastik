import Link from "next/link";
import { headers } from "next/headers";
import { AdminPageHeader } from "@/components/admin-page-header";
import { requireOperationsAccess } from "@/features/operations/access";
import {
  createFinanceAccount,
  createFinanceEntry,
  reconcileFinanceEntry,
  rejectFinanceEntry,
  verifyFinanceEntry,
} from "@/features/finance/actions";
import { getFinanceWorkspace, type FinanceQuery } from "@/features/finance/service";
import { FinanceComposer } from "./finance-composer";
import styles from "./finance.module.css";

export const instant = false;

const rupiah = (value: number | string) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    Number(value),
  );
const dateWib = (value: Date) =>
  new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium" }).format(value);
const dateInputWib = (value: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
const statusLabel: Record<string, string> = {
  pending: "Menunggu verifikasi",
  verified: "Terverifikasi",
  rejected: "Ditolak",
  void: "Dibatalkan",
};

export default async function FinancePage({ searchParams }: { searchParams: Promise<FinanceQuery> }) {
  await requireOperationsAccess();
  const isLocalFinanceE2e = process.env.NODE_ENV === "development" && (await headers()).get("x-finance-e2e") === "1";
  const query = await searchParams;
  const data = await getFinanceWorkspace(query);
  const defaultDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  if (!data) {
    return (
      <section className={styles.workspace}>
        <AdminPageHeader title="Keuangan" description="Pusat arus dana operasional." />
        <div className={styles.empty}>
          <h2>Database belum tersedia</h2>
          <p>Data Keuangan belum dapat dibaca. Coba lagi setelah server database siap.</p>
        </div>
      </section>
    );
  }
  const hasAccount = data.accounts.length > 0;
  const exportQuery = new URLSearchParams({
    from: query.from ?? dateInputWib(data.range.from),
    to: query.to ?? dateInputWib(data.range.to),
    ...(query.account ? { account: query.account } : {}),
  });
  const exportSummary = `${dateWib(data.range.from)} - ${dateWib(data.range.to)}${
    query.account
      ? ` - ${data.accounts.find((account) => account.id === query.account)?.name ?? "rekening dipilih"}`
      : " - semua rekening"
  }`;
  return (
    <section className={styles.workspace}>
      <AdminPageHeader
        title="Keuangan"
        description="Pantau bank, piutang, pengeluaran, dan catatan yang menunggu verifikasi."
      />
      <nav className={styles.navigation} aria-label="Navigasi Keuangan">
        <a href="#ringkasan">Ringkasan</a>
        <a href="#catatan">Catatan bank</a>
        <a href="#piutang">Piutang</a>
      </nav>
      <form className={styles.filters} method="get">
        <label>
          Dari
          <input type="date" name="from" defaultValue={query.from} />
        </label>
        <label>
          Sampai
          <input type="date" name="to" defaultValue={query.to} />
        </label>
        <label>
          Rekening
          <select name="account" defaultValue={query.account ?? ""}>
            <option value="">Semua rekening</option>
            {data.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select name="status" defaultValue={query.status ?? ""}>
            <option value="">Semua status</option>
            <option value="pending">Menunggu verifikasi</option>
            <option value="verified">Terverifikasi</option>
            <option value="rejected">Ditolak</option>
          </select>
        </label>
        <button type="submit">Terapkan</button>
        {query.from || query.to || query.account || query.status ? <Link href="/admin/finance">Atur ulang</Link> : null}
      </form>
      <section className={styles.exportPanel} aria-label="Ekspor laporan Keuangan">
        <div>
          <p className={styles.eyebrow}>LAPORAN</p>
          <h2>Ekspor laporan</h2>
          <p>{exportSummary}. Ledger selalu memuat semua status catatan untuk kebutuhan audit.</p>
        </div>
        <div className={styles.exportActions}>
          <a
            href={`/api/admin/finance/export?${new URLSearchParams({ ...Object.fromEntries(exportQuery), format: "pdf" })}`}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M6 2h8l4 4v16H6zM14 2v5h5M8 15h8M8 18h6" />
            </svg>
            Unduh PDF
          </a>
          <a
            href={`/api/admin/finance/export?${new URLSearchParams({ ...Object.fromEntries(exportQuery), format: "xlsx" })}`}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M6 2h8l4 4v16H6zM14 2v5h5M8 14h8M8 18h8M11 11v10M16 11v10" />
            </svg>
            Unduh Excel
          </a>
        </div>
      </section>
      <section id="ringkasan" className={styles.summary} aria-label="Ringkasan keuangan">
        <article>
          <span>Uang masuk tervalidasi</span>
          <strong>{rupiah(data.summary.incoming)}</strong>
          <small>
            {dateWib(data.range.from)} sampai {dateWib(data.range.to)}
          </small>
        </article>
        <article>
          <span>Uang keluar tervalidasi</span>
          <strong>{rupiah(data.summary.outgoing)}</strong>
          <small>Belum termasuk catatan menunggu</small>
        </article>
        <article>
          <span>Arus bersih periode</span>
          <strong className={data.summary.net < 0 ? styles.negative : undefined}>{rupiah(data.summary.net)}</strong>
          <small>Masuk dikurangi keluar</small>
        </article>
        <article>
          <span>Perlu tindakan</span>
          <strong>{data.summary.pendingCount + data.summary.overdueCount}</strong>
          <small>
            {data.summary.pendingCount} verifikasi · {data.summary.overdueCount} piutang terlambat
          </small>
        </article>
      </section>
      <section className={styles.accounts} aria-label="Saldo rekening bank">
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>REKENING BANK</p>
            <h2>Saldo buku</h2>
            <p>
              Saldo buku berubah hanya setelah catatan diverifikasi. Rekonsiliasikan dengan mutasi bank sebelum
              digunakan sebagai saldo aktual.
            </p>
          </div>
        </div>
        {hasAccount ? (
          <div className={styles.accountGrid}>
            {data.accounts.map((account) => (
              <article key={account.id}>
                <div>
                  <strong>{account.name}</strong>
                  <span>
                    {account.bankName} · {account.accountNoMasked}
                  </span>
                </div>
                <b>{rupiah(account.balance)}</b>
                <small>
                  {account.reconciledAt ? `Direkonsiliasi ${dateWib(account.reconciledAt)}` : "Belum direkonsiliasi"}
                </small>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <h3>Tambahkan rekening bank</h3>
            <p>Saldo awal dan seluruh catatan keuangan harus selalu masuk ke rekening yang jelas.</p>
          </div>
        )}
        <details className={styles.disclosure}>
          <summary>Tambah rekening bank</summary>
          <form action={createFinanceAccount} className={styles.formGrid}>
            <label>
              Nama rekening
              <input name="name" required placeholder="Operasional BCA" />
            </label>
            <label>
              Nama bank
              <input name="bankName" required placeholder="BCA" />
            </label>
            <label>
              Nomor rekening tersamarkan
              <input name="accountNoMasked" required placeholder="•••• 1234" />
            </label>
            <button type="submit">Simpan rekening</button>
          </form>
        </details>
      </section>
      {hasAccount ? (
        <>
          <FinanceComposer
            accounts={data.accounts}
            categories={data.categories}
            suppliers={data.suppliers}
            defaultDate={defaultDate}
          />
          {isLocalFinanceE2e ? (
            <template id="finance-local-e2e-actions">
              <form action={createFinanceEntry}>
                <input name="accountId" value={data.accounts[0]?.id ?? ""} readOnly />
                <input name="categoryCode" value="other_expense" readOnly />
                <input name="kind" value="bank_movement" readOnly />
                <input name="amount" value="1" readOnly />
                <input name="occurredAt" value={defaultDate} readOnly />
                <input name="reference" value="" readOnly />
                <input name="counterpartyName" value="" readOnly />
                <input name="notes" value="" readOnly />
                <input name="supplierId" value="" readOnly />
                <button type="submit">Simpan untuk verifikasi</button>
              </form>
            </template>
          ) : null}
        </>
      ) : null}
      <section className={styles.panel} aria-labelledby="ledger-title">
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>LEDGER BANK</p>
            <h2 id="ledger-title">Catatan periode ini</h2>
            <p>
              Catatan pending belum memengaruhi saldo. Setelah terverifikasi, catatan tidak diubah; koreksi dilakukan
              dengan catatan pembalik.
            </p>
          </div>
        </div>
        {data.entries.length ? (
          <div className={styles.ledger}>
            {data.entries.map(({ entry, accountName, categoryName, supplierName, transactionReference }) => (
              <article key={entry.id} className={styles.ledgerRow}>
                <div className={styles.ledgerTitle}>
                  <strong>{entry.counterpartyName ?? categoryName ?? "Catatan keuangan"}</strong>
                  <span>
                    {categoryName ?? "Tanpa kategori"} · {accountName}
                    {supplierName ? ` · ${supplierName}` : ""}
                    {transactionReference ? ` · ${transactionReference}` : ""}
                  </span>
                </div>
                <time dateTime={entry.occurredAt.toISOString()}>{dateWib(entry.occurredAt)}</time>
                <b className={entry.direction === "out" ? styles.outflow : styles.inflow}>
                  {entry.direction === "out" ? "−" : "+"}
                  {rupiah(entry.amount)}
                </b>
                <span className={`${styles.status} ${styles[`status_${entry.status}`]}`}>
                  {statusLabel[entry.status] ?? entry.status}
                </span>
                <div className={styles.actions}>
                  {entry.status === "pending" ? (
                    <>
                      <form action={verifyFinanceEntry}>
                        <input type="hidden" name="entryId" value={entry.id} />
                        <button type="submit">Verifikasi</button>
                      </form>
                      <form action={rejectFinanceEntry}>
                        <input type="hidden" name="entryId" value={entry.id} />
                        <button type="submit">Tolak</button>
                      </form>
                    </>
                  ) : entry.status === "verified" && !entry.reconciledAt ? (
                    <form action={reconcileFinanceEntry}>
                      <input type="hidden" name="entryId" value={entry.id} />
                      <button type="submit">Rekonsiliasi</button>
                    </form>
                  ) : (
                    <small>{entry.reconciledAt ? "Cocok dengan mutasi" : ""}</small>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <h3>Belum ada catatan</h3>
            <p>Periksa rentang tanggal atau mulai dengan mencatat saldo awal dan transaksi bank pertama.</p>
          </div>
        )}
      </section>
      <section id="piutang" className={styles.panel}>
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>PIUTANG PELANGGAN</p>
            <h2>Invoice yang perlu dipantau</h2>
            <p>Data berasal dari transaksi pelanggan; pencatatan uang masuk tetap diverifikasi pada Keuangan.</p>
          </div>
          <Link href="/admin/transactions">Buka Transaksi</Link>
        </div>
        {data.invoices.length ? (
          <div className={styles.invoiceList}>
            {data.invoices.map((invoice) => (
              <article key={invoice.id}>
                <div>
                  <strong>{invoice.invoiceNo}</strong>
                  <span>
                    {invoice.transactionReference} · {invoice.customerName}
                  </span>
                </div>
                <span>
                  {invoice.dueAt ? `Jatuh tempo ${dateWib(invoice.dueAt)}` : "Tanggal jatuh tempo belum diisi"}
                </span>
                <b>{rupiah(invoice.amount)}</b>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <h3>Tidak ada invoice terbuka</h3>
            <p>Invoice yang diterbitkan dan belum lunas akan tampil di sini.</p>
          </div>
        )}
      </section>
    </section>
  );
}
