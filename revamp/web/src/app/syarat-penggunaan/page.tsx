import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Syarat Penggunaan | Anugrah Plastik" };

export default function TermsPage() {
  return (
    <main className="privacy-page">
      <p className="eyebrow">SYARAT PENGGUNAAN</p>
      <h1>Ketentuan menggunakan website Anugrah Plastik.</h1>
      <section>
        <h2>Informasi layanan</h2>
        <p>
          Informasi pada website membantu Anda mengenal layanan cetak plastik dan menyampaikan kebutuhan. Spesifikasi,
          harga, jumlah, jadwal, serta ketentuan pekerjaan hanya berlaku setelah disepakati dalam penawaran atau dokumen
          transaksi Anugrah Plastik.
        </p>
      </section>
      <section>
        <h2>Informasi yang Anda kirim</h2>
        <p>
          Pastikan informasi kontak dan kebutuhan yang dikirim benar serta Anda berhak membagikan file atau keterangan
          yang disertakan. Informasi tersebut digunakan untuk menanggapi permintaan dan dikelola sesuai{" "}
          <Link href="/privasi">Kebijakan Privasi</Link>.
        </p>
      </section>
      <section>
        <h2>Penggunaan yang wajar</h2>
        <p>
          Gunakan website untuk mencari informasi dan menghubungi Anugrah Plastik secara wajar. Jangan mencoba
          mengganggu layanan, mengakses ruang kerja internal tanpa izin, atau mengirim materi yang melanggar hukum
          maupun hak pihak lain.
        </p>
      </section>
      <section>
        <h2>Kontak</h2>
        <p>
          Jika ada pertanyaan mengenai ketentuan ini, hubungi{" "}
          <a href="mailto:cs@anugrahplastik.com">cs@anugrahplastik.com</a>.
        </p>
      </section>
    </main>
  );
}
