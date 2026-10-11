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

## Alur transaksi dan DocGen

1. Sebelum migrasi transaksi, cadangkan PostgreSQL dan media privat; simpan keduanya di luar web root. Jalankan `pnpm db:migrate` sekali di lingkungan uji dan periksa tabel `transaction_documents` memiliki `operation_key` dan `payload`.
2. Di akun DocGen, buat template HTML dari `docs/templates/` untuk penawaran, invoice, surat jalan, dan STB. Sumber tata letak yang ditinjau adalah `penawaran-docgen.html`, `invoice-resmi-docgen.html`, `surat-jalan-docgen.html`, dan `bast-docgen.html`. Semua memakai kop A4 yang konsisten dengan contoh surat perusahaan; logo dan identitas diisi dari konfigurasi penerbit. Template yang sama menampilkan penanda DRAF saat `isDummy=true`, tetapi ID template contoh dan resmi harus tetap berbeda. Catat setiap template ID pada konfigurasi privat server. Jangan menyimpan kunci dalam Git atau audit. Template kontrak lama hanya arsip; jangan buat, kirim, atau ulangi render-nya.
   Setelah menerbitkan versi baru `docs/templates/penawaran-docgen.html` pada template penawaran yang dituju, verifikasi variabel dan layout melalui pratinjau DocGen dengan data fiktif. Baru set `DOCGEN_QUOTATION_TEMPLATE_READY=yes` pada environment privat. Nilai default `no` menahan pembuatan PDF penawaran agar template jarak jauh yang masih lama tidak digunakan. Flag ini bukan izin dokumen resmi; aturan mode dummy dan gerbang empat template resmi tetap berlaku.
   Surat jalan memakai proses yang sama: terbitkan `docs/templates/surat-jalan-docgen.html` pada template tujuan, uji dengan data fiktif, lalu set `DOCGEN_DELIVERY_TEMPLATE_READY=yes`. Selama `no`, rencana pengiriman dan koreksi dapat disimpan, tetapi PDF baru ditahan. Administrator perlu menetapkan nomor SJ/AMB terakhir pada `/admin/settings/delivery` sebelum surat resmi pertama; pengiriman lama dan PDF-nya tidak dinomori ulang.
   STB per pengiriman memakai `docs/templates/bast-docgen.html` sebagai template contoh terpisah. Setelah mencocokkan isi template DocGen dan menguji PDF fiktif, set `DOCGEN_BAST_TEMPLATE_READY=yes`. Saat flag `no`, bukti STB eksternal yang benar-benar bertanda tangan tetap dapat diunggah, tetapi PDF aplikasi tidak dibuat. Untuk nomor resmi STB/AMB, administrator menetapkan nomor terakhir yang dipakai di luar aplikasi pada `/admin/settings/handover`; dokumen uji memakai UJI. PDF STB tanpa tanda tangan tidak menandai barang diterima. Jumlah penerimaan dicatat saat bukti masuk, dan selisih dapat dialokasikan ke kiriman pengganti. Bukti lama tetap diarsipkan bila administrator menggantinya dengan alasan.
   Template sementara selalu bertanda **DRAF CONTOH - BUKAN DOKUMEN RESMI**. Selama `DOCGEN_TEMPLATE_MODE` belum diset ke `approved`, aplikasi hanya merender PDF dari transaksi berklasifikasi `test` dan hanya mengirim dokumen ke `razornez@gmail.com`. Jangan ubah mode ke `approved` sampai keempat desain resmi, isi komersial, dan penerima produksi disetujui.
   Sebelum meminta persetujuan, jalankan `node scripts/render-official-template-review.mjs` untuk empat PDF pratinjau fiktif tanpa API/kredit di `output/pdf/`, lalu jalankan empat skrip `preview-*-template.mjs` untuk tabel panjang. Periksa setiap halaman, kop lanjutan, angka, identitas, dan kecocokan lampiran; jangan gunakan PDF pratinjau sebagai dokumen pelanggan. Cocokkan alamat, kontak, rekening, logo, penanda tangan, serta metode pajak di konfigurasi admin dengan data saat ini. Untuk rilis resmi, empat `DOCGEN_OFFICIAL_TEMPLATE_*_ID` (penawaran, invoice, surat jalan, STB) harus diisi dengan ID berbeda dari template contoh. `DOCGEN_OFFICIAL_INVOICE_APPROVED=yes`, `DOCGEN_OFFICIAL_RELEASE_APPROVED=yes`, dan `DOCGEN_TEMPLATE_MODE=approved` baru diaktifkan **setelah pemilik menyetujui keempat hasil PDF final dan identitas/perhitungan**. Salah satu nilai hilang/duplikat membuat pembuatan dokumen resmi tidak tersedia; arsip contoh lama tetap dibatasi ke penerima uji. Aktivasi tidak mengirim email dengan sendirinya. Jangan mengubah ID template contoh atau PDF yang sudah diarsipkan.
   Akun DocGen aktif pada 28 September 2026 menerima key `sk_live_` dan endpoint `https://docgen.razornez.net/v1`; dokumentasi publik masih menampilkan `dg_live_` dan `api.docgen.id`. Verifikasi akses dengan `GET /v1/templates` menggunakan key baru sebelum memakai kredit. Jangan tampilkan nilai key dalam log atau tiket. API aktif membuat PDF melalui `POST /v1/batches` dengan satu item dan membaca hasil melalui `GET /v1/batches/{id}/documents`, bukan endpoint `/v1/render` yang tercantum pada dokumentasi lama.
   Pada uji 28 September 2026, batch awal gagal karena executable Chromium Playwright belum ada di VPS DocGen; kredit terpotong **0**. Browser dipasang pada `/var/www/docgen` dengan `pnpm --filter @docgen/renderer exec playwright install chromium`, lalu diuji dengan perintah screenshot Playwright. Setelah itu, lima template contoh berhasil merender PDF satu halaman tanpa placeholder tersisa. Aplikasi mengarsipkan PDF penawaran pada storage privat dan satu email uji dikirim hanya ke `razornez@gmail.com`. Pastikan instalasi Chromium juga dijalankan pada setiap deploy DocGen jika versi Playwright berubah; bila worker kembali gagal, periksa log PM2 `docgen-worker` dan keberadaan executable Chromium sebelum mengulang batch.
