# Delivery protocol

Pedoman ini menentukan seberapa jauh sebuah pekerjaan perlu direncanakan, dibangun, dan diuji. Tujuannya adalah menjaga kualitas tinggi tanpa memperlambat perbaikan kecil.

## Prinsip keputusan

- Mulai dari outcome, bukan dari komponen atau tabel yang ingin dibuat.
- Jangan menyamakan build yang lulus dengan pengalaman pengguna yang baik.
- Gunakan tingkat proses paling ringan yang masih mampu mencegah regresi nyata.
- Jika sebuah keputusan akan memengaruhi arsitektur, data, alur kerja, atau tampilan publik, keputusan itu harus terlihat dan disetujui sebelum implementasi.
- Jangan menambah fitur karena terlihat lengkap. Tambahkan hanya bila memperkuat pekerjaan pengguna atau metrik bisnis yang telah ditentukan.

## Tiga jalur kerja

### 1. Jalur cepat — perbaikan UI terbatas

Gunakan bila perubahan hanya mengoreksi atau memperjelas tampilan pada area yang sudah ada: warna, jarak, tipografi, label, state aktif, ikon, atau responsivitas lokal.

Syarat:

- Tidak mengubah data model, otorisasi, perilaku bisnis, rute, integrasi, atau funnel.
- Target visual dan area yang terdampak jelas.
- Tidak menyentuh lebih dari satu alur pengguna.

Wajib dilakukan:

1. Nyatakan tujuan visual dan viewport yang diperiksa.
2. Ubah sekecil mungkin pada komponen atau style terkait.
3. Periksa langsung area yang berubah pada desktop dan mobile yang relevan.
4. Jalankan format check dan lint.

Tidak perlu dipaksakan:

- Discovery end-to-end, migrasi, dokumen arsitektur, atau build produksi penuh—kecuali perubahan menyentuh layout global, routing, konfigurasi, dependency, atau komponen bersama.

Contoh: menambah sidebar yang sudah memiliki struktur menu dan kebutuhan visual yang jelas, memperbaiki spacing form, atau memperbaiki active state.

### 2. Jalur standar — fitur atau alur tunggal

Gunakan bila perubahan membuat kemampuan baru dalam satu domain, misalnya halaman daftar prospek, media upload, atau editor FAQ.

Sebelum membangun, tulis ringkas:

- masalah dan outcome bisnis;
- pengguna serta pekerjaan yang ingin diselesaikan;
- alur utama dan state empty, loading, error, serta sukses;
- data input/output, role yang berhak, dan dampak pada telemetry;
- acceptance criteria visual dan fungsional.

Wajib dilakukan:

1. Implementasi UI, validasi, authorization, dan penyimpanan secara konsisten.
2. Uji alur utama dan kondisi gagal yang relevan.
3. Periksa desktop, tablet, dan iPhone 12 mini bila tampilan berubah.
4. Jalankan format check, lint, type check, dan build produksi.
5. Perbarui dokumentasi bila ada perubahan operasional atau data.

### 3. Jalur fondasi — epic atau keputusan lintas domain

Gunakan bila pekerjaan mengubah navigasi utama, informasi arsitektur, schema inti, autentikasi, analitik, CRM, inventory, keuangan, atau integrasi eksternal.

Sebelum implementasi, harus ada:

- problem statement dan indikator keberhasilan;
- peta modul dan informasi arsitektur;
- peran, permission matrix, dan lifecycle data;
- user flow prioritas beserta state dan edge case;
- keputusan UX yang dikunci dan alternatif yang ditolak;
- desain visual yang dapat ditinjau, serta baseline screenshot bila mengganti UI yang ada;
- risiko keamanan, privasi, migrasi, cache, dan rollback;
- backlog terurut menjadi irisan kecil yang dapat diuji.

Wajib dilakukan:

1. Review rencana sebelum kode ditulis.
2. Catat keputusan yang bersifat jangka panjang sebagai ADR.
3. Bangun secara bertahap dengan checkpoint visual dan fungsional di setiap irisan.
4. Jalankan seluruh quality gate dan smoke test release.

## Aturan untuk pekerjaan UI

Sebelum membuat atau mengubah UI yang bersifat standar atau fondasi, tetapkan:

- siapa pengguna dan tugas utama yang harus selesai dalam satu kunjungan;
- hierarki informasi: apa yang terlihat pertama, kedua, dan hanya saat dibutuhkan;
- tindakan primer tunggal untuk setiap layar;
- state data kosong, loading, error, sukses, dan akses ditolak;
- perilaku pada desktop, tablet, dan mobile;
- token warna, tipografi, spacing, elevasi, ikon, dan motion yang konsisten;
- ukuran pembanding atau referensi visual bila pixel fidelity diperlukan.

Komponen tidak boleh ditambah hanya untuk membuat layar terlihat ramai. Setiap elemen harus memiliki fungsi informasi, navigasi, tindakan, atau umpan balik.

## Kewajiban berpikir kritis

Sebelum memilih solusi, evaluasi secara aktif:

1. Apakah masalah yang diminta benar-benar masalah utama pengguna atau hanya gejalanya?
2. Apakah solusi ini memperjelas pekerjaan pengguna, atau sekadar menambah permukaan aplikasi?
3. Apa dampaknya ketika modul CRM, inventory, pengadaan, dan keuangan masuk nanti?
4. Data apa yang diperlukan, siapa pemiliknya, dan bagaimana statusnya berubah?
5. Apa versi paling kecil yang bernilai namun tidak mengunci pilihan masa depan?

Jika jawaban mengubah arah, sajikan temuan, rekomendasi, dan trade-off sebelum implementasi. Jangan mengisi kekosongan keputusan dengan UI generik.

## Definition of done yang proporsional

| Jalur   | Bukti selesai minimum                                                                                                        |
| ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Cepat   | Perubahan terinspeksi pada viewport terdampak, format dan lint lulus.                                                        |
| Standar | Acceptance criteria terpenuhi, alur utama dan kondisi gagal diuji, format/lint/type check/build lulus.                       |
| Fondasi | Rencana disetujui, acceptance criteria dan quality gate penuh lulus, dokumentasi/ADR/runbook diperbarui, smoke test selesai. |

## Cara melaporkan pekerjaan

Setiap hasil kerja harus menyatakan secara singkat:

- outcome yang selesai;
- perubahan yang dilakukan;
- cara verifikasi dan hasilnya;
- asumsi atau batasan yang masih ada;
- langkah berikutnya yang paling bernilai.

Hindari laporan yang hanya menyebut daftar file atau klaim "selesai" tanpa bukti terhadap acceptance criteria.
