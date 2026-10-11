-- Local-only Beranda preview. Never run against production.
BEGIN;

-- Reclassify only rows whose exact identity matches the historical local seed.
UPDATE leads SET data_class = 'demo'
WHERE data_class = 'production' AND (name, phone) IN (
  ('Budi Santoso', '0812-6654-1102'),
  ('Nadia Pratama', '0857-9102-4881'),
  ('Rizky Mahendra', '0813-3310-7844'),
  ('Taufik Hidayat', '0821-5540-9928'),
  ('Sari Wulandari', '0811-2305-772'),
  ('Andika Putra', '0896-7812-3900')
);
UPDATE business_transactions SET data_class = 'demo'
WHERE data_class = 'production' AND (reference_no, title) IN (
  ('TRX-2026-00001', 'Reproduksi cover gear mesin pengemas'),
  ('TRX-2026-00002', 'Produksi spacer nylon untuk mesin'),
  ('TRX-2026-00003', 'Clip kabel custom untuk proyek interior')
);
UPDATE analytics_sessions SET traffic_class = 'demo'
WHERE traffic_class = 'public' AND anonymous_id IN (
  'demo-anugrah-001', 'demo-anugrah-002', 'demo-anugrah-003', 'demo-anugrah-004',
  'demo-anugrah-005', 'demo-anugrah-006', 'demo-anugrah-007', 'demo-anugrah-008',
  'demo-anugrah-009', 'demo-anugrah-010', 'demo-anugrah-011', 'demo-anugrah-012'
);

INSERT INTO leads (name, message, source, landing_path, data_class, created_at)
SELECT sample.name, sample.message, 'home-demo-v1', '/__demo__/home', 'demo',
  now() - sample.days_ago * interval '1 day'
FROM (VALUES
  ('Contoh permintaan spacer', 'Mohon informasi spacer conduit untuk proyek baru.', 0),
  ('Contoh permintaan cetak plastik', 'Ingin menanyakan pembuatan komponen dari sampel.', 2),
  ('Contoh permintaan spare part', 'Perlu perkiraan biaya pembuatan spare part plastik.', 16)
) AS sample(name, message, days_ago)
WHERE NOT EXISTS (
  SELECT 1 FROM leads existing
  WHERE existing.source = 'home-demo-v1' AND existing.name = sample.name
);

-- Stable session keys make re-running this seed safe. Dates follow Jakarta calendar days.
WITH visits AS (
  SELECT day_no, visit_no,
    (date_trunc('day', now() AT TIME ZONE 'Asia/Jakarta')
      - day_no * interval '1 day' + (9 + visit_no) * interval '1 hour') AT TIME ZONE 'Asia/Jakarta' AS visit_at
  FROM generate_series(0, 29) AS day_no
  CROSS JOIN LATERAL generate_series(1, 2 + day_no % 4) AS visit_no
), sample AS (
  SELECT *,
    'home-demo-' || to_char(visit_at AT TIME ZONE 'Asia/Jakarta', 'YYYYMMDD') || '-' || visit_no AS demo_key,
    (visit_no = 1 AND day_no % 3 = 0) AS completed_form
  FROM visits
)
INSERT INTO analytics_sessions (
  anonymous_id, session_key, traffic_class, landing_path, source_name, outcome, form_status,
  device_category, country_name, region_name, city_name, last_section_key, created_at, consented_at, last_seen_at,
  last_event_at, ended_at, duration_seconds, duration_quality
)
SELECT demo_key, demo_key, 'demo', '/',
  (ARRAY['Google', 'Langsung', 'Instagram', 'Google Ads'])[1 + (day_no + visit_no) % 4],
  CASE WHEN completed_form THEN 'Form terkirim' ELSE 'Melihat halaman' END,
  CASE WHEN completed_form THEN 'valid' ELSE NULL END,
  (ARRAY['mobile', 'desktop', 'tablet'])[1 + (day_no + visit_no) % 3],
  (ARRAY['Indonesia', 'Indonesia', 'Indonesia', 'Indonesia', 'Indonesia', 'Indonesia', 'Singapore', 'Malaysia', NULL])[1 + (day_no + visit_no) % 9],
  (ARRAY['West Java', 'Jakarta', 'Central Java', 'East Java', 'Bali', 'West Java', 'Singapore', 'Selangor', NULL])[1 + (day_no + visit_no) % 9],
  (ARRAY['Bandung', 'Jakarta', 'Semarang', 'Surabaya', 'Denpasar', 'Cimahi', 'Singapore', 'Shah Alam', NULL])[1 + (day_no + visit_no) % 9],
  (ARRAY['ap-hero', 'ap-portfolio', 'ap-material', 'ap-process', 'ap-faq'])[1 + (day_no + visit_no) % 5],
  visit_at, visit_at, visit_at + interval '8 minutes', visit_at + interval '8 minutes',
  CASE WHEN (day_no + visit_no) % 5 = 0 THEN NULL ELSE visit_at + interval '8 minutes' END,
  480, 'measured'