3. Uji satu penawaran bernilai kecil di lingkungan uji: rincian dan pajak → PDF → arsip privat → unduh melalui endpoint admin. Periksa hasil PDF sebelum mengirim email.
   Fixture lokal khusus tersedia dalam `scripts/seed-docgen-qa.sql`: customer `[UJI] Pelanggan DocGen` dan transaksi `TRX-2026-UJI01` dengan `data_class=test`. Skrip ini idempoten, hanya untuk database lokal, dan tidak boleh dijalankan di production. Alamat customer fixture adalah satu-satunya penerima PDF contoh yang diizinkan.
4. Jika dokumen berstatus **Perlu diperiksa**, buka DocGen dan periksa apakah permintaan sudah menghasilkan PDF. Percobaan arsip ulang hanya tersedia bila ID batch sudah tersimpan; aplikasi memeriksa batch yang sama dan tidak membuat batch baru. Jika ID batch belum tercatat, rekonsiliasi manual wajib dilakukan agar tidak ada dokumen atau biaya ganda.
5. Jika email berstatus tidak pasti, periksa kotak **Email terkirim** dan mailbox CS sebelum mencoba mengirim lagi. Tidak ada pengiriman ulang otomatis.
6. Verifikasi pembayaran dan pelepasan produksi hanya dilakukan administrator. Peringatan kesiapan produksi boleh dilewati dengan alasan yang tercatat. Pengiriman parsial dan BAST disimpan per pengiriman; penutupan dengan pekerjaan atau saldo tertunda membutuhkan alasan pengecualian.

Integrasi DocGen tidak aktif bila API key atau template ID belum diisi. Draf transaksi dan pencatatan internal tetap dapat digunakan; PDF serta pengiriman dokumen tidak boleh dianggap teruji sampai uji nyata berhasil.

Build production sementara memakai `next build --webpack`. Pada Next.js 16.3.5 di lingkungan Windows ini, build Turbopack gagal pada resolver internal `next/font/google`; build Webpack berhasil tanpa mengganti font landing. Uji ulang opsi Turbopack saat versi framework diperbarui.

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

# Audit SEO organik lokal

Audit otomatis Pemasaran memakai `SERPAPI_API_KEY` di `.env.local` (jangan dicatat di Git/chat). Administrator dapat menekan **Periksa sekarang** di `/admin/growth/competitors`. Satu audit selesai per minggu kalender WIB; enam kata kunci memakai maksimal enam pencarian. Aplikasi mengunci pemakaian pada 36 pencarian per bulan; kegagalan parsial tidak menerbitkan peringkat baru. Snapshot selesai sebelumnya tetap tersedia dengan tanggalnya.

Audit yang sama menyimpan frasa/pertanyaan terkait dan pesan iklan yang terlihat bila SerpApi menyediakannya. Ini bukan volume pencarian atau performa iklan. Setelah audit organik selesai, satu pemeriksaan Google Trends untuk tema produk bergilir dapat dijalankan per minggu; panggilan ini dilewati bila sisa jatah bulanan harus disimpan untuk audit organik berikutnya dan satu percobaan ulang. Tren adalah minat relatif, bukan jumlah pembeli. `/admin/growth/opportunities` menampilkan bukti dan keputusan admin; ide produk baru tidak boleh langsung ditawarkan tanpa validasi produksi. Audit lama tanpa metadata peluang tetap dapat dibaca. Tidak ada perubahan Google Ads otomatis.

Rute `POST /api/internal/growth/audit` memerlukan `Authorization: Bearer <GROWTH_AUDIT_CRON_TOKEN>`. Penjadwalan produksi **belum diaktifkan**. Setelah persetujuan rilis dan konfigurasi token privat, jadwalkan Senin 09.00 WIB (`CRON_TZ=Asia/Jakarta`, `0 9 * * 1`) untuk memanggil rute tersebut. Jangan memasukkan token ke perintah yang terekam log. Periksa respons dan halaman rincian setelah setiap audit. Kegagalan SerpApi atau crawler tidak boleh diganti dengan angka perkiraan.

Pemeriksaan halaman hanya membaca URL HTTPS publik dari domain master, menghormati robots.txt, membatasi ukuran, waktu, dan redirect. Temuan judul/H1/isi adalah bukti yang tampak pada halaman, bukan penjelasan kausal posisi Google. Riwayat pemeriksaan manual dipertahankan terpisah.
