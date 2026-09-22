import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privasi Analitik | Anugrah Plastik" };

export default function PrivacyPage() {
  return (
    <main className="privacy-page">
      <p className="eyebrow">Privasi analitik</p>
      <h1>Informasi penggunaan website dipakai untuk memperbaiki pengalaman pengunjung.</h1>
      <section>
        <h2>Yang dicatat setelah Anda mengizinkan</h2>
        <p>
          Jenis perangkat, browser, sumber kunjungan, lokasi kota/kabupaten perkiraan, bagian halaman yang dibuka,
          kedalaman scroll, dan tombol yang dipilih.
        </p>
      </section>
      <section>
        <h2>Yang tidak kami gabungkan</h2>
        <p>
          Data analitik tidak digabung dengan nama, nomor WhatsApp, isi formulir, atau identitas lain. Alamat IP hanya
          dipakai sesaat untuk memperkirakan lokasi lalu tidak disimpan.
        </p>
      </section>
      <section>
        <h2>Masa penyimpanan</h2>
        <p>
          Perjalanan kunjungan detail disimpan hingga 90 hari. Ringkasan harian tanpa identitas disimpan hingga 12
          bulan.
        </p>
      </section>
      <section>
        <h2>Pilihan Anda</h2>
        <p>
          Anda dapat menolak analitik pada pemberitahuan yang muncul saat membuka website. Penolakan tidak memengaruhi
          fungsi utama website.
        </p>
      </section>
    </main>
  );
}
