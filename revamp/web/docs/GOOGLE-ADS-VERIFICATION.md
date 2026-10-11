# Verifikasi Performance Summary — 2 Oktober 2026

Implementasi lokal di `/admin/marketing`; tidak ada deploy, perubahan kampanye, anggaran, atau kartu billing.

- Default 25 September–1 Oktober 2026 (7 hari lengkap WIB). Cache nyata: 6 klik, 69 impresi, biaya Rp78.190, CPC Rp13.032 (78190 ÷ 6, dibulatkan untuk tampilan).
- Empat pilihan metrik unik; Konversi dan Nilai konversi tetap tersedia. Pilihan mengganti kartu, garis, legenda, tabel, dan parameter URL yang bersangkutan.
- Rentang 30 dan 90 hari diperiksa: masing-masing 30/90 baris tabel. Rentang kosong tidak menghasilkan grafik nol palsu.
- Pemeriksaan browser nyata pada viewport 1440, 1024, 768, 375×812, dan 812×375; tema terang/gelap, modal, fokus keyboard, nilai langsung, dan overflow. Ini emulasi viewport browser, bukan pengujian perangkat iPhone fisik.
- Label grafik memakai penempatan berbasis kotak untuk menghindari tabrakan antar tanggal/seri; konektor menunjukkan titik asal label yang digeser. Tanggal mobile diselang dua baris. Tabel lebar bergulir di dalam panel, bukan memperlebar halaman.
- Suite lengkap dengan test database opt-in: 69 test lulus, tanpa test dilewati. Ketujuh test Google Ads juga dijalankan terpisah dan lulus. Test database memakai schema sementara dan respons API palsu; 8 klaim bersamaan hanya 1 panggilan laporan, kegagalan tidak menghapus cache.
- Test server meliputi role admin/sales, penolakan editor/anonim, parameter metrik manual, CSV privat, rumus CPC, dan pengaman formula CSV.
- Typecheck, ESLint, Prettier, build, dan `git diff --check` lulus.

Pembaruan otomatis adalah satu percobaan per hari Jakarta yang dibagi halaman dan endpoint sinkron. Kegagalan tidak memicu pengulangan otomatis saat reload; tombol manual tetap dapat digunakan. Tidak ada perubahan jadwal produksi pada tahap ini.
