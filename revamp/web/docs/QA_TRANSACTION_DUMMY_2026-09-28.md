# Uji alur transaksi dummy — 28 September 2026

Transaksi: `TRX-2026-UJI01` (`bd82f7af-4e8e-4a1f-bc9c-70298ce16b57`), klasifikasi `test`. Semua langkah dijalankan melalui back office lokal sebagai administrator. Tidak ada pengiriman email tambahan atau deploy produksi.

## Hasil alur

| Tahap          | Hasil                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| PO dan kontrak | PO fiktif terunggah; kontrak dummy siap.                                                                 |
| Tagihan        | Invoice DP Rp300.000 dan akhir Rp700.000 terbit; jatuh tempo 5 dan 12 Oktober 2026.                      |
| Pembayaran     | Dua bukti fiktif terunggah; Rp300.000 + Rp700.000 diverifikasi. Sisa tagihan Rp0.                        |
| Produksi       | Peringatan target kosong muncul. Pelepasan memakai alasan uji; sampel 1 unit dan batch 100 unit selesai. |
| Pengiriman     | Dua kiriman 40 dan 60 unit; masing-masing surat jalan tersedia, lalu ditandai dikirim.                   |
| Serah terima   | Dua PDF BAST dummy dan dua bukti bertanda tangan _contoh_ tersimpan. Kedua kiriman berstatus diterima.   |
| Penutupan      | Transaksi ditutup normal tanpa alasan pengecualian, sesudah seluruh 100 unit diterima dan saldo nol.     |

Tujuh render DocGen baru tepat sesuai batas: 1 kontrak, 2 invoice, 2 surat jalan, 2 BAST. Semuanya satu halaman, bertanda `DRAF CONTOH - BUKAN DOKUMEN RESMI`, tanpa placeholder tersisa. Total 13 dokumen dalam transaksi, termasuk penawaran dari pengujian sebelumnya, PO, dua bukti pembayaran, dan dua bukti BAST. Seluruh file privat ada dan SHA-256-nya sesuai database. Hanya penawaran lama yang memiliki ID email terkirim.

Audit transaksi berisi 31 catatan, semuanya memiliki aktor dan waktu. Pelepasan produksi menyimpan alasan serta hasil checklist; penutupan mencatat `exception: false`. Unduhan privat tanpa sesi mengembalikan HTTP 403. Tautan PDF dengan sesi admin terbuka, tetapi penampil PDF in-app browser menampilkan kanvas kosong; integritas dan tampilan file diperiksa langsung dari arsip privat. Perlu uji ulang pembukaan PDF di Chrome biasa sebelum rilis.

## Pemeriksaan negatif dan batas verifikasi

- Tanpa alasan, tombol pelepasan produksi tertahan karena target belum ditentukan.
- Sebelum dua BAST diunggah, tombol penutupan meminta alasan pengecualian; setelah keduanya tersimpan, penutupan normal tersedia.
- Setelah 40 + 60 unit direncanakan, sisa kuantitas 0 dan form pengiriman tidak aktif. Server juga membandingkan jumlah baru dengan jumlah penawaran di dalam transaksi database.
- Pemeriksaan kode menegaskan sales boleh mencatat pembayaran, sedangkan verifikasi pembayaran, pelepasan produksi, dan penutupan memerlukan administrator. Uji login sebagai sales belum dilakukan karena tidak menggunakan kredensial akun lain pada sesi ini.
- Validasi ekstensi dan signature PDF/JPG/PNG pada endpoint unggah telah diperiksa di kode. Uji unggahan berkas rusak secara langsung belum dilakukan pada transaksi yang kini sudah ditutup.
- Server dan UI diperketat agar penutupan normal memerlukan status `received` **dan** ID BAST terarsip untuk setiap kiriman.

Visual diperiksa pada 1440, 1024, dan 375 px tanpa overflow horizontal. `pnpm test` (8 lulus), `pnpm typecheck`, `pnpm lint`, dan `pnpm build` lulus. Format dua berkas aplikasi yang diubah lulus; `pnpm format:check` global masih gagal pada berkas lama `drizzle/meta/0012_snapshot.json` dan `pnpm-lock.yaml`, yang tidak diubah pada uji ini. Tidak ada migrasi baru.

## Stabilisasi lanjutan (28 September 2026)

Transaksi tertutup `TRX-2026-UJI01` tetap sebagai arsip dan tidak diubah. Transaksi baru `TRX-2026-UJI02` (`0a4ef36d-f833-438a-b811-ec0b0b86a6be`) dibuat hanya di database lokal dengan klasifikasi `test`, pelanggan fiktif, 100 unit senilai Rp1.000.000, satu tagihan simulasi, satu pengiriman simulasi 40 unit tanpa BAST, dan pembayaran simulasi yang belum diverifikasi. Tidak ada PDF DocGen baru, email, migrasi, atau deploy produksi.

- Unduhan PDF privat di Chrome biasa mencapai penampil PDF Chrome dengan nama berkas yang benar. Kontrol browser tidak diizinkan menginspeksi halaman internal penampil Chrome. Pemeriksaan HTTP terpisah mengonfirmasi status 200, `application/pdf`, `inline`, `private, no-store`, panjang 29.321 byte, dan SHA-256 persis sesuai database. Tanpa sesi, respons 403. Kegagalan kanvas pada in-app browser sebelumnya tidak menunjukkan file atau respons rusak.
- Berkas bernama `.pdf` yang memiliki header `%PDF-` tetapi tidak memiliki penutup PDF ditolak dengan pesan “Isi berkas tidak sesuai dengan jenisnya”; jumlah dokumen pada transaksi uji tetap nol. Validasi penutup JPEG/PNG juga diperketat.
- Saat sisa pengiriman 60 unit, input 70 unit ditahan oleh batas form. Guard server tetap membandingkan jumlah kumulatif dalam transaksi database. Satu pengiriman uji 40 unit tetap satu; tidak ada pengiriman baru.
- Rp300.000 pembayaran uji awal dan Rp10.000 yang dicatat sales sama-sama berstatus belum diverifikasi. Total pembayaran tervalidasi tetap Rp0 dan sisa tagihan tetap Rp1.000.000.
- Dengan BAST belum ada dan saldo masih tersisa, penutupan tanpa alasan pengecualian tertahan. Administrator masih dapat memakai jalur pengecualian beralasan sesuai keputusan produk, tetapi jalur itu tidak dijalankan dalam uji ini.
- Akun sales sementara lokal dapat mencatat pembayaran uji, tetapi UI tidak menampilkan verifikasi, pelepasan produksi, atau penutupan. Tiga server action tersebut diuji dengan sesi sales sementara melalui POST formulir asli dan semuanya menolak permintaan (HTTP 500 akibat exception otorisasi); audit dan status transaksi tidak berubah. Akun sales dinonaktifkan dan seluruh sesinya dicabut setelah uji.
- Server kini menolak dokumen dan pembayaran baru pada transaksi yang selesai. Formulir langkah pada transaksi selesai dinonaktifkan secara visual/interaktif, sedangkan tautan arsip tetap dapat dibuka.
- Visual ulang pada 1440 px dan 375 × 812 tidak menunjukkan horizontal overflow atau CTA tertutup; ukuran browser dipulihkan. Pengecekan `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, dan `pnpm build` lulus. Snapshot Drizzle dan lockfile diabaikan oleh Prettier karena keduanya berkas hasil generator, bukan sumber yang diedit tangan.
