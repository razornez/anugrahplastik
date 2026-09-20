# Quality gates

## Definition of ready

- Tujuan, scope, dan acceptance criteria tersedia.
- Data, role, UX state, dan perubahan SEO sudah diketahui.
- Risiko migrasi, cache, dan integrasi eksternal telah dicatat.

## Definition of done

- Format check, lint, type check, test relevan, dan production build lulus.
- Tidak ada regression pada viewport 375px, 768px, dan desktop.
- Loading, empty, error, keyboard focus, dan touch target diperiksa bila fitur memiliki interaksi.
- Schema/migration aman, cache invalidation jelas, dan telemetry event diperbarui bila mengubah funnel.
- Dokumentasi, ADR, dan runbook diperbarui bila keputusan atau operasi berubah.

## CI baseline

```text
format check → lint → type check → unit/integration test
→ production build → migration/schema check → dependency scan
```

## Release smoke test

- Homepage, sitemap, robots, dan metadata dapat dibuka.
- Inquiry dapat disimpan pada lingkungan test.
- Login dan otorisasi back office berjalan sesuai role.
- Media published dapat ditampilkan.
- Error monitoring dan health endpoint tidak melaporkan kegagalan baru.
