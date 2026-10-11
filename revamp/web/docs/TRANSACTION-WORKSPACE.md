# Ruang kerja Transaksi

Index memakai satu daftar compact, tiga filter terpisah, dan pagination 25 transaksi. Nilai serta arahan index dan detail berasal dari `transaction-workspace.ts`; data daftar dibaca dalam query terkelompok, bukan mengambil detail setiap transaksi. Cursor membandingkan waktu dalam presisi milidetik yang sama dengan nilai URL.

## Pengaman data

- Data nyata adalah default. `view=test` hanya berlaku dalam development dan menampilkan transaksi berpenanda `test`; produksi mengabaikannya.
- Seed lokal `node scripts/seed-transaction-workspace.mjs` idempoten, membatasi koneksi database lokal, dan membuat 28 transaksi `QA-COMPACT-001` sampai `028`. Nama pekerjaan memuat `[UJI COMPACT]`. Tidak ada email, nomor resmi, atau render API.
- Cadangan sebelum seed: `storage/backups/visitor-report-2026-10-04T00-42-58-351Z.dump`. Tidak ada migrasi skema.
- Jangan bersihkan fixture sekarang. Sebelum rilis, buat backup baru, inventarisasi transaksi dengan `data_class=test` DAN referensi `QA-COMPACT-001` sampai `028`, lalu tinjau jumlah dan relasinya. Penanda test saja bukan izin menghapus seluruh data uji lama. Pembersihan memerlukan tahap terpisah; tidak ada penghapusan dalam pekerjaan ini.
- Invoice terbit mencakup status issued/sent/partial/paid/overdue, bukan cancelled. Jumlah invoice memakai nilai tagihan tersimpan, termasuk invoice pelunasan yang sudah neto DP. Pembayaran inbound pelanggan hanya dihitung saat verified. Sisa tidak negatif; kelebihan dibedakan. Tanpa invoice bukan lunas. Metode pajak lama tidak dikonversi otomatis.

## Verifikasi 4 Oktober 2026

- Suite: 95 pengujian, 94 lulus, satu dilewati, tidak ada kegagalan. Termasuk hitungan desimal, DP, pembayaran belum diverifikasi, invoice batal, role admin/sales/editor, query daftar/detail, filter gabungan, dan pagination maju-mundur.
- Typecheck, lint, format check, dan production build lulus.
- Browser Chrome yang sudah login: index/detail pada 1440, 1024, 980, 768, 375 x 812, dan 812 x 375, tema terang/gelap. Label panjang, nominal, menu mobile, informasi pendukung, enam langkah, filter, serta fokus keyboard diperiksa. Layout tidak melebar horizontal.
- Link kembali mempertahankan URL pencarian/filter dan memulihkan posisi halaman yang disimpan saat pekerjaan dibuka. Storage browser yang dibatasi tidak menghentikan navigasi.
- Empat PDF pratinjau lokal disimpan privat di `storage/qa/transaction-workspace-2026-10-04/`; setiap halaman diperiksa sebagai PNG. Kop mengikuti template Anugrah Plastik dan semua output bertanda pratinjau, bukan dokumen pelanggan. Arsip lama tidak ditimpa; unduhan tanpa sesi ditolak.
- Tidak ada aktivasi DocGen resmi, render berbayar, pesan pelanggan, push, atau deploy.
