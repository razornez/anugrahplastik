# Pengaturan Email CS dan Google Ads

Koneksi eksternal dijalankan dari server. Kata sandi mailbox dan refresh token Google Ads dienkripsi AES-256-GCM di PostgreSQL; keduanya tidak dikembalikan ke browser setelah disimpan. Kunci `INTEGRATIONS_ENCRYPTION_KEY` harus dicadangkan terpisah dan tidak boleh diganti tanpa proses rotasi, karena koneksi tersimpan tidak dapat dibuka lagi jika kunci hilang.

## Email CS

1. Isi `INTEGRATIONS_ENCRYPTION_KEY` dengan 64 karakter heksadesimal acak (32 byte) pada environment server.
2. Jalankan migrasi database dan restart aplikasi.
3. Masuk sebagai administrator, buka **Lainnya → Koneksi layanan**, lalu masukkan kata sandi `cs@anugrahplastik.com` langsung pada form dan pilih **Uji dan simpan koneksi**.
4. Isi `CS_MAIL_HOST`, `CS_MAIL_IMAP_PORT`, dan `CS_MAIL_SMTP_PORT` pada environment server dari halaman cPanel **Set Up Mail Client**. Untuk cPanel yang saat ini digunakan, host yang perlu diverifikasi adalah `srv145.niagahoster.com`; jangan memakai hostname web VPS apabila mailbox masih berada di cPanel.
5. Form akan memeriksa IMAP TLS dan SMTP TLS dari konfigurasi server tersebut sebelum menyimpan rahasia. Kata sandi tidak dicatat ke audit atau log.
6. Jadwalkan `POST https://anugrahplastik.com/api/integrations/sync` untuk Email setiap lima menit dan Google Ads setiap lima belas menit dengan header `Authorization: Bearer <INTEGRATIONS_CRON_TOKEN>`. Runner mengirim pilihan provider dalam body JSON agar gangguan satu provider tidak menghambat provider lain. Endpoint Email mengimpor metadata 90 hari pertama dan sesudahnya hanya UID baru. Isi email diambil saat dibuka; lampiran hanya ditawarkan untuk diunduh setelah membuka email dan tidak disimpan otomatis.

### Scheduler VPS

Jangan mempertahankan socket IMAP terus-menerus. Gunakan runner `scripts/run-integrations-sync.mjs --service=mail` setiap lima menit dan `--service=ads` setiap lima belas menit. Runner membuka koneksi hanya saat diperlukan dan mengembalikan exit code nonzero bila provider tersebut gagal. Simpan `INTEGRATIONS_CRON_TOKEN` serta `INTEGRATIONS_SYNC_URL` pada `web.env` untuk route server dan pada `integrations-runner.env` root-only untuk unit runner. File runner tidak memuat password mailbox, OAuth secret, atau Developer Token.

Sebelum timer diaktifkan, uji dari VPS bahwa `CS_MAIL_HOST:CS_MAIL_IMAP_PORT` dan `CS_MAIL_HOST:CS_MAIL_SMTP_PORT` dapat dijangkau, lalu jalankan uji koneksi dari **Koneksi layanan**. Timeout terjadi sebelum autentikasi sehingga bukan bukti kata sandi salah; periksa layanan IMAP/SMTP serta firewall cPanel terlebih dahulu. Isi `INTEGRATIONS_CRON_TOKEN`, URL HTTPS `INTEGRATIONS_SYNC_URL` (atau `APP_ORIGIN`), dan `INTEGRATIONS_ENCRYPTION_KEY` pada environment VPS sebelum menjalankan timer.

Timer Email yang sehat melapor setiap lima menit dan ditandai terlambat setelah 15 menit. Timer Ads melapor setiap lima belas menit dan ditandai terlambat setelah 45 menit; klaim database tetap memastikan laporan hanya ditulis sekali per hari. Halaman admin menampilkan heartbeat masing-masing provider. Jika heartbeat terlambat, data tersimpan tetap dapat dibaca.

