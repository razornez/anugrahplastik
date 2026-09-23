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
- `operations`: customer, supplier, material, barang, mould, transaksi, pembayaran proyek, batch, pengiriman, dan dokumen.
- `integrations`: WhatsApp, analytics, DocGen, Gmail, webhook, konfigurasi rahasia.

## Aturan data

- Mutation hanya melalui server action atau route handler yang tervalidasi.
- Migration versioned adalah satu-satunya cara mengubah schema.
- Media publik berada di volume server dan direferensikan oleh `media_assets`; file kerja 3D dan dokumen transaksi berada di storage privat di luar `public/`.
- Lead dan aktivitas tidak boleh dihapus dari UI biasa; gunakan status, archive, atau audit trail.
- Event analitik menyimpan sesi anonim, nama event, halaman, section, elemen, dan metadata terbatas; tidak menyimpan nilai input formulir. Browser mengirim batch kecil ke antrean PostgreSQL, lalu satu worker meringkasnya agar request landing tetap ringan.
- Angka transaksi yang bersifat riwayat—jumlah terjual, customer pembeli, batch, dan penggunaan material—diturunkan dari transaksi/batch, bukan diubah langsung pada master.

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
- Tracking berjalan anonim secara default dan dapat dinonaktifkan dari footer atau halaman privasi. Nama, nomor WhatsApp, isi formulir, dan IP tidak masuk ke analitik. Ringkasan insight WhatsApp saat ini dibuka manual oleh admin melalui tautan pesan yang sudah terisi; tidak ada pengiriman otomatis sebelum integrasi resmi tersedia.

## Menjalankan lapisan data

1. Salin `.env.example` menjadi `.env.local`, lalu isi `DATABASE_URL` dengan koneksi PostgreSQL yang aktif.
2. Jalankan `pnpm db:generate` untuk membuat migrasi dari skema.
3. Tinjau berkas migrasi, kemudian jalankan `pnpm db:migrate`.

Form permintaan menyimpan data ke tabel `leads`. Bila variabel koneksi belum tersedia, form memberi pemberitahuan jelas dan tidak menyatakan data berhasil disimpan.
