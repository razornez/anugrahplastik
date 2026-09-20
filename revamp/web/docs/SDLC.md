# Software delivery lifecycle

## 1. Intake

Issue menjelaskan masalah, outcome bisnis, scope, acceptance criteria, risiko, dan link dokumen terkait.

## 2. Define

Perubahan produk memperbarui PRD. Perubahan teknis lintas domain menambah atau memperbarui ADR.

## 3. Design and plan

Story mencakup alur pengguna, state kosong/error/loading, data input-output, SEO/accessibility impact, dan test plan.

## 4. Build

Kerjakan satu story terverifikasi. Migration, contract, UI, dan test berubah bersama jika diperlukan.

## 5. Validate

Jalankan format check, lint, type check, test yang relevan, production build, migration validation, dan dependency scan.

## 6. Release

Push ke `main` menjalankan GitHub Actions. Production hanya dideploy jika seluruh check lulus. Setelah deploy lakukan health check dan smoke test.

## 7. Operate

Pantau error, availability, conversion funnel, lead delivery, serta job backup. Backup database/media dibuat setiap 10 hari dan sebelum migration atau deploy.

## 8. Learn

Retrospective per epic mencatat hasil metrik, issue, debt, dan backlog perbaikan.
