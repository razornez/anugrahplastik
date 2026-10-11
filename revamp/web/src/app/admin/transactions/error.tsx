"use client";

export default function TransactionListError({ reset }: { reset: () => void }) {
  return (
    <section className="operations-page">
      <h1>Daftar transaksi belum dapat dimuat</h1>
      <p>Terjadi gangguan saat membaca database. Data tidak dihapus dan ini bukan daftar kosong.</p>
      <button type="button" onClick={reset}>
        Coba lagi
      </button>
    </section>
  );
}
