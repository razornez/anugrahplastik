# Operations runbook

## Sebelum production

- Siapkan domain/DNS, VPS Ubuntu, Docker, PostgreSQL, volume media, HTTPS, dan environment secrets.
- Siapkan Meta Business, WhatsApp Cloud API, GA4, GTM, PostHog, serta webhook endpoint.
- Jalankan migration dan seed pada lingkungan non-production lebih dahulu.

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
