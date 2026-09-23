# Product requirements — Anugrah Plastik

## Tujuan

Meningkatkan jumlah RFQ berkualitas dari calon pelanggan yang membutuhkan cetak plastik custom, sambil memberi tim satu tempat untuk mengelola konten dan menindaklanjuti lead.

## Pengguna utama

- Pelaku industri yang membutuhkan sparepart atau komponen pengganti.
- Pemilik produk yang membutuhkan komponen atau kemasan custom.
- Admin konten, sales, dan pengelola website.

## Nilai yang harus terasa

- Free moulding, tanpa minimum order, dan sampel dapat dibahas lebih dahulu.
- Proses dijelaskan dengan bahasa yang mudah dipahami.
- Calon pelanggan dapat memulai dari sampel, gambar, atau ide.

## Rilis pertama

1. Website publik yang cepat, mobile-first, dan SEO-ready.
2. Landing page, portfolio, FAQ, panduan perbandingan proses, dan halaman inquiry.
3. CMS section-based untuk hero, layanan, portfolio, FAQ, CTA, navigasi, kontak, dan metadata.
4. CRM dasar: lead, status, catatan follow-up, attribution, dan hak akses admin/content/sales.
5. Notifikasi lead ke sales melalui WhatsApp Cloud API setelah kredensial tersedia.
6. Pengukuran perilaku anonim dengan opt-out yang dapat diakses dari footer dan halaman privasi.
7. Insight perilaku anonim: section engagement, scroll milestone, CTA, FAQ, portfolio, form funnel, dan titik keluar.

## Batasan rilis pertama

- Form publik mengumpulkan nama, nomor WhatsApp, dan kebutuhan singkat.
- Analitik perilaku memakai ID kunjungan acak dan dapat dinonaktifkan; isi form, nomor telepon, pesan, dan IP tidak direkam sebagai event.
- Tidak ada inventory, pengadaan, keuangan, quotation otomatis, chatbot, atau upload file publik pada rilis pertama.
- Media CMS disimpan pada disk server; database hanya menyimpan metadata.

## Metrik keberhasilan

- Jumlah lead yang berstatus qualified atau lebih tinggi.
- Rasio CTA klik ke form submit.
- Sumber campaign dan halaman yang menghasilkan lead.
- Waktu respons awal sales terhadap lead baru.
- Section/CTA dengan engagement tinggi, titik keluar, dan rasio form dimulai terhadap submit.

## Kriteria penerimaan

- Semua section publik dapat diedit dan dipublish tanpa perubahan kode.
- Layout rapi pada iPhone 12 mini (375 × 812), tablet, dan desktop.
- Submit inquiry menghasilkan lead beserta halaman asal, referrer, dan UTM.
- Konten draft tidak terlihat publik; content, sales, dan admin hanya dapat mengakses fungsi sesuai perannya.

## Epic operasional

- Customer, supplier, material, warna/lot, barang, mould, dan file desain privat menjadi master bersama.
- Transaksi bernomor `TRX-YYYY-#####` menautkan penawaran, PO, kontrak, invoice, pembayaran, batch produksi, pengiriman, dan BAST.
- Pembayaran dapat parsial; hanya administrator yang memverifikasi pembayaran dan melepas produksi.
- File kerja 3D tidak dipublikasikan. Preview browser dibatasi ke STL, OBJ, dan GLB; sumber CAD diunduh tim berwenang.
- Penagihan transaksi, biaya proyek, dan piutang dicatat per transaksi. Jurnal akuntansi umum, stok fisik, dan pengadaan supplier berada di luar scope epic ini.
