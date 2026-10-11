# Radar calon pelanggan

Radar pada `/admin/growth#peluang` mempunyai dua bagian: calon pelanggan hasil riset dan temuan pemasaran yang sudah ada. `?radar=marketing#peluang` membuka temuan pemasaran; bookmark rincian lama dialihkan ke bagian tersebut. Tidak ada penjadwalan atau pencarian otomatis baru.

## Sumber dan batas pencarian

- Admin mengonfirmasi satu frasa industri dan satu kota sebelum satu permintaan `google_maps` ke SerpApi. Parameter mengikuti [dokumentasi Google Maps SerpApi](https://serpapi.com/google-maps-api). Hanya halaman pertama, maksimum 20 metadata tempat; tidak mengambil halaman lanjutan, foto, ulasan, atau detail tempat tambahan.
- Bandung Raya dan Jabodetabek adalah area pencarian. Hasil dapat berada di luar area tersebut. Siluet SVG Natural Earth lokal dan titik kelompok wilayah bukan lokasi perusahaan, rute, atau bukti kebutuhan produknya. Tidak memakai Google Maps SDK, geocoding, atau tile berbayar.
- Pencarian identik memakai hasil tersimpan selama kurang dari tujuh hari. Pemakaian bersama maksimum 40 pencarian per bulan kalender Jakarta. Pencarian perusahaan maksimum empat percobaan per bulan dan tidak boleh mengambil cadangan audit organik/tren yang dihitung dari sisa Senin, audit minggu ini, serta satu retry.
- Reservasi memakai row lock pemakaian bulanan yang sama dengan audit SEO; advisory lock frasa/kota mencegah permintaan identik bersamaan. Percobaan gagal tetap menghabiskan reservasi internal karena tidak selalu dapat dibuktikan apakah penyedia sudah memproses permintaan. Tidak ada upgrade atau pembelian otomatis.
- API key tetap hanya di `SERPAPI_API_KEY` konfigurasi privat. URL permintaan dan pesan kesalahan penyedia tidak disimpan dalam log/audit maupun dikirim ke browser. Respons dibatasi 3 MB dan 45 detik, redirect ditolak.

## Tinjauan dan Prospek

Admin/sales dapat membaca kontak publik, menandai relevan/disisihkan, dan memasukkan kandidat ke Prospek setelah memeriksa identitas serta memilih penanggung jawab aktif. Role konten tidak mendapat payload kandidat maupun akses aksi/WhatsApp kandidat.

`place_id` atau CID menjadi identitas stabil untuk deduplikasi. Kandidat tanpa identitas stabil tetap dapat ditinjau, tetapi penambahan ke Prospek ditahan. Pengambilan berikutnya memperbarui metadata terbaru, bukan snapshot pencarian lama, keputusan, atau hubungan ke Prospek. Penambahan bersamaan mengunci kandidat dan hanya membuat satu prospek.

Prospek riset memakai sumber `serpapi_business_discovery`. Ini bukan pelanggan yang mengirim formulir; tidak dihitung sebagai permintaan masuk dalam ringkasan Beranda/Pemasaran, konversi iklan, atau form valid. Daftar Prospek menyediakan filter sumber. Tidak ada pesan terkirim otomatis; draf WhatsApp tidak mengklaim perusahaan telah menghubungi kita.

## Migrasi dan verifikasi lokal

Migrasi `0030_curious_onslaught.sql` menambah tabel pencarian, kandidat, dan hubungan dengan snapshot JSON. Tidak mengubah arsip audit SEO atau data pelanggan lama. Sebelum migrasi lokal, jalankan `node scripts/backup-local-database.mjs` dan pastikan dump berhasil serta ukurannya bukan nol. Backup disimpan privat dalam `storage/backups` dan tidak masuk Git.

`pnpm test` mencakup parsing, tautan aman, filter, cache, batas kuota, role/konfirmasi dan uji konkurensi Postgres. Uji database hanya pada host lokal, dalam schema acak `business_test_*` yang terisolasi; schema uji dibersihkan setelah selesai, bukan tabel aplikasi. Tidak memakai key atau pencarian API nyata. Uji tampilan nyata desktop/mobile dan hasil API masih harus dicatat terpisah; kelulusan unit test tidak menggantikannya.

Tidak ada deploy, pencarian terjadwal baru, perubahan Google Ads, atau pengiriman pelanggan dari pekerjaan ini.
