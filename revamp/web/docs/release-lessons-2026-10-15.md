# Pelajaran rilis transaksi, 15 Oktober 2026

Menurut catatan rilis sebelumnya, kandidat tersedia sekitar 20.50 WIB, CI terakhir selesai sekitar tiga menit, tetapi cutover baru berlangsung sekitar 10.38 WIB. Selisih itu terutama waktu menunggu dan menuntaskan gerbang operasional, bukan waktu kompilasi: ruang disk dan ruang cadangan, bukti pemulihan backup, kapasitas RAM/swap, SSH/VPN, kunci DocGen, akun Admin pemulihan, serta dua koreksi kemasan baru dipastikan bertahap.

## Perubahan proses

1. Jalankan `scripts/release/preflight-vps.sh` sebagai pemeriksaan baca-saja **sebelum** menjadwalkan cutover. Isikan lokasi artefak, manifest backup, bukti restore yang baru, dan `MEASURED_PEAK_EXTRA_MIB` dari pengukuran rilis sejenis. Hasil `BELUM` berarti jangan lanjut.
2. CI membuat artefak allowlist dan memastikan migrator, CLI Admin, data wilayah, logo, empat HTML resmi, worker pembersihan, serta migrasi baru benar-benar ada. Jangan unggah `.env`, storage, database lokal, screenshot, atau dummy.
3. Siapkan backup database/media/environment dan buktikan restore pada lingkungan terisolasi sebelum memindahkan pointer rilis. Perkirakan ruang untuk artefak, backup, dan rollback **setelah** ekstraksi.
4. Pakai pengukuran RAM dan tren swap aktual, bukan ambang 2 GiB universal. Jika ruang memori tidak cukup untuk puncak tambahan terukur, tunda cutover; jangan menebak ambang yang lebih rendah.
5. Uji migrasi dua kali pada database lokal terisolasi. Pada VPS, gunakan backup teruji, migrasi, canary, smoke landing publik, baru alihkan web. Jika canary atau landing bermasalah, kembalikan pointer rilis tanpa menghapus dokumen historis.
6. Verifikasi health web, Email CS, dan Google Ads setelah cutover; iklan yang berjalan membuat landing publik sebagai gerbang wajib. Catat waktu tiap gerbang agar hambatan rilis berikutnya terlihat sebelum malam cutover.

## Pelajaran pengiriman 11.11 WIB

Log production mencatat `jumlah pack × isi per pack` tidak sama dengan jumlah pcs pada upaya 11.11 WIB; pengiriman tercatat sekitar 11.15 WIB. Nilai formulir gagal tidak tersedia, jadi angka persis yang diubah tidak boleh ditebak. Validasi kini dijalankan sewaktu jumlah/pack/isi berubah, pesan menyebut angka yang tidak cocok di dekat item, dan server mengulang pemeriksaan sebelum menyimpan. Form tetap terbuka bila validasi gagal.

## Syarat rilis fitur ini

Sebelum production, wajib lulus test/unit/integration, Playwright mobile–desktop, typecheck, lint, format, build, migrasi dua kali, publikasi versi baru Surat Jalan dan smoke render anonim. Fitur hapus permanen tidak boleh diaktifkan sebelum backup production dan restore-nya terverifikasi; dialog Admin tetap meminta nomor transaksi serta pernyataan data dummy/testing. Jangan memakai database atau storage lokal sebagai sumber production.

## Temuan tambahan saat rilis ini

- Dispatch CI harus memakai SHA lengkap. SHA pendek dibaca checkout sebagai pola branch/tag, sehingga gagal bahkan sebelum test berjalan.
- Smoke PDF lokal memakai renderer dari repo DocGen terpisah. Runner tanpa repo itu tetap menguji kontrak empat HTML; smoke PDF nyata dijalankan di lingkungan QA lokal dan provider production sebelum template aktif.
- Build `next/font/google` bergantung pada respons jaringan Google. Font yang sama kini diambil dari dependency Fontsource yang dikunci versinya dan disajikan oleh aplikasi; build CI tidak lagi mengunduh font saat kompilasi.
- Manifest SHA artefak wajib memakai nama file relatif, bukan path sementara runner, agar dapat diverifikasi langsung di VPS.
- Pemeriksaan `curl | grep -q` dengan `pipefail` dapat salah gagal karena `grep` menutup pipe sebelum seluruh halaman selesai diunduh. Biarkan `grep` membaca seluruh respons. Nama secret sesi yang benar adalah `AUTH_SECRET`.
- PostgreSQL production memang berada di loopback VPS. Host `127.0.0.1` bukan bukti bahwa database itu lokal workstation; guard publisher harus memeriksa konteks VPS, origin resmi, dan nama database khusus. Penerbitan Surat Jalan pada rilis ini memakai socket PostgreSQL VPS setelah koneksi dan identitas database diverifikasi.
- `systemctl restart` menandai unit mulai sebelum port web siap. Cutover pertama otomatis rollback karena smoke terlalu dini; percobaan kedua menunggu health loopback dengan batas waktu, lulus, dan landing publik tetap 200. Jadikan tunggu-ready terbatas bagian tetap dari prosedur, bukan alasan melewati smoke.
