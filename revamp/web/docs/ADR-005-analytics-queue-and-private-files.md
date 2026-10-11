# ADR-005: antrean PostgreSQL untuk tracker dan storage privat untuk file kerja

## Keputusan

Perilaku pengunjung dikirim browser dalam batch maksimal 25 event dan ditambahkan cepat ke `analytics_ingest_batches`. Satu worker Node terpisah mengklaim batch memakai `FOR UPDATE SKIP LOCKED`, lalu menulis sesi dan event dalam transaksi. File kerja desain disimpan di volume VPS privat, di luar `public/`, dan hanya dilayani endpoint yang memeriksa sesi serta role.

## Konteks

Lonjakan sesekali sampai sekitar 1.000 pengunjung tidak boleh memperlambat landing atau form. Redis belum diperlukan untuk pola lonjakan yang jarang dan menambah layanan yang harus dioperasikan. File CAD juga tidak boleh dapat ditebak URL-nya atau disajikan langsung oleh web server.

## Konsekuensi

- Worker wajib berjalan satu proses di production dan memiliki heartbeat pada dashboard administrator.
- Endpoint publik hanya menerima payload kecil dan dapat mengabaikan tracker bila database bermasalah; fungsi landing dan form tetap menang.
- Status sehat: antrean di bawah 500 batch, batch tertua di bawah 10 detik, dan tanpa gagal.
- Status perhatian: 500–2.499 batch atau umur 10–60 detik. Status perlu ditangani: minimal 2.500 batch, umur di atas 60 detik, kegagalan, atau heartbeat mati. Pada status terakhir, evaluasi Redis atau worker tambahan berdasarkan pola aktual.
- Backup database dan volume privat dilakukan bersama; kebocoran akses file menjadi insiden keamanan.
