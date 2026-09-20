# Engineering guidelines

## Prinsip

- SOLID dipakai secara proporsional: pisahkan tanggung jawab yang berbeda, tetapi jangan membuat abstraction yang belum diperlukan.
- KISS: pilih solusi paling sederhana yang memenuhi acceptance criteria.
- YAGNI: fitur, tabel, service, dan cache layer hanya ditambah saat kebutuhan sudah terbukti.
- DRY untuk business rule dan schema; jangan memaksa komponen generik yang menyulitkan pembacaan.

## TypeScript and Next.js

- Strict TypeScript; tidak ada `any`, suppression type error, atau secret di source.
- Server Component adalah default. Client Component hanya untuk interaksi browser.
- Gunakan `next/image`, `next/font`, metadata route, semantic HTML, dan responsive sizes.
- Semua form divalidasi pada server. Jangan percaya validasi browser saja.
- Mobile baseline adalah iPhone 12 mini: 375 × 812. Tidak boleh ada horizontal overflow, target sentuh kurang dari 44px, atau input kurang dari 16px.

## Data and security

- Query harus parameterized dan dibatasi pagination/limit.
- Gunakan transaction untuk perubahan atomik.
- Periksa authorization di server untuk setiap read/write sensitif.
- Password memakai Argon2id; jangan pernah log token, secret, atau data personal.
- Gunakan baseline OWASP ASVS untuk authentication, session, authorization, input, upload, logging, dan error handling.

## Typography and copy

- Gunakan sentence case, hierarki jelas, kontras memadai, dan line length yang nyaman dibaca.
- Hindari jargon kosong, klaim berlebihan, kalimat berulang, serta gaya copy yang terasa generik.
- Jangan gunakan istilah yang dilarang pada interface, metadata, dokumentasi publik, source comment, atau commit message.

## Dependency and review

- Gunakan versi stable terbaru saat setup; patch keamanan diprioritaskan, minor update ditinjau bulanan, major update melalui compatibility test.
- Lockfile wajib di-commit.
- Setiap perubahan wajib punya alasan, test yang relevan, dan tidak menambah dependency tanpa kebutuhan jelas.
