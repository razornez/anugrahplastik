# Laporan pengunjung dan peta analitik

`/admin/insights` hanya untuk admin/sales. Periode 7/30 hari mencakup hari ini di Asia/Jakarta; semua query satu render memakai waktu akhir yang sama. Jumlah kunjungan adalah sesi, bukan orang unik. Grafik/tabel permintaan valid menghitung sesi `outcome='Form terkirim'` dan `form_status='valid'`.

## Lokasi dan aset

Peta tidak menyimpan IP atau koordinat seseorang dan tidak mengirim lokasi ke layanan peta. Negara/provinsi/kota berasal dari perkiraan GeoIP yang sudah ada. Agregasi memakai semua sesi sesuai filter, bukan halaman pagination. Lokasi kosong/ambigu tidak ditebak dari kota. Alias negara/provinsi dipetakan secara eksplisit dan digunakan juga oleh filter SQL.

`src/features/analytics/map-data/shapes.json`: Natural Earth, public domain; negara dunia 1:110m dan siluet Indonesia 1:50m. Katalog negara memakai 1:50m agar negara kecil seperti Singapura tetap terwakili.

`catalog.json`: katalog negara dari Natural Earth; titik referensi provinsi diturunkan dari geoBoundaries IDN ADM1 (OpenStreetMap / Wambacher), data wilayah 2017, 34 wilayah. Katalog titik provinsi merupakan basis data turunan berlisensi **Open Database License 1.0 (ODbL)**. Atribusi dan lisensi harus dipertahankan; versi katalog turunan yang didistribusikan tetap tersedia dengan ODbL. Ini tidak melisensikan ulang kode aplikasi atau data analitik privat. Lisensi: https://opendatacommons.org/licenses/odbl/1-0/ ; sumber: https://www.openstreetmap.org/copyright dan https://www.geoboundaries.org/ . Jangan menyebut titik ini batas administratif terkini.

Titik adalah pusat bounding box ring dengan jumlah vertex terbanyak pada wilayah sumber, bukan centroid atau lokasi pengunjung. Jika titik bertumpuk, label dipisahkan dengan garis penghubung menuju titik referensinya. Provinsi baru/tidak cocok tetap muncul di daftar tanpa koordinat rekaan.

`provenance.json` menyimpan URL commit sumber dan SHA-256 respons. Regenerasi eksplisit: `node scripts/build-visitor-map.mjs`, lalu format ketiga JSON. Tidak dijalankan saat membuka halaman atau build aplikasi. Tidak ada SDK peta, API key, tile eksternal, atau dependensi runtime baru.

## Mode lokal dan pemulihan

- `view=live|demo|empty`; produksi selalu live dan mengabaikan demo/empty.
- Tanpa pilihan eksplisit, lokal memakai demo hanya bila belum ada sesi public dalam periode sebelum filter diterapkan. Pencarian/filter kosong tidak boleh memicu fallback demo.
- `map=indonesia|world`; klik wilayah hanya membuka rincian. Aksi filter mengosongkan kota, pilihan sesi dan cursor, mempertahankan periode/perangkat/sumber/hasil/mode.
- Sesi terpilih harus berada dalam kelas data, periode, dan filter yang sedang dibuka. UUID tidak valid tidak diteruskan ke database.
- Gangguan database menampilkan status gagal dan tanda `—`, bukan angka nol rekaan.

Backup sebelum seed: `node scripts/backup-local-database.mjs`. Backup berada dalam `storage/backups/` yang diabaikan Git. Pemulihan terarah menggunakan `pg_restore` setelah memastikan database tujuan dan kebutuhan pemulihan; jangan memulihkan otomatis. Seed: `pnpm db:seed:home`; perubahan geografis hanya untuk identitas demo terverifikasi. Jangan bersihkan data contoh sekarang. Prosedur pembersihan menjelang rilis tetap mengikuti `HOME-DEMO.md`.

Pengujian database dalam `tests/visitor-report.test.cjs` hanya berjalan pada host lokal, memakai transaksi dan rollback; tidak meninggalkan fixture. Uji terisolasi tidak memerlukan email atau API tambahan.

## Status verifikasi 2 Oktober 2026

Test: 77 lulus, 1 dilewati oleh suite yang sudah ada, tidak ada kegagalan. Typecheck, lint, dan format check lulus. Pemeriksaan visual desktop/mobile, terang/gelap, serta interaksi browser belum lulus: tab Chrome dan in-app browser masih meminta login. Jangan menganggap pemeriksaan SSR sebagai pengganti review visual 375×812, 812×375, 768, 980, 1024, dan 1440 px. Tidak ada push atau deploy produksi.
