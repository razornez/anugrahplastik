import type { Metadata } from "next";
import { AnalyticsPreferenceControl } from "@/components/analytics-preference-control";
import Link from "next/link";

export const metadata: Metadata = { title: "Privasi Analitik | Anugrah Plastik" };

export default function PrivacyPage() {
  return (
    <main className="privacy-page">
      <p className="eyebrow">Privasi analitik</p>
      <h1>Informasi penggunaan website dipakai untuk memperbaiki pengalaman pengunjung.</h1>
      <section>
        <h2>Yang dicatat secara anonim</h2>
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
        <h2>Koneksi Google Ads untuk ruang kerja internal</h2>
        <p>
          Jika administrator menyambungkan Google Ads, aplikasi menyimpan refresh token terenkripsi dan alamat akun yang
          disetujui untuk mengambil laporan tayang, klik, biaya, konversi, serta status kampanye. Data laporan hanya
          digunakan di ruang kerja pemasaran internal; aplikasi tidak mengubah kampanye atau anggaran. Riwayat laporan
          yang sudah diambil tetap tersimpan meskipun administrator memutus koneksi, sedangkan token yang tersimpan
          dihapus.
        </p>
        <p>
          Pemilik akun Google dapat mencabut akses melalui{" "}
          <a href="https://myaccount.google.com/connections">pengaturan koneksi akun Google</a>. Hanya administrator
          Anugrah Plastik yang dapat menghubungkan atau memutus sambungan di back office.
        </p>
      </section>
      <section>
        <h2>Pilihan Anda</h2>
        <p>
          Anda dapat menonaktifkan analitik di perangkat ini kapan saja. Pilihan tersebut tidak memengaruhi fungsi utama
          website.
        </p>
        <AnalyticsPreferenceControl />
      </section>
      <p>
        Baca juga <Link href="/syarat-penggunaan">Syarat Penggunaan</Link>.
      </p>
    </main>
  );
}