Contoh unit `systemd` (siapkan tetapi **jangan aktifkan** sebelum owner menyetujui deploy):

```ini
# /etc/systemd/system/anugrahplastik-integrations-mail.service
[Service]
Type=oneshot
WorkingDirectory=/var/www/anugrahplastik/revamp/web
EnvironmentFile=/etc/anugrahplastik/integrations-runner.env
ExecStart=/usr/bin/node scripts/run-integrations-sync.mjs --service=mail
StandardOutput=append:/var/log/anugrahplastik/integrations-sync.log
StandardError=append:/var/log/anugrahplastik/integrations-sync.log
```

```ini
# /etc/systemd/system/anugrahplastik-integrations-mail.timer
[Timer]
OnCalendar=*:0/5
Persistent=true
Unit=anugrahplastik-integrations-mail.service

[Install]
WantedBy=timers.target
```

Unit Ads memakai pola yang sama dengan `--service=ads` dan `OnCalendar=*:0/15`. Setelah deploy dan pengisian environment privat, nonaktifkan timer gabungan lama, lalu aktifkan `anugrahplastik-integrations-mail.timer` dan `anugrahplastik-integrations-ads.timer`. Periksa status serta jurnal kedua service setelah aktivasi. Riwayat eksekusi aman disimpan 30 hari. Jangan menjalankan timer ini dari laptop lokal.

Email yang dikirim melalui admin dicatat di folder **Terkirim**. Jika SMTP mengalami timeout yang statusnya tidak pasti, entri ditahan sebagai **Perlu diperiksa** dan tidak otomatis dikirim ulang untuk mencegah duplikasi. Periksa webmail sebelum mengirim ulang.

Status koneksi berarti kredensial masih tersimpan, bukan jaminan penyedia selalu dapat dijangkau. Gangguan IMAP/SMTP hanya mengubah kesehatan koneksi dan menyimpan peringatan; data inbox yang sudah tersimpan tetap dapat dibaca. Administrator memperbarui password melalui form yang menguji IMAP dan SMTP sebelum mengganti kredensial lama. Hanya tindakan **Putuskan koneksi** yang menghapus kredensial tersimpan.

## Google Ads

Konfigurasikan server-only environment berikut:

- GOOGLE_ADS_DATA_SOURCE=live di VPS production. Localhost yang hanya membaca salinan laporan memakai snapshot.
- `GOOGLE_ADS_CLIENT_ID` dan `GOOGLE_ADS_CLIENT_SECRET` dari OAuth client bertipe Web application.
- `GOOGLE_ADS_DEVELOPER_TOKEN` hanya untuk kompatibilitas instalasi lama. Sejak 9 September 2026 Google mengabaikan header ini dan menentukan level akses dari project Google Cloud pemilik OAuth Client.
- `GOOGLE_ADS_CUSTOMER_ID=6738895829` (angka saja; tanda hubung boleh digunakan).
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID` adalah ID 10 digit MCC aktif yang sudah ditautkan ke Customer ID di atas.
- `GOOGLE_ADS_LOGIN_EMAIL=razornez@gmail.com` adalah akun Google owner yang diizinkan menyambungkan OAuth.
- Lokal: `GOOGLE_ADS_REDIRECT_URI=http://localhost:3100/api/integrations/google-ads/callback`; daftarkan URL yang persis sama pada OAuth client.

### Snapshot laporan untuk localhost

Localhost tidak memakai refresh token atau OAuth Client production. Gunakan mode snapshot, URL
https://anugrahplastik.com/api/integrations/google-ads/snapshot, dan token acak khusus minimal 32 karakter pada environment
lokal. VPS memakai token snapshot yang sama, tetapi tidak memerlukan URL snapshot. Token ini harus berbeda dari token
scheduler integrasi.

