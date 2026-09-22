# Operasional laporan pengunjung

## Privasi

Laporan hanya menyimpan kunjungan anonim setelah pengunjung menyetujui banner. Jangan pernah menambahkan nama, nomor telepon, isi formulir, alamat IP, rekaman layar, atau pergerakan mouse ke tabel analitik.

Detail kunjungan dipindahkan ke ringkasan harian setelah 90 hari. Ringkasan disimpan 12 bulan melalui kebijakan backup dan penghapusan operasional VPS.

## Konfigurasi produksi

Tambahkan variabel berikut di server, bukan ke repository:

```text
TRUST_PROXY_HEADERS=true
GEOIP_CITY_DB_PATH=/var/lib/anugrahplastik/dbip-city-lite.mmdb
ANALYTICS_CRON_TOKEN=<nilai-acak-panjang>
```

Port aplikasi hanya boleh diakses reverse proxy. Nginx harus mengganti, bukan meneruskan, alamat pengunjung:

```nginx
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header Host $host;
```

Unduh DB-IP Lite City secara bulanan ke lokasi privat di atas. Jangan layani file GeoIP dari direktori `public`. Halaman laporan mencantumkan atribusi DB-IP sesuai lisensinya.

## Jadwal harian

Jalankan setelah lewat tengah malam melalui cron VPS:

```text
15 0 * * * curl --fail --silent --show-error -X POST -H "Authorization: Bearer <ANALYTICS_CRON_TOKEN>" https://domain-anda/api/internal/analytics/maintenance
```

Endpoint memindahkan maksimal 1.000 kunjungan anonim yang lebih tua dari 90 hari pada setiap eksekusi. Jika antrean pernah besar, cron berikutnya akan melanjutkan dengan aman.
