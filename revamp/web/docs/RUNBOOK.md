# Operations runbook

## Sebelum production

- Siapkan domain/DNS, VPS Ubuntu, Docker, PostgreSQL, volume media, HTTPS, dan environment secrets.
- Siapkan Meta Business, WhatsApp Cloud API, GA4, GTM, PostHog, serta webhook endpoint.
- Jalankan migration dan seed pada lingkungan non-production lebih dahulu.
- Siapkan satu proses `pnpm analytics:worker` yang terpisah dari server web. Pastikan worker memakai environment dan database yang sama.
- Buat volume privat untuk `PRIVATE_STORAGE_PATH` dengan permission proses aplikasi. Jangan arahkan ke `public/` atau web root.

## Tracker saat lonjakan

1. Buka meter kesehatan pencatatan pengunjung sebagai administrator.
2. Jika status perhatian, periksa log worker dan umur batch tertua. Landing dan formulir tetap diprioritaskan; jangan menaikkan pool aplikasi hanya untuk tracker.
3. Jika status perlu ditangani, pastikan worker hidup, periksa koneksi PostgreSQL, lalu lihat batch gagal. Setelah pola lonjakan berulang terbukti, rencanakan Redis atau worker tambahan melalui ADR baru.
4. Sebelum deploy, jalankan `pnpm db:migrate`, mulai ulang worker, lalu smoke test halaman utama dan satu request tracker.

## Storage privat

- Pantau kapasitas; 80% membutuhkan perencanaan arsip, 90% memblokir upload baru.
- Backup volume privat sebelum migrasi/deploy dan uji satu restore pada lingkungan terpisah.
- Bila file salah unggah, jangan hapus langsung dari disk. Tandai dokumen dan simpan audit sampai kebijakan retensi disetujui.

## Backup and restore

- Jalankan backup database dan media setiap 10 hari, serta sebelum deploy/migration.
- Simpan arsip dengan timestamp dan verifikasi file dapat dibuka.
- Uji restore ke database kosong secara berkala; jangan menguji restore pada production.

## Incident

1. Identifikasi dampak: public website, CMS, CRM, media, atau notifikasi.
2. Periksa health check, log aplikasi, log container, ruang disk, dan koneksi database.
3. Roll back image aplikasi jika deploy menjadi penyebab.
4. Gunakan backup terakhir hanya jika data tidak dapat dipulihkan dengan cara lain.
5. Catat akar masalah dan tindakan pencegahan pada retrospective.
