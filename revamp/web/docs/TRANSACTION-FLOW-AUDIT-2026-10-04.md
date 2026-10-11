# Audit transaksi dan email - 4 Oktober 2026

## Status

Audit lokal dan perbaikan pengaman transaksi telah dikerjakan. Ini bukan persetujuan rilis, bukan bukti bahwa tidak ada bug, dan bukan pengujian pengiriman email nyata. Perubahan lokal lain dipertahankan; tidak ada push, deploy, migrasi, perubahan kampanye, atau aktivasi DocGen resmi.

## Backup dan data uji

- Backup PostgreSQL sebelum pengujian: `storage/backups/visitor-report-2026-10-04T10-54-43-250Z.dump`, 4.983.047 byte, dibuat dengan `scripts/backup-local-database.mjs`.
- Regresi menggunakan dua koneksi database lokal, UUID sementara, transaksi `data_class=test`, pelanggan bertanda `[UJI]`, serta provider DocGen yang diblokir.
- Test membersihkan hanya ID yang dibuatnya. Satu fixture dari percobaan test yang gagal dibersihkan secara terarah setelah memverifikasi ID, nomor referensi, penanda test, dan nama pelanggan; data demo lama tidak dihapus.
- Restore dilakukan ke database lokal terpisah terlebih dahulu dengan `pg_restore`; jangan menimpa database kerja tanpa verifikasi dan persetujuan. Backup privat dan hasil render tidak dimasukkan ke Git.

## Temuan dan perbaikan

1. **Verifikasi pembayaran paralel:** dua pembayaran berbeda dapat membaca totalnya masing-masing sebelum transaksi lain commit, lalu meninggalkan status `partial` meskipun gabungan pembayaran sudah lunas. Test mereproduksi kondisi sebelum perbaikan dengan sinkronisasi setelah membaca total. Kode sekarang mengunci induk transaksi sebelum mengubah pembayaran dan menghitung ulang total.
2. **Ketepatan nominal:** verifikasi dan validasi status pembayaran memakai `moneyCents` berbasis BigInt, bukan pembandingan floating-point. Invoice draft/dibatalkan tidak dihitung sebagai invoice terbit; catatan pembayaran ditolak bukan pembayaran yang menunggu verifikasi.
3. **Pelepasan produksi:** pemeriksaan kelengkapan, pelepasan, dan audit sekarang berada di dalam transaksi database dengan penguncian induk yang sama. Query dijalankan berurutan pada satu koneksi transaksi.
4. **Status manual:** tidak dapat menutup transaksi lewat perubahan status umum atau melewati pemeriksaan pelepasan produksi. Transaksi ditutup/dibatalkan tidak dapat dibuka kembali melalui aksi ini. Verifikasi pembayaran pada transaksi ditutup juga ditolak.
5. **Tombol formulir:** tombol submit `transaction-flow-form` memakai gaya primer admin yang sama, termasuk tema, hover, tekan, dan fokus; tidak lagi memakai warna biru warisan.

## Bukti pengujian

`tests/transaction-flow-integration.test.cjs` menjalankan aksi server asli dengan database lokal dan dependensi eksternal diblokir:

- Dua verifikasi bersamaan: hasil sesudah perbaikan `verified`; verifikasi ulang ditolak.
- Invoice DP berstatus paid dan final berstatus sent ikut dihitung; invoice cancelled tidak ikut dihitung.
- Sales, editor konten, dan pengguna tanpa sesi ditolak untuk verifikasi pembayaran serta pelepasan produksi.
- Pelepasan tanpa data lengkap memerlukan alasan pengecualian; alasan valid diproses bersama audit.
- Penutupan tanpa penerimaan lengkap ditolak. Penerimaan 80/100 menyisakan 20; rencana pengganti 21 ditolak, 20 diterima.
- Menandai pengiriman tanpa PDF siap ditolak. Total penerimaan 100 memungkinkan penutupan normal; penutupan ulang dan pembukaan status manual ditolak.

