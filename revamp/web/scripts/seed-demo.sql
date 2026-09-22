-- Local demonstration data. It only adds rows when the corresponding demo records are absent.

WITH admin_user AS (
  SELECT id FROM users WHERE role = 'admin' AND is_active = true ORDER BY created_at LIMIT 1
), demo_leads(name, phone, message, source, landing_path, attribution, assigned, created_at) AS (
  VALUES
    ('Budi Santoso', '0812-6654-1102', 'Butuh reproduksi cover gear mesin untuk lini pengemasan. Ada sampel fisik.', 'google / cpc', '/', '{"utm_source":"google","utm_medium":"cpc","utm_campaign":"spare-part"}'::jsonb, true, now() - interval '42 minutes'),
    ('Nadia Pratama', '0857-9102-4881', 'Ingin membuat dudukan kabel custom untuk kebutuhan proyek interior.', 'instagram', '/', '{"utm_source":"instagram","utm_medium":"organic"}'::jsonb, false, now() - interval '2 hours'),
    ('Rizky Mahendra', '0813-3310-7844', 'Mencari vendor plastik untuk spacer dan bushing. Bisa kirim foto lebih dulu.', 'google / organic', '/', '{"utm_source":"google","utm_medium":"organic"}'::jsonb, true, now() - interval '5 hours'),
    ('Taufik Hidayat', '0821-5540-9928', 'Perlu botol kecil dan tutup untuk pengujian produk baru, belum ada kuantitas pasti.', 'referal', '/', NULL, false, now() - interval '1 day 3 hours'),
    ('Sari Wulandari', '0811-2305-772', 'Ada part pompa plastik retak. Mohon evaluasi apakah bisa dibuat ulang dari sampel.', 'whatsapp', '/', '{"utm_source":"whatsapp"}'::jsonb, true, now() - interval '2 days 4 hours'),
    ('Andika Putra', '0896-7812-3900', 'Membutuhkan roda kecil nylon untuk alat bantu produksi. Bisa konsultasi material?', 'google / cpc', '/', '{"utm_source":"google","utm_medium":"cpc","utm_campaign":"material"}'::jsonb, false, now() - interval '4 days')
)
INSERT INTO leads (name, phone, message, source, landing_path, attribution, assigned_user_id, created_at)
SELECT demo.name, demo.phone, demo.message, demo.source, demo.landing_path, demo.attribution,
  CASE WHEN demo.assigned THEN (SELECT id FROM admin_user) ELSE NULL END,
  demo.created_at
FROM demo_leads demo
WHERE NOT EXISTS (SELECT 1 FROM leads WHERE leads.phone = demo.phone);

WITH admin_user AS (
  SELECT id FROM users WHERE role = 'admin' AND is_active = true ORDER BY created_at LIMIT 1
), notes(phone, body, created_at) AS (
  VALUES
    ('0812-6654-1102', 'Sampel fisik akan dikirim sore ini. Prioritaskan evaluasi bentuk dan bahan.', now() - interval '25 minutes'),
    ('0813-3310-7844', 'Sudah meminta foto dari beberapa sudut serta ukuran perkiraan.', now() - interval '4 hours'),
    ('0811-2305-772', 'Perlu konfirmasi apakah part bersentuhan dengan cairan atau suhu tinggi.', now() - interval '2 days 2 hours')
)
INSERT INTO lead_notes (lead_id, author_id, body, created_at)
SELECT leads.id, (SELECT id FROM admin_user), notes.body, notes.created_at
FROM notes
JOIN leads ON leads.phone = notes.phone
WHERE NOT EXISTS (
  SELECT 1 FROM lead_notes WHERE lead_notes.lead_id = leads.id AND lead_notes.body = notes.body
);

