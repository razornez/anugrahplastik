# BMad reference workflow

BMad dipakai sebagai struktur referensi agar keputusan produk tidak hilang ketika pekerjaan dipecah menjadi beberapa bagian.

```text
Discovery → PRD → UX → Architecture / ADR → Epic / Story
→ Build → Test → Release → Retrospective
```

## Aturan penggunaan

1. PRD adalah sumber keputusan produk. Jika kebutuhan berubah, PRD diperbarui lebih dahulu.
2. Architecture dan ADR mencatat keputusan yang berdampak lintas fitur.
3. Epic dikelompokkan berdasarkan nilai pengguna; setiap story harus dapat diselesaikan dan diverifikasi secara mandiri.
4. Story baru siap dikerjakan jika acceptance criteria, data yang diperlukan, UX state, dan risiko sudah jelas.
5. Perubahan signifikan di tengah pengerjaan dievaluasi terhadap PRD, architecture, dan backlog sebelum dikerjakan.
6. Setiap epic ditutup dengan retrospective: bukti hasil, masalah, keputusan, dan perbaikan berikutnya.

## Epic awal

1. Foundation project, governance, dan deployment baseline.
2. Migrasi landing page mobile-first dan SEO.
3. Content management dan media library.
4. CRM lead, attribution, dan WhatsApp notification.
5. Analytics, dashboard, dan continuous improvement.
