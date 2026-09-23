# Operasional: tracker, transaksi, master, dan desain 3D

## Tujuan irisan pertama

Membuat satu nomor transaksi `TRX-YYYY-#####` sebagai penghubung customer, pekerjaan, dokumen, pembayaran, produksi, pengiriman, dan serah terima. Landing tetap terpisah: ia hanya mengirim batch perilaku anonim dan tidak pernah membaca tabel transaksi.

## Peran dan batas akses

| Tindakan                                 | Administrator | Sales                   | Editor konten |
| ---------------------------------------- | ------------- | ----------------------- | ------------- |
| Customer dan transaksi                   | Ya            | Ya                      | Tidak         |
| Supplier, bahan, barang, mould           | Ya            | Lihat melalui transaksi | Tidak         |
| Catat pembayaran                         | Ya            | Ya, menunggu cek        | Tidak         |
| Verifikasi pembayaran dan lepas produksi | Ya            | Tidak                   | Tidak         |
| File desain privat                       | Ya            | Ya untuk pekerjaan      | Tidak         |
| Konfigurasi DocGen/Gmail                 | Ya            | Tidak                   | Tidak         |

## Status yang dipakai

Status utama tidak dipaksakan menjadi satu rantai panjang. Tiga jalur ditampilkan bersamaan:

- Komersial: `quotation` → `po_received` → `contract` → `completed` atau `cancelled`.
- Pembayaran: `awaiting_invoice` → `awaiting_payment` → `partial` → `verified` → `settled`.
- Pemenuhan: `not_released` → `released` → `sample` → `production` → `shipping` → `bast_pending` → `completed`.

Hanya administrator yang dapat melepaskan produksi, dan hanya setelah ada pembayaran masuk berstatus terverifikasi. Hold dan pembatalan menyimpan alasan serta audit, bukan menghapus riwayat.

## Dokumen dan komunikasi

Surat penawaran, kontrak, invoice DP/final, surat jalan, dan BAST dirancang tersimpan sebagai arsip privat permanen. Adapter DocGen menggunakan template ID, idempotency key, dan webhook HMAC; URL PDF sementara dari provider selalu disalin ke storage privat. Pengiriman email membutuhkan OAuth mailbox perusahaan dan mencatat message ID, penerima, serta status. Keduanya belum diaktifkan sampai kredensial perusahaan tersedia.

Faktur pajak tidak dibuat aplikasi. Operator hanya mencatat nomor, tanggal, status, dan PDF resmi yang diterbitkan melalui sistem pajak yang berlaku.

## File 3D

- File customer dan file internal mempunyai asal berbeda, versi, checksum, pembuat, serta tautan ke customer/barang/mould/transaksi.
- Sumber yang diterima: STEP/STP, IGES/IGS, STL, OBJ, GLB, DWG/DXF, NX/PRT.
- Browser hanya menampilkan STL, OBJ, dan GLB. CAD lain diunduh dari endpoint privat setelah autentikasi.
- Maksimum sumber 100 MB/file; preview 25 MB; kuota 5 GB; peringatan 80%; upload diblokir mulai 90%.
- Reuse file internal harus mendapat persetujuan administrator; default tidak otomatis dipakai ulang.

## Pengujian sebelum rilis berikutnya

1. Buat customer, transaksi, item, penawaran, pembayaran parsial, verifikasi, dan pelepasan produksi.
2. Uji pembayaran tanpa verifikasi tidak bisa melepaskan produksi.
3. Uji file sah/tidak sah, batas ukuran, batas kuota, unduh privat, dan preview 3D.
4. Uji satu pengiriman parsial serta BAST tertunda.
5. Uji retry DocGen/webhook dan import email setelah OAuth dikonfigurasi.
