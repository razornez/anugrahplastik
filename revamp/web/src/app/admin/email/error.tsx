"use client";

export default function EmailError({ reset }: { reset: () => void }) {
  return (
    <section className="admin-page" role="alert">
      <p className="admin-eyebrow">LAYANAN PELANGGAN</p>
      <h1>Email CS belum dapat dibuka</h1>
      <p>
        Terjadi gangguan saat membaca data. Ini bukan berarti kotak masuk kosong. Jika pengiriman baru saja
        dikonfirmasi, periksa statusnya sebelum mencoba mengirim lagi.
      </p>
      <button type="button" className="admin-secondary-button" onClick={reset}>
        Coba muat ulang
      </button>
    </section>
  );
}