FROM sample
ON CONFLICT (session_key) DO UPDATE SET
  traffic_class = 'demo', source_name = EXCLUDED.source_name, outcome = EXCLUDED.outcome,
  form_status = EXCLUDED.form_status, device_category = EXCLUDED.device_category,
  country_name = EXCLUDED.country_name, region_name = EXCLUDED.region_name,
  city_name = EXCLUDED.city_name, last_section_key = EXCLUDED.last_section_key,
  created_at = EXCLUDED.created_at, consented_at = EXCLUDED.consented_at,
  last_seen_at = EXCLUDED.last_seen_at, last_event_at = EXCLUDED.last_event_at,
  ended_at = EXCLUDED.ended_at
WHERE analytics_sessions.traffic_class = 'demo' AND analytics_sessions.anonymous_id = EXCLUDED.anonymous_id;

WITH events AS (
  SELECT s.id AS session_id, sample.*, event.name, event.sequence, event.section_key
  FROM analytics_sessions s
  JOIN (
    SELECT day_no, visit_no,
      'home-demo-' || to_char(
        date_trunc('day', now() AT TIME ZONE 'Asia/Jakarta') - day_no * interval '1 day',
        'YYYYMMDD'
      ) || '-' || visit_no AS demo_key
    FROM generate_series(0, 29) AS day_no
    CROSS JOIN LATERAL generate_series(1, 2 + day_no % 4) AS visit_no
  ) sample ON s.session_key = sample.demo_key
  CROSS JOIN LATERAL (VALUES
    ('section_engaged', 1, s.last_section_key),
    ('cta_click', 2, s.last_section_key),
    ('form_start', 3, 'ap-contact'),
    ('form_submit', 4, 'ap-contact'),
    ('whatsapp_click', 5, 'ap-contact'),
    ('page_leave', 6, s.last_section_key)
  ) event(name, sequence, section_key)
  WHERE event.name = 'section_engaged'
    OR (event.name = 'cta_click' AND visit_no <= 2)
    OR (event.name IN ('form_start', 'form_submit') AND visit_no = 1 AND day_no % 3 = 0)
    OR (event.name = 'whatsapp_click' AND visit_no = 2 AND day_no % 2 = 0)
    OR (event.name = 'page_leave' AND (day_no + visit_no) % 5 <> 0)
)
INSERT INTO analytics_events (session_id, name, path, section_key, sequence, metadata, occurred_at)
SELECT session_id, name, '/', section_key, sequence, '{"seed":"home-demo-v1"}'::jsonb,
  s.created_at + sequence * interval '1 minute'
FROM events
JOIN analytics_sessions s ON s.id = events.session_id
WHERE NOT EXISTS (
  SELECT 1 FROM analytics_events existing
  WHERE existing.session_id = events.session_id AND existing.sequence = events.sequence
    AND existing.metadata->>'seed' = 'home-demo-v1'
);

COMMIT;