WITH demo_sessions(anonymous_id, created_at, last_seen_at, referrer) AS (
  VALUES
    ('demo-anugrah-001', now() - interval '50 minutes', now() - interval '42 minutes', 'https://www.google.com/'),
    ('demo-anugrah-002', now() - interval '2 hours 20 minutes', now() - interval '2 hours', 'https://www.instagram.com/'),
    ('demo-anugrah-003', now() - interval '3 hours 15 minutes', now() - interval '3 hours', 'https://www.google.com/'),
    ('demo-anugrah-004', now() - interval '5 hours', now() - interval '4 hours 40 minutes', 'https://www.google.com/'),
    ('demo-anugrah-005', now() - interval '1 day 1 hour', now() - interval '1 day 45 minutes', 'https://www.google.com/'),
    ('demo-anugrah-006', now() - interval '1 day 4 hours', now() - interval '1 day 3 hours 45 minutes', NULL),
    ('demo-anugrah-007', now() - interval '2 days 2 hours', now() - interval '2 days 1 hour 45 minutes', 'https://www.instagram.com/'),
    ('demo-anugrah-008', now() - interval '2 days 6 hours', now() - interval '2 days 5 hours 40 minutes', 'https://www.google.com/'),
    ('demo-anugrah-009', now() - interval '3 days 2 hours', now() - interval '3 days 1 hour 50 minutes', 'https://www.google.com/'),
    ('demo-anugrah-010', now() - interval '4 days', now() - interval '3 days 23 hours 35 minutes', NULL),
    ('demo-anugrah-011', now() - interval '5 days 3 hours', now() - interval '5 days 2 hours 30 minutes', 'https://www.google.com/'),
    ('demo-anugrah-012', now() - interval '6 days 1 hour', now() - interval '6 days 40 minutes', 'https://www.google.com/')
)
INSERT INTO analytics_sessions (anonymous_id, landing_path, referrer, consented_at, created_at, last_seen_at)
SELECT anonymous_id, '/', referrer, created_at, created_at, last_seen_at
FROM demo_sessions
ON CONFLICT (anonymous_id) DO NOTHING;