Status bukti penerimaan di fixture dimasukkan langsung sebagai data uji. Ini menguji perhitungan dan pengaman penutupan, **bukan** menggantikan uji unggah bukti bertanda tangan melalui browser.

Suite lengkap: 122 test, 121 lulus, 1 dilewati, 0 gagal. Suite mencakup penguncian pengiriman email pada dua koneksi dengan transport simulasi, validasi origin upload, pemilihan transaksi email, matematika diskon/pajak/DP, laporan, dan kebijakan dokumen. Typecheck, lint, format check, dan build berhasil. Test yang dilewati tidak dianggap lulus.

## Pemeriksaan tampilan

- Chrome yang sudah login, fixture lama `QA-COMPACT-001` dengan judul panjang, dibuka tanpa mengubah data.
- Enam langkah detail diperiksa pada 1440x900, 1024x900, 980x900, 768x900, 375x812, 812x375 dalam tema terang/gelap: 72 pemeriksaan DOM/layout, tanpa overflow horizontal.
- Index diperiksa pada ukuran dan tema yang sama: 12 pemeriksaan tambahan.
- Screenshot tersimpan privat di `storage/integration-review-2026-10-04/audit-*.jpg`; hasil pengukuran detail di `audit-layout-matrix.json`.
- Screenshot representatif semua langkah mobile terang, pembayaran/produksi/STB mobile gelap, pembayaran desktop terang/gelap, produksi lanskap, serta index ditinjau visual. Tidak mengklaim seluruh screenshot telah diperiksa pixel demi pixel.
- Fokus keyboard pada tombol pencatatan pembayaran berpindah dengan Tab; setelah scroll browser selesai, batas bawah kontrol 428 px, di atas navigasi bawah 737 px pada viewport 812 px. Overflow vertikal dokumen tetap terbuka.
- Ini emulasi ukuran iPhone 12 mini di Chrome, bukan pemeriksaan Safari/iOS fisik. Screenshot full-page menampilkan navigasi fixed pada posisi viewport saat capture; itu bukan bukti navigasi menutupi bagian tersebut setelah pengguna menggulir.

## Dokumen lokal

Empat template dirender melalui renderer lokal, tanpa API/kredit dan tanpa data pelanggan: penawaran, invoice, surat jalan, STB. Masing-masing satu halaman. Kop, tabel, catatan penerimaan sebagian, dan ruang tanda tangan diperiksa pada PNG hasil Poppler. Output QA privat di `storage/integration-review-2026-10-04/workflow-audit-pdf`; arsip PDF historis tidak diubah.

## Belum diverifikasi / pekerjaan sebelum rilis

- Satu perjalanan browser yang membuat seluruh data baru dari penawaran hingga upload STB, termasuk koreksi bukti pengganti, belum dijalankan lengkap pada putaran ini.
- Upload lima lampiran dan unduhan privat lintas role secara end-to-end, serta seluruh skenario aksi form berulang/idempotensi keuangan, masih perlu pemeriksaan khusus. Test origin dan send-concurrency tidak membuktikan seluruh jalur tersebut.
- SMTP/IMAP nyata sedang menunjukkan koneksi perlu diperiksa; tidak ada refresh provider atau email pelanggan yang dikirim dalam audit ini. Pengujian transport nyata memerlukan penerima uji dan persetujuan terpisah.
- Tidak menggunakan counter resmi untuk simulasi; paralel alokasi nomor resmi tidak diklaim telah diuji end-to-end di database pada putaran ini.
- Safari/iOS fisik, pembaca layar nyata, pengukuran kontras lengkap, serta benchmark performa terbaru belum selesai. Benchmark historis bukan bukti performa versi saat ini.
- Penerbitan resmi, render berbayar, push, dan deploy tetap tidak dilakukan.
