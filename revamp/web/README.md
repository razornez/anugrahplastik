# Anugrah Plastik — Revamp Website

Website publik untuk mengenalkan layanan cetak plastik custom, mengedukasi calon pelanggan, dan menangkap permintaan yang siap ditindaklanjuti.

## Menjalankan lokal

Prasyarat: Node.js 20 LTS dan pnpm 9.12.0.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Buka `http://localhost:3000`.

## PostgreSQL

1. Salin `.env.example` ke `.env.local`.
2. Isi `DATABASE_URL` untuk PostgreSQL lokal atau server.
3. Buat dan terapkan migrasi:

```bash
pnpm db:generate
pnpm db:migrate
```

Tanpa `DATABASE_URL`, halaman tetap dapat dibuka. Form permintaan memberi informasi jelas bahwa penyimpanan belum siap, sehingga tidak ada prospek yang dianggap berhasil tersimpan secara keliru.

## Pemeriksaan sebelum push

```bash
pnpm format:check
pnpm lint
pnpm build
```

Pemeriksaan yang sama berjalan otomatis pada setiap push dan pull request ke `main`.

## Dokumen proyek

- [PRD](docs/PRD.md)
- [Arsitektur](docs/ARCHITECTURE.md)
- [Alur BMad](docs/BMAD-REFERENCE.md)
- [SDLC](docs/SDLC.md)
- [Pedoman engineering](docs/ENGINEERING-GUIDELINES.md)
- [Quality gates](docs/QUALITY-GATES.md)
- [Runbook](docs/RUNBOOK.md)

## Tahap berikutnya

1. Menjalankan PostgreSQL pada lingkungan pengembangan dan menerapkan migrasi.
2. Membuat autentikasi dan back office untuk konten, portfolio, dan pipeline prospek.
3. Menghubungkan notifikasi WhatsApp, analitik dengan persetujuan pengunjung, serta deployment Docker.
