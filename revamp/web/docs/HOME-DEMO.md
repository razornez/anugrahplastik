# Data contoh Beranda lokal

Jalankan `pnpm db:seed:home` hanya setelah mencadangkan database lokal. Skrip menolak host database nonlokal. Seed dapat diulang; sesi `home-demo-*` dan event bertanda `home-demo-v1` tidak digandakan. Beranda lokal menampilkan mode **Contoh** secara awal; `?view=live` menampilkan data nyata dan `?view=empty` memperlihatkan keadaan kosong. Pilihan ini mempertahankan `period=today|week|month`. Di build produksi, parameter `view` diabaikan.

Seed menandai ulang 12 sesi `demo-anugrah-001` s.d. `012`, enam prospek dengan pasangan nama/telepon yang persis sama seperti seed lama, serta tiga transaksi dengan pasangan nomor/judul yang persis sama. Seed juga menambah tiga prospek tanpa kontak dengan `source=home-demo-v1` dan `landing_path=/__demo__/home`. Baris lain tidak diubah. Sesi baru memiliki `traffic_class=demo`; prospek dan transaksi contoh memiliki `data_class=demo`.

## Pembersihan menjelang rilis — belum dijalankan

1. Buat backup PostgreSQL dan media privat. Catat jumlah baris menurut `traffic_class` dan `data_class`, lalu cocokkan identitas penanda di atas. Pastikan tak ada baris nyata yang memakai penanda yang sama.
2. Tinjau relasi transaksi contoh, invoice, dokumen dan auditnya. Jangan menghapusnya secara massal tanpa memastikan kebutuhan arsip dan persetujuan pemilik.
3. Dalam transaksi database terpisah, hapus hanya sesi dengan `session_key LIKE 'home-demo-%'` dan sesi `anonymous_id` dalam daftar `demo-anugrah-001` s.d. `012`; event terkait mengikuti foreign key. Hapus prospek `source=home-demo-v1` dan prospek/transaksi lama yang terverifikasi hanya setelah memeriksa dependensi dan backup. Jangan menghapus seluruh tabel atau semua baris berdasarkan tanggal.
4. Ulangi hitungan dan cek bahwa mode Data nyata tidak berubah. Baru setelah itu pertimbangkan menonaktifkan seed lokal.

Data contoh tidak mengarah ke tindakan pada pelanggan nyata. Ini hanya pratinjau desain, bukan laporan bisnis.

## Pratinjau Prospek lokal

Halaman `/admin/prospects` memakai sembilan prospek `data_class=demo` yang sudah ada saat belum ada prospek `production`. Admin dapat memilih `?view=demo` atau `?view=live`; di produksi hanya data nyata yang dapat dibaca. Penugasan dan catatan contoh tetap berada pada baris demo. Tindakan WhatsApp contoh hanya aktif bila `DEMO_WHATSAPP_TEST_NUMBER` diisi langsung pada `.env.local`, dan server selalu mengganti nomor dummy dengan nomor uji itu.

Sebelum deploy, cadangkan database lalu periksa hitungan dan relasi contoh: enam prospek dari `scripts/seed-demo.sql` dengan pasangan nama/telepon tepat, serta tiga prospek `source=home-demo-v1` dan `landing_path=/__demo__/home`. Tinjau catatan dan audit yang merujuk tiap ID, lalu bersihkan hanya ID yang terverifikasi. Jangan menghapus seluruh tabel `leads` atau memilih baris hanya berdasarkan tanggal. Setelah pembersihan, pastikan `data_class=production` dan laporan nyata tetap sama.
