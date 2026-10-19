# Perbandingan alur landing — lokal

Kedua alur menggunakan formulir dan penyimpanan prospek yang sama. Parameter ini hanya memilih tampilan secara manual; tidak membagi trafik iklan dan tidak mengubah Google Ads.

| Alur                         | URL lokal                                              | Perbedaan                                                              |
| ---------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| Langsung ke kontak (kontrol) | `http://127.0.0.1:3100/?ap_variant=control#ap-contact` | Penjelasan kontak diikuti formulir.                                    |
| Manfaat dan bukti dahulu     | `http://127.0.0.1:3100/?ap_variant=proof#ap-contact`   | Ringkasan manfaat dan contoh pekerjaan terbit tampil sebelum formulir. |

Tinjau kedua alur pada perangkat dan lebar layar yang sama, menggunakan sesi browser baru untuk masing-masing agar sumber kunjungan awal tidak tercampur. Ukur kunjungan yang mencapai kontak, percobaan formulir, permintaan valid yang tersimpan, klik WhatsApp, lalu prospek yang ditandai layak oleh tim. Klik WhatsApp bukan bukti pesan terkirim atau prospek berkualitas. Scroll akibat tautan `#ap-contact` bukan bukti pengunjung membaca bagian sebelumnya.

Sebelum eksperimen production apa pun, tetapkan hipotesis, pembagian trafik acak yang stabil, durasi dan ukuran sampel, serta metrik utama **prospek layak per kunjungan**. Jangan mengambil keputusan anggaran atau penargetan dari data historis dengan atribusi lama atau dari perbandingan manual lokal ini.