WITH events(anonymous_id, name, section_key, element_key, occurred_at) AS (
  VALUES
    ('demo-anugrah-001', 'section_engaged', 'ap-hero', NULL, now() - interval '49 minutes'),
    ('demo-anugrah-001', 'cta_click', 'ap-hero', 'hero-primary-quote', now() - interval '46 minutes'),
    ('demo-anugrah-001', 'form_start', 'ap-contact', 'contact-form', now() - interval '45 minutes'),
    ('demo-anugrah-001', 'form_submit', 'ap-contact', 'contact-form', now() - interval '42 minutes'),
    ('demo-anugrah-002', 'section_engaged', 'ap-portfolio', NULL, now() - interval '2 hours 15 minutes'),
    ('demo-anugrah-002', 'cta_click', 'ap-portfolio', 'portfolio-cta', now() - interval '2 hours 5 minutes'),
    ('demo-anugrah-002', 'page_leave', 'ap-portfolio', NULL, now() - interval '2 hours'),
    ('demo-anugrah-003', 'section_engaged', 'ap-material', NULL, now() - interval '3 hours 10 minutes'),
    ('demo-anugrah-003', 'section_engaged', 'ap-faq', NULL, now() - interval '3 hours 5 minutes'),
    ('demo-anugrah-003', 'whatsapp_click', 'ap-contact', 'header-whatsapp', now() - interval '3 hours'),
    ('demo-anugrah-004', 'section_engaged', 'ap-hero', NULL, now() - interval '4 hours 55 minutes'),
    ('demo-anugrah-004', 'section_engaged', 'ap-process', NULL, now() - interval '4 hours 48 minutes'),
    ('demo-anugrah-004', 'cta_click', 'ap-process', 'process-sample-cta', now() - interval '4 hours 44 minutes'),
    ('demo-anugrah-004', 'form_start', 'ap-contact', 'contact-form', now() - interval '4 hours 42 minutes'),
    ('demo-anugrah-005', 'section_engaged', 'ap-portfolio', NULL, now() - interval '1 day 55 minutes'),
    ('demo-anugrah-005', 'section_engaged', 'ap-portfolio', NULL, now() - interval '1 day 50 minutes'),
    ('demo-anugrah-005', 'page_leave', 'ap-portfolio', NULL, now() - interval '1 day 45 minutes'),
    ('demo-anugrah-006', 'section_engaged', 'ap-faq', NULL, now() - interval '1 day 3 hours 55 minutes'),
    ('demo-anugrah-006', 'whatsapp_click', 'ap-faq', 'faq-whatsapp', now() - interval '1 day 3 hours 45 minutes'),
    ('demo-anugrah-007', 'section_engaged', 'ap-hero', NULL, now() - interval '2 days 1 hour 55 minutes'),
    ('demo-anugrah-007', 'cta_click', 'ap-hero', 'hero-primary-quote', now() - interval '2 days 1 hour 50 minutes'),
    ('demo-anugrah-007', 'form_submit', 'ap-contact', 'contact-form', now() - interval '2 days 1 hour 45 minutes'),
    ('demo-anugrah-008', 'section_engaged', 'ap-material', NULL, now() - interval '2 days 5 hours 55 minutes'),
    ('demo-anugrah-008', 'page_leave', 'ap-material', NULL, now() - interval '2 days 5 hours 40 minutes'),
    ('demo-anugrah-009', 'section_engaged', 'ap-portfolio', NULL, now() - interval '3 days 1 hour 58 minutes'),
    ('demo-anugrah-009', 'cta_click', 'ap-portfolio', 'portfolio-cta', now() - interval '3 days 1 hour 55 minutes'),
    ('demo-anugrah-009', 'whatsapp_click', 'ap-contact', 'floating-whatsapp', now() - interval '3 days 1 hour 50 minutes'),
    ('demo-anugrah-010', 'section_engaged', 'ap-faq', NULL, now() - interval '3 days 23 hours 50 minutes'),
    ('demo-anugrah-010', 'page_leave', 'ap-faq', NULL, now() - interval '3 days 23 hours 35 minutes'),
    ('demo-anugrah-011', 'section_engaged', 'ap-hero', NULL, now() - interval '5 days 2 hours 50 minutes'),
    ('demo-anugrah-011', 'form_start', 'ap-contact', 'contact-form', now() - interval '5 days 2 hours 40 minutes'),
    ('demo-anugrah-011', 'form_submit', 'ap-contact', 'contact-form', now() - interval '5 days 2 hours 30 minutes'),
    ('demo-anugrah-012', 'section_engaged', 'ap-process', NULL, now() - interval '6 days 50 minutes'),
    ('demo-anugrah-012', 'cta_click', 'ap-process', 'process-sample-cta', now() - interval '6 days 45 minutes'),
    ('demo-anugrah-012', 'page_leave', 'ap-process', NULL, now() - interval '6 days 40 minutes')
)
INSERT INTO analytics_events (session_id, name, path, section_key, element_key, occurred_at)
SELECT sessions.id, events.name, '/', events.section_key, events.element_key, events.occurred_at
FROM events
JOIN analytics_sessions sessions ON sessions.anonymous_id = events.anonymous_id
WHERE NOT EXISTS (
  SELECT 1
  FROM analytics_events existing
  WHERE existing.session_id = sessions.id
    AND existing.name = events.name
    AND existing.occurred_at = events.occurred_at
);

WITH admin_user AS (
  SELECT id FROM users WHERE role = 'admin' AND is_active = true ORDER BY created_at LIMIT 1
), entries(action, entity_type, entity_id, metadata, created_at) AS (
  VALUES
    ('prospect.assigned', 'lead', 'demo-budi', '{"source":"demo"}'::jsonb, now() - interval '28 minutes'),
    ('prospect.note_added', 'lead', 'demo-budi', '{"source":"demo"}'::jsonb, now() - interval '25 minutes'),
    ('prospect.whatsapp_started', 'lead', 'demo-rizky', '{"source":"demo"}'::jsonb, now() - interval '4 hours'),
    ('content.publish', 'content_block', 'landing-page', '{"source":"demo","version":1}'::jsonb, now() - interval '1 day 2 hours')
)
INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata, created_at)
SELECT (SELECT id FROM admin_user), action, entity_type, entity_id, metadata, created_at
FROM entries
WHERE NOT EXISTS (
  SELECT 1 FROM audit_logs existing WHERE existing.action = entries.action AND existing.entity_id = entries.entity_id
);
