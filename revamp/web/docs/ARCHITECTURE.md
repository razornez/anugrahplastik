# Architecture spine

## Stack

- Next.js App Router, TypeScript, dan Tailwind CSS untuk aplikasi publik serta back office.
- PostgreSQL self-managed sebagai sumber data utama.
- Drizzle untuk schema, migration, dan akses data typed.
- Docker Compose pada VPS Ubuntu untuk web, PostgreSQL, media volume, dan reverse proxy.

## Batas domain

- `marketing`: halaman publik, metadata, sitemap, portfolio, artikel, FAQ.
- `content`: section, media, draft, publish, navigasi, SEO, redirect.
- `crm`: lead, status pipeline, catatan, attribution, activity log.
- `identity`: user, role, session, audit log.
- `integrations`: WhatsApp, analytics, webhook, konfigurasi rahasia.

## Aturan data

- Mutation hanya melalui server action atau route handler yang tervalidasi.
- Migration versioned adalah satu-satunya cara mengubah schema.
- Media berada di volume server dan direferensikan oleh `media_assets`.
- Lead dan aktivitas tidak boleh dihapus dari UI biasa; gunakan status, archive, atau audit trail.

## Cache

- Halaman public published memakai cache tag per domain: site, portfolio, article, faq.
- Publish atau unpublish memanggil revalidation tag dan path terkait.
- Admin, lead, session, dan halaman personal selalu dynamic/no-store.
- Cache shared tambahan tidak ditambahkan sebelum metrik membuktikan kebutuhan.

## Keamanan

- Database hanya berada pada network internal container.
- Password saat ini memakai bcrypt dengan cost factor 12; migrasi ke Argon2id dilakukan bersama proses rehash akun agar tidak menurunkan kompatibilitas sesi yang sudah ada.
- Semua secret hanya di environment server.
- Webhook diverifikasi, form dibatasi laju request, dan input tervalidasi di server.

## Menjalankan lapisan data

1. Salin `.env.example` menjadi `.env.local`, lalu isi `DATABASE_URL` dengan koneksi PostgreSQL yang aktif.
2. Jalankan `pnpm db:generate` untuk membuat migrasi dari skema.
3. Tinjau berkas migrasi, kemudian jalankan `pnpm db:migrate`.

Form permintaan menyimpan data ke tabel `leads`. Bila variabel koneksi belum tersedia, form memberi pemberitahuan jelas dan tidak menyatakan data berhasil disimpan.
