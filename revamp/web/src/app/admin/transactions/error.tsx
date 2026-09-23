"use client";

import Link from "next/link";

export default function TransactionsError({ reset }: { reset: () => void }) {
  return (
    <section className="operations-page operations-error">
      <p className="eyebrow">Transaksi</p>
      <h1>Halaman pekerjaan belum dapat dibuka.</h1>
      <p>Data tidak berubah. Silakan muat ulang halaman ini atau kembali ke daftar transaksi.</p>
      <div>
        <button onClick={reset} type="button">
          Muat ulang
        </button>
        <Link href="/admin/transactions">Kembali ke transaksi</Link>
      </div>
    </section>
  );
}
