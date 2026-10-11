"use client";

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="admin-page admin-error-state" role="alert">
      <span aria-hidden="true">!</span>
      <p className="admin-eyebrow">RUANG KERJA</p>
      <h1>Tindakan belum berhasil</h1>
      <p>Periksa koneksi lalu coba lagi. Jika ini terkait pengiriman email, cek folder Terkirim sebelum mengulang.</p>
      <button className="admin-primary-button" onClick={reset} type="button">
        Coba lagi
      </button>
    </section>
  );
}
