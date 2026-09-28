# Pengaturan Email CS dan Google Ads

Koneksi eksternal dijalankan dari server. Kata sandi mailbox dan refresh token Google Ads dienkripsi AES-256-GCM di PostgreSQL; keduanya tidak dikembalikan ke browser setelah disimpan. Kunci `INTEGRATIONS_ENCRYPTION_KEY` harus dicadangkan terpisah dan tidak boleh diganti tanpa proses rotasi, karena koneksi tersimpan tidak dapat dibuka lagi jika kunci hilang.

## Email CS

1. Isi `INTEGRATIONS_ENCRYPTION_KEY` dengan 64 karakter heksadesimal acak (32 byte) pada environment server.
2. Jalankan migrasi database dan restart aplikasi.
3. Masuk sebagai administrator, buka **Lainnya → Koneksi layanan**, lalu masukkan kata sandi `cs@anugrahplastik.com` langsung pada form dan pilih **Uji dan simpan koneksi**.
4. Form akan memeriksa IMAP TLS `mail.anugrahplastik.com:993` dan SMTP TLS `mail.anugrahplastik.com:465` sebelum menyimpan rahasia. Kata sandi tidak dicatat ke audit atau log.
5. Jadwalkan `POST https://anugrahplastik.com/api/integrations/sync` setiap lima menit dengan header `Authorization: Bearer <INTEGRATIONS_CRON_TOKEN>`. Endpoint mengimpor metadata email 90 hari pertama dan sesudahnya hanya UID baru. Isi email diambil saat dibuka; lampiran hanya ditawarkan untuk diunduh setelah membuka email dan tidak disimpan otomatis.

Email yang dikirim melalui admin dicatat di folder **Terkirim**. Jika SMTP mengalami timeout yang statusnya tidak pasti, entri ditahan sebagai **Perlu diperiksa** dan tidak otomatis dikirim ulang untuk mencegah duplikasi. Periksa webmail sebelum mengirim ulang.

Status koneksi berarti kredensial masih tersimpan, bukan jaminan penyedia selalu dapat dijangkau. Gangguan IMAP/SMTP hanya mengubah kesehatan koneksi dan menyimpan peringatan; data inbox yang sudah tersimpan tetap dapat dibaca. Administrator memperbarui password melalui form yang menguji IMAP dan SMTP sebelum mengganti kredensial lama. Hanya tindakan **Putuskan koneksi** yang menghapus kredensial tersimpan.

## Google Ads

Konfigurasikan server-only environment berikut:

- `GOOGLE_ADS_CLIENT_ID` dan `GOOGLE_ADS_CLIENT_SECRET` dari OAuth client bertipe Web application.
- Aktifkan Google Ads API dan berikan akses project melalui Google Cloud Console. Alur project-level yang baru tidak memerlukan Developer Token.
- `GOOGLE_ADS_CUSTOMER_ID=6738895829` (angka saja; tanda hubung boleh digunakan).
- `GOOGLE_ADS_LOGIN_EMAIL=razornez@gmail.com` untuk membantu memilih akun yang benar ketika proses OAuth dibuka.
- Lokal: `GOOGLE_ADS_REDIRECT_URI=http://localhost:3100/api/integrations/google-ads/callback`; daftarkan URL yang persis sama pada OAuth client.

Administrator menyambungkan akun melalui **Koneksi layanan → Sambungkan Google Ads**, lalu memberi persetujuan scope laporan `adwords`. Aplikasi hanya meminta laporan kampanye, tidak mengubah iklan atau anggaran. Data laporan disegarkan manual dari menu **Pemasaran**, atau otomatis tiap enam jam lewat endpoint sinkron yang sama. Jika akses API atau token belum siap, halaman menampilkan status perhatian dan tidak mengarang angka.

Permintaan laporan memakai OAuth dan akses project Google Cloud; aplikasi hanya menjalankan kueri laporan. Ikuti dokumentasi resmi untuk [akses project dan token developer](https://developers.google.com/google-ads/api/docs/api-policy/developer-token), [OAuth web server lokal](https://developers.google.com/identity/protocols/oauth2/web-server), [pelaporan](https://developers.google.com/google-ads/api/docs/reporting/overview), dan [Search/SearchStream](https://developers.google.com/google-ads/api/rest/common/search).

Status koneksi Google Ads juga berarti refresh token masih tersimpan. Kegagalan refresh atau laporan tidak menghapus token; aplikasi menampilkan peringatan agar administrator dapat menyambungkan ulang atau memeriksa akses. Explorer cukup untuk laporan produksi dan memberi batas 2.880 operasi harian. Basic tidak dibutuhkan untuk laporan baca-saja.

### Persiapan OAuth production

- Lokal memakai OAuth client terpisah dari production. Di setiap environment, gunakan nama variabel server yang sama (`GOOGLE_ADS_CLIENT_ID` dan `GOOGLE_ADS_CLIENT_SECRET`) dengan nilai client masing-masing; jangan commit atau mengirim rahasia lewat chat.
- Callback production adalah `https://anugrahplastik.com/api/integrations/google-ads/callback`; daftarkan persis pada OAuth client production. Callback lokal tetap memakai `http://localhost:3100/api/integrations/google-ads/callback`.
- Lengkapi dan tinjau halaman branding, domain terverifikasi, kebijakan privasi, serta syarat penggunaan sebelum mengubah audience ke production atau mengajukan verifikasi. Kebijakan privasi saat ini menjelaskan pemakaian laporan Ads; halaman syarat penggunaan dan review akhir pemilik masih perlu disiapkan.
- Google menolak permohonan Basic project karena profil merek OAuth belum terverifikasi. Penolakan tersebut berbeda dari akses Explorer yang sudah aktif dan tidak menghalangi laporan yang dibutuhkan.
- Jangan mengandalkan status Testing untuk koneksi jangka panjang: scope Ads membuat refresh token Testing kedaluwarsa setelah tujuh hari. Google tetap menentukan hasil review production.

## Rilis dan pemulihan

- Cadangkan PostgreSQL dan file storage sebelum migrasi/deploy. Migrasi `0012_marketing_email_integrations.sql` mempertahankan prospek yang ada; nomor telepon menjadi opsional agar prospek dari email dapat dicatat, sedangkan form publik tetap meminta nomor seperti sebelumnya.
- Callback OAuth harus sama persis dengan yang didaftarkan pada OAuth client. Lokal memakai `http://localhost:3100/api/integrations/google-ads/callback`; production nanti harus memakai callback dan konfigurasi yang sesuai dengan deployment production.
- Untuk aplikasi OAuth berstatus Testing, refresh token dengan scope Ads dapat kedaluwarsa setelah tujuh hari sehingga sambungan lokal mungkin perlu diulang.
- Setelah production branding, domain, privacy policy, terms, dan scope disetujui pemilik, administrator perlu mempublikasikan/meninjau aplikasi OAuth melalui Google Auth Platform dan melakukan consent ulang dengan client production.
- Uji koneksi mailbox dengan kata sandi yang dimasukkan langsung oleh administrator. Jangan menaruh kata sandi, token, atau isi email pada tiket, chat, screenshot, atau audit metadata.
- Endpoint sinkron hanya menerima POST bertoken, tidak menaruh token pada URL, dan membatasi respons ke jumlah item serta status umum; jangan membuka port database ke internet.
