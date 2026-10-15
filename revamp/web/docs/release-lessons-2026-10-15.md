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