Administrator mengambil snapshot secara manual dari halaman **Kinerja Iklan Google**. Permintaan berjalan server-to-server
melalui HTTPS dan menyalin hanya agregat harian kampanye selama 90 hari lengkap sampai kemarin. OAuth token, kredensial
database, pengguna, prospek, dan data Email CS tidak masuk ke respons. Import memvalidasi seluruh payload sebelum transaksi;
kegagalan tidak menghapus snapshot lokal sebelumnya. Endpoint menolak HTTP, token salah, rentang di atas 365 hari, dan
permintaan ketika sumber production bukan live.

Administrator menyambungkan akun melalui **Koneksi layanan → Sambungkan Google Ads**, lalu memberi persetujuan scope laporan `adwords`. Aplikasi hanya meminta laporan kampanye, tidak mengubah iklan atau anggaran. Administrator harus menjalankan **Verifikasi akses API** sebelum pembaruan laporan pertama; browser tidak pernah memulai sinkronisasi otomatis. Setelah akun pernah diverifikasi, scheduler boleh mengulang probe baca-saja ketika verifikasi telah kedaluwarsa, lalu memakai klaim atomik dan retry terbatas tanpa menghapus laporan lama.

Laporan default memakai tujuh hari kalender lengkap sampai kemarin (WIB). Preset 30/90 hari juga berakhir kemarin; URL/rentang kustom tetap tersedia. Empat metrik default adalah Klik, Impresi, Rata-rata CPC, dan Biaya; Konversi serta Nilai konversi dapat dipilih menggantikannya. CPC dihitung dari total biaya dibagi total klik, bukan rata-rata CPC harian. Tinggi setiap garis memakai skala relatifnya sendiri; tabel terbuka dan CSV menyediakan angka aslinya. Tidak ada kartu saldo billing.

Untuk menguji klaim harian pada database lokal tanpa API eksternal, jalankan `GOOGLE_ADS_DB_TEST=1 node --test tests/google-ads-report.test.cjs` (PowerShell: `$env:GOOGLE_ADS_DB_TEST='1'`). Pengujian membuat dan menghapus schema test unik, memalsukan respons HTTP, dan tidak menulis ke data aplikasi.

