# Rilis VPS Anugrah Plastik

Dokumen ini adalah prosedur rilis pertama ke VPS bersama. Rilis tidak boleh
dimulai hanya karena artefak CI tersedia: backup/restore, kapasitas, domain,
dan perubahan DNS tetap merupakan gate terpisah.

## Batas dan arsitektur

- App berjalan sebagai user Linux `anugrahplastik`, di loopback port `3050`.
- PostgreSQL memakai database dan role khusus; tidak memakai database atau role
  aplikasi lain di VPS.
- Media privat berada di `/var/lib/anugrahplastik/private`, di luar release dan
  web root.
- Release berada di `/srv/anugrahplastik/releases/<commit>-<run>/app`; symlink
  `/srv/anugrahplastik/current` hanya boleh diganti setelah canary lokal lulus.
- Nginx adalah satu-satunya ingress publik. `/api/health` hanya untuk loopback.
- Email CS dan Google Ads scheduler tidak diaktifkan pada rilis pertama.

## Gate sebelum cutover

1. Jalankan `ops/audit-vps.sh` dari artefak pada VPS dan catat CPU, RAM, swap,
   disk, inode, port, unit aktif, ukuran release, serta ukuran database per
   database. Jangan restart atau membersihkan layanan lain.
2. Pastikan setelah menyisakan release aktif, satu rollback, backup DB+media,
   dan cushion kapasitas, disk masih aman. RAM tersedia harus melebihi puncak
   tambahan yang **diukur** untuk rilis ini dan swap tidak boleh bertambah.
   Jalankan `ops/preflight-vps.sh` secara baca-saja dengan nilai pengukuran itu;
   jangan memakai ambang 2 GiB universal. Bila satu gerbang gagal, tunda cutover.
3. Buat backup pasangan database dan media lokal. Unduh ulang, cocokkan
   checksum, lalu restore ke database terisolasi dan uji login, konten, file
   privat, transaksi, Finance, serta Email CS cache.
4. Inventaris media yang direstore hanya dari storage privat operasional. Jangan
   membawa `storage/backups`, `tmp`, `output`, screenshot review, fixture, atau
   seed demo ke VPS.
5. Konfigurasi `/etc/anugrahplastik/web.env` sebagai root-only (`0600`) dari
   `.env.example`. Isi secret production melalui secret manager; jangan pernah
   memasukkan secret ke artefak, command history, Git, ataupun jurnal.
6. Buat sertifikat origin via DNS challenge sebelum apex/`www` dipindahkan.
   Hanya record web yang berubah; MX, SPF, DKIM, dan DMARC cPanel dipertahankan.

## Paket dan pemasangan

1. Jalankan workflow **Package Anugrah Plastik VPS release** secara manual pada
   SHA kandidat. Workflow Linux menjalankan format check, lint, typecheck,
   seluruh test, build, lalu mengunggah TAR dan SHA-256.
2. Di VPS, verifikasi checksum TAR sebelum ekstraksi ke direktori release baru.
   Jangan build atau menjalankan `pnpm install` pada VPS.
3. Salin unit dari `ops/systemd/`, template Nginx dari `ops/nginx/`, kemudian
   baca ulang unit/Nginx yang sudah ada sebelum memasangnya. Ganti
   `__DOMAIN__`; jangan memakai template tanpa sertifikat valid.
4. Restore database dan media yang telah terverifikasi. Jalankan
   `node scripts/release/migrate-production.mjs` dari release baru satu kali;
   eksekusi kedua harus selesai tanpa perubahan.
5. Jalankan release baru sebagai canary pada port loopback sementara dengan
   environment production yang sama, kemudian jalankan
   `bash scripts/release/smoke-release.sh http://127.0.0.1:<port-canary>`.
   Skrip wajib memeriksa health, landing, fingerprint runtime error, dan login
   username + PIN. Jangan mengubah symlink bila satu pemeriksaan gagal.
6. Untuk aktivasi awal pusat dokumen, jalankan
   `DOCUMENT_TEMPLATE_RELEASE_CONFIRM=publish-official-v1 node scripts/release/publish-document-templates.mjs`
   langsung dari release dengan environment production. Perintah ini membuat
   serta melakukan smoke render keempat template tanpa email. Pointer database
   baru berpindah dalam satu transaksi setelah seluruh PDF valid; bila satu
   gagal, versi aktif sebelumnya tetap dipakai. Jangan menaruh API key pada
   command line atau history.
   Untuk revisi satu jenis yang sudah aktif, tambahkan
   `DOCUMENT_TEMPLATE_KIND=delivery` (atau jenis lain yang valid). Konfigurasi
   versi aktif tetap dipertahankan; hanya pointer jenis tersebut yang berpindah
   setelah smoke render. Periksa checksum dan hasil PDF sebelum cutover.
7. Setelah smoke canary lulus, arahkan symlink `current` ke release baru lalu
   mulai web dan worker analitik. Jalankan kembali
   `bash scripts/release/smoke-release.sh http://127.0.0.1:3050` dan pastikan
   jurnal service bersih sebelum Nginx/DNS diubah.
8. Pasang Nginx, lakukan smoke melalui host override, lalu ubah apex/`www`
   pada jendela rilis. Uji HTTPS, redirect, cookie login, upload media privat,
   dan halaman publik dari jaringan luar.

## Scheduler integrasi

- Timer Email dan Google Ads dipisahkan agar kegagalan satu provider tidak
  menghalangi provider lain. Timer gabungan lama harus tetap nonaktif.
- Enable timer Email CS hanya setelah IMAP 993 dan SMTP 465 berhasil diuji dari
  VPS serta koneksi tersimpan dapat disinkronkan.
- Google Ads scheduler tetap nonaktif sampai OAuth Production, akses project Google Cloud,
  probe akses, dan rekonsiliasi laporan tujuh hari dinyatakan lulus. Setelah
  itu timer Ads berjalan setiap 15 menit, sedangkan klaim database membatasi
  pembaruan laporan menjadi sekali per hari dengan maksimal tiga retry.

## Rollback

Jika health, log, atau smoke gagal, arahkan `current` ke release sebelumnya dan
restart hanya `anugrahplastik-web` serta `anugrahplastik-analytics`. Jangan
menjalankan rollback schema/data otomatis. Perubahan database hanya dipulihkan
dari backup pasangan yang sudah diuji.
