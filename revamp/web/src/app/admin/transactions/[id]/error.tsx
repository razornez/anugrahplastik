"use client";

import Link from "next/link";

export default function TransactionError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="transaction-flow-error" role="alert">
      <span aria-hidden="true">!</span>
      <h1>Perubahan belum berhasil disimpan</h1>
      <p>
        Periksa kembali data yang diisi. Jika Anda sedang membuat dokumen atau mengirim email, periksa daftar dokumen
        dan Email terkirim sebelum mencoba lagi agar tidak terjadi duplikasi.
      </p>
      <div>
        <button onClick={() => reset()} type="button">
          Muat ulang halaman
        </button>
        <Link href="/admin/transactions">Kembali ke transaksi</Link>
      </div>
    </section>
  );
}