Permintaan laporan memakai OAuth dan akses project Google Cloud; aplikasi hanya menjalankan kueri laporan. Ikuti dokumentasi resmi untuk [akses project setelah penghentian developer token](https://developers.google.com/google-ads/api/docs/api-policy/developer-token), [OAuth web server lokal](https://developers.google.com/identity/protocols/oauth2/web-server), [pelaporan](https://developers.google.com/google-ads/api/docs/reporting/overview), dan [Search/SearchStream](https://developers.google.com/google-ads/api/rest/common/search).

Status koneksi Google Ads berarti refresh token masih tersimpan, bukan bahwa laporan pasti dapat ditarik. Pusat Kesehatan membedakan OAuth, akses project Google Cloud, MCC, dan akses Customer ID supaya tindakan pemulihan tidak salah. Kegagalan refresh atau laporan tidak menghapus token OAuth; aplikasi menampilkan peringatan agar administrator dapat menyambungkan ulang atau memeriksa akses. Explorer cukup untuk laporan produksi dan memberi batas 2.880 operasi harian. Basic tidak dibutuhkan untuk laporan baca-saja.

### MCC dan akses project Google Cloud

1. Buat **Google Ads Manager Account/MCC** baru bernama misalnya `Anugrah Plastik – Reporting Manager`. Jangan mengaktifkan akun MCC yang sudah dibatalkan.
2. Kirim lalu setujui permintaan penautan antara MCC tersebut dan Customer ID `6738895829`. Tidak perlu mengubah kampanye, anggaran, billing, atau pengguna akun iklan.
3. Pada project Google Cloud production, aktifkan Google Ads API lalu ajukan akses **Explorer** untuk penggunaan internal baca-saja.
4. Setelah disetujui, isi `GOOGLE_ADS_CUSTOMER_ID` dan `GOOGLE_ADS_LOGIN_CUSTOMER_ID` di secret environment VPS; restart aplikasi.
5. Di **Koneksi layanan**, jalankan **Verifikasi akses API**. Aksi ini hanya menguji project Cloud, hierarki MCC, dan akses akun; tidak mengubah laporan tersimpan. Setelah berhasil, jalankan **Perbarui laporan sekarang** dan cocokkan rentang tujuh hari WIB dengan Google Ads UI.

Google mensyaratkan `login-customer-id` ketika MCC mengakses akun klien. Gunakan OAuth Client dari project Google Cloud yang sudah berstatus Explorer. Header `developer-token` hanya dikirim bila credential lama masih tersedia dan tidak menjadi syarat konfigurasi. Lihat [panduan penghentian token](https://developers.google.com/google-ads/api/docs/api-policy/developer-token) dan [level akses API](https://developers.google.com/google-ads/api/docs/api-policy/access-levels).

### Persiapan OAuth production

- Gunakan Google Cloud project dan OAuth client terpisah untuk lokal/testing dan production. Di setiap environment, gunakan nama variabel server yang sama (`GOOGLE_ADS_CLIENT_ID` dan `GOOGLE_ADS_CLIENT_SECRET`) dengan nilai client masing-masing; jangan commit atau mengirim rahasia lewat chat.
- Callback production adalah `https://anugrahplastik.com/api/integrations/google-ads/callback`; daftarkan persis pada OAuth client production. Callback lokal tetap memakai `http://localhost:3100/api/integrations/google-ads/callback`.
- Pilih audience **External** untuk owner Gmail biasa. Lengkapi branding, domain terverifikasi, halaman beranda, kebijakan privasi, syarat penggunaan, alamat kontak developer, dan scope minimum `https://www.googleapis.com/auth/adwords` sebelum menerbitkan consent screen ke Production.
- Pastikan kebijakan privasi menjelaskan penggunaan laporan Ads internal dan tidak menjanjikan fungsi yang tidak ada. Bila Google meminta verifikasi scope, kirim justifikasi dan video alur sambung → tarik laporan baca-saja.
- Jangan mengandalkan status Testing untuk koneksi jangka panjang: scope Ads membuat refresh token Testing kedaluwarsa setelah tujuh hari. Google tetap menentukan hasil review production.
- Setelah branding Production siap, lakukan consent ulang oleh owner untuk menerbitkan refresh token production baru. Token lama tidak dihapus hingga probe API dan satu pembaruan laporan nyata berhasil. Passkey atau verifikasi tambahan ditentukan Google Account; aplikasi tidak dapat dan tidak boleh melewatinya.

## Rilis dan pemulihan

- Cadangkan PostgreSQL dan file storage sebelum migrasi/deploy. Migrasi `0012_marketing_email_integrations.sql` mempertahankan prospek yang ada; nomor telepon menjadi opsional agar prospek dari email dapat dicatat, sedangkan form publik tetap meminta nomor seperti sebelumnya.
- Callback OAuth harus sama persis dengan yang didaftarkan pada OAuth client. Lokal memakai `http://localhost:3100/api/integrations/google-ads/callback`; production nanti harus memakai callback dan konfigurasi yang sesuai dengan deployment production.
- Untuk aplikasi OAuth berstatus Testing, refresh token dengan scope Ads dapat kedaluwarsa setelah tujuh hari sehingga sambungan lokal mungkin perlu diulang.
- Setelah production branding, domain, privacy policy, terms, dan scope disetujui pemilik, administrator perlu mempublikasikan/meninjau aplikasi OAuth melalui Google Auth Platform dan melakukan consent ulang dengan client production.
- Uji koneksi mailbox dengan kata sandi yang dimasukkan langsung oleh administrator. Jangan menaruh kata sandi, token, atau isi email pada tiket, chat, screenshot, atau audit metadata.
- Endpoint sinkron hanya menerima POST bertoken, tidak menaruh token pada URL, dan membatasi respons ke jumlah item serta status umum; jangan membuka port database ke internet.
