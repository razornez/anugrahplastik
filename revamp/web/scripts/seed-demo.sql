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

UPDATE analytics_sessions
SET
  device_category = CASE
    WHEN anonymous_id IN ('demo-anugrah-001', 'demo-anugrah-002', 'demo-anugrah-005', 'demo-anugrah-007', 'demo-anugrah-010') THEN 'mobile'
    WHEN anonymous_id IN ('demo-anugrah-003', 'demo-anugrah-008') THEN 'tablet'
    ELSE 'desktop'
  END,
  browser_name = CASE WHEN anonymous_id IN ('demo-anugrah-001', 'demo-anugrah-005', 'demo-anugrah-007') THEN 'Safari' ELSE 'Chrome' END,
  operating_system = CASE
    WHEN anonymous_id IN ('demo-anugrah-001', 'demo-anugrah-005', 'demo-anugrah-007') THEN 'iOS'
    WHEN anonymous_id IN ('demo-anugrah-002', 'demo-anugrah-010') THEN 'Android'
    ELSE 'Windows'
  END,
  city_name = CASE
    WHEN anonymous_id IN ('demo-anugrah-001', 'demo-anugrah-004', 'demo-anugrah-009') THEN 'Bandung'
    WHEN anonymous_id IN ('demo-anugrah-002', 'demo-anugrah-007') THEN 'Jakarta Selatan'
    WHEN anonymous_id IN ('demo-anugrah-003', 'demo-anugrah-008') THEN 'Bekasi'
    WHEN anonymous_id IN ('demo-anugrah-005', 'demo-anugrah-010') THEN 'Cimahi'
    ELSE 'Bandung Barat'
  END
WHERE anonymous_id LIKE 'demo-anugrah-%';

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

WITH ordered AS (
  SELECT id, row_number() OVER (PARTITION BY session_id ORDER BY occurred_at, id) AS position
  FROM analytics_events
  WHERE session_id IN (SELECT id FROM analytics_sessions WHERE anonymous_id LIKE 'demo-anugrah-%')
)
UPDATE analytics_events SET sequence = ordered.position FROM ordered WHERE analytics_events.id = ordered.id;

UPDATE analytics_sessions AS session
SET
  last_section_key = last_event.section_key,
  last_event_at = last_event.occurred_at,
  ended_at = CASE WHEN last_event.name = 'page_leave' THEN last_event.occurred_at ELSE NULL END,
  duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (last_event.occurred_at - session.created_at))::integer)
FROM analytics_events AS last_event
WHERE last_event.id = (
  SELECT id
  FROM analytics_events
  WHERE session_id = session.id
  ORDER BY sequence DESC
  LIMIT 1
) AND session.anonymous_id LIKE 'demo-anugrah-%';

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

-- Operational demonstration data. Values deliberately reflect different stages so the transaction workspace can be reviewed.
INSERT INTO customers (code, legal_name, display_name, email, phone, delivery_address, notes)
VALUES
  ('CUS-001', 'PT Sinar Kemasan Nusantara', 'Sinar Kemasan', 'purchasing@sinarkemasan.co.id', '0812-7890-1122', 'Kawasan Industri Rancaekek, Bandung', 'Komponen untuk lini pengemasan.'),
  ('CUS-002', 'CV Garuda Teknik Mandiri', 'Garuda Teknik', 'operasional@garudateknik.co.id', '0813-4402-8831', 'Cimahi, Jawa Barat', 'Reproduksi spare part mesin.'),
  ('CUS-003', 'PT Daya Cipta Interior', 'Daya Cipta Interior', 'proyek@dayacipta.co.id', '0811-2233-8877', 'Kota Bandung, Jawa Barat', 'Produk custom proyek interior.')
ON CONFLICT (code) DO NOTHING;

INSERT INTO suppliers (code, name, contact_name, phone, notes)
VALUES
  ('SUP-001', 'PT Polimer Jaya', 'Rudi', '0812-1001-2222', 'Resin PP dan HDPE.'),
  ('SUP-002', 'CV Warna Presisi', 'Intan', '0812-3004-5521', 'Masterbatch dan warna custom.')
ON CONFLICT (code) DO NOTHING;

INSERT INTO materials (code, name, polymer_family, grade, density, notes)
VALUES
  ('MAT-PP-01', 'Polypropylene Natural', 'PP', 'Injection grade', 0.900, 'Untuk komponen umum.'),
  ('MAT-NYL-01', 'Nylon 6', 'Nylon', 'Engineering grade', 1.140, 'Untuk gear dan komponen tahan aus.'),
  ('MAT-HDPE-01', 'HDPE Natural', 'HDPE', 'Blow / injection grade', 0.950, 'Untuk komponen dengan ketahanan kimia.')
ON CONFLICT (code) DO NOTHING;

INSERT INTO material_suppliers (material_id, supplier_id, supplier_sku, reference_price, lead_time_days, is_preferred)
SELECT material.id, supplier.id, source.sku, source.price, source.lead_days, true
FROM (VALUES
  ('MAT-PP-01', 'SUP-001', 'PP-INJ-NAT', 18500.00, 3),
  ('MAT-NYL-01', 'SUP-001', 'NYL6-ENG', 62000.00, 5),
  ('MAT-HDPE-01', 'SUP-001', 'HDPE-NAT', 20500.00, 3)
) AS source(material_code, supplier_code, sku, price, lead_days)
JOIN materials material ON material.code = source.material_code
JOIN suppliers supplier ON supplier.code = source.supplier_code
ON CONFLICT (material_id, supplier_id) DO NOTHING;

INSERT INTO material_color_lots (material_id, color_name, color_code, lot_number)
SELECT material.id, source.color_name, source.color_code, source.lot_number
FROM (VALUES
  ('MAT-PP-01', 'Biru teknis', '#1767D1', 'PP-BLU-2408'),
  ('MAT-NYL-01', 'Hitam', '#1D2228', 'NYL-BLK-2409')
) AS source(material_code, color_name, color_code, lot_number)
JOIN materials material ON material.code = source.material_code
WHERE NOT EXISTS (SELECT 1 FROM material_color_lots existing WHERE existing.lot_number = source.lot_number);

INSERT INTO products (sku, name, specification, default_material_id, unit_weight_grams)
SELECT source.sku, source.name, source.specification, material.id, source.weight
FROM (VALUES
  ('PRD-GEAR-001', 'Cover gear mesin pengemas', 'Reproduksi berdasarkan sampel fisik.', 'MAT-NYL-01', 68.500),
  ('PRD-SPACER-001', 'Spacer nylon 30 mm', 'Komponen spacer mesin.', 'MAT-NYL-01', 12.200),
  ('PRD-CLIP-001', 'Clip kabel custom', 'Produk custom interior.', 'MAT-PP-01', 7.800)
) AS source(sku, name, specification, material_code, weight)
JOIN materials material ON material.code = source.material_code
ON CONFLICT (sku) DO NOTHING;

INSERT INTO moulds (code, name, product_id, cavity_count, construction_material, status)
SELECT source.code, source.name, product.id, source.cavities, source.construction_material, source.status
FROM (VALUES
  ('MLD-GEAR-01', 'Mould cover gear 1 cavity', 'PRD-GEAR-001', 1, 'P20 steel', 'active'),
  ('MLD-CLIP-01', 'Mould clip kabel 4 cavity', 'PRD-CLIP-001', 4, 'P20 steel', 'planned')
) AS source(code, name, product_sku, cavities, construction_material, status)
JOIN products product ON product.sku = source.product_sku
ON CONFLICT (code) DO NOTHING;

WITH admin_user AS (
  SELECT id FROM users WHERE role = 'admin' AND is_active = true ORDER BY created_at LIMIT 1
), source(reference_no, customer_code, title, commercial_status, payment_status, fulfilment_status, created_at) AS (
  VALUES
    ('TRX-2026-00001', 'CUS-001', 'Reproduksi cover gear mesin pengemas', 'quotation', 'awaiting_payment', 'not_released', now() - interval '1 day'),
    ('TRX-2026-00002', 'CUS-002', 'Produksi spacer nylon untuk mesin', 'contract', 'verified', 'released', now() - interval '6 days'),
    ('TRX-2026-00003', 'CUS-003', 'Clip kabel custom untuk proyek interior', 'po_received', 'partial', 'sample', now() - interval '12 days')
)
INSERT INTO business_transactions (reference_no, customer_id, owner_id, title, commercial_status, payment_status, fulfilment_status, created_at, updated_at, quoted_at)
SELECT source.reference_no, customer.id, (SELECT id FROM admin_user), source.title, source.commercial_status, source.payment_status, source.fulfilment_status, source.created_at, source.created_at, source.created_at
FROM source
JOIN customers customer ON customer.code = source.customer_code
ON CONFLICT (reference_no) DO NOTHING;

INSERT INTO transaction_lines (transaction_id, product_id, material_id, description, quantity, unit, unit_price, tax_rate)
SELECT transaction.id, product.id, material.id, source.description, source.quantity, 'pcs', source.unit_price, 11.00
FROM (VALUES
  ('TRX-2026-00001', 'PRD-GEAR-001', 'MAT-NYL-01', 'Cover gear mesin pengemas', 120.000, 78500.00),
  ('TRX-2026-00002', 'PRD-SPACER-001', 'MAT-NYL-01', 'Spacer nylon 30 mm', 1500.000, 6900.00),
  ('TRX-2026-00003', 'PRD-CLIP-001', 'MAT-PP-01', 'Clip kabel custom', 800.000, 4200.00)
) AS source(reference_no, product_sku, material_code, description, quantity, unit_price)
JOIN business_transactions transaction ON transaction.reference_no = source.reference_no
JOIN products product ON product.sku = source.product_sku
JOIN materials material ON material.code = source.material_code
WHERE NOT EXISTS (SELECT 1 FROM transaction_lines existing WHERE existing.transaction_id = transaction.id AND existing.description = source.description);

INSERT INTO transaction_invoices (transaction_id, invoice_no, kind, amount, due_at, status, issued_at)
SELECT transaction.id, source.invoice_no, source.kind, source.amount, now() + make_interval(days => source.due_offset), source.status, now() - interval '1 day'
FROM (VALUES
  ('TRX-2026-00001', 'INV-2026-00001', 'deposit', 2826000.00, 7, 'sent'),
  ('TRX-2026-00002', 'INV-2026-00002', 'final', 11488500.00, -1, 'paid'),
  ('TRX-2026-00003', 'INV-2026-00003', 'deposit', 1680000.00, 3, 'partial')
) AS source(reference_no, invoice_no, kind, amount, due_offset, status)
JOIN business_transactions transaction ON transaction.reference_no = source.reference_no
ON CONFLICT (invoice_no) DO NOTHING;

WITH admin_user AS (
  SELECT id FROM users WHERE role = 'admin' AND is_active = true ORDER BY created_at LIMIT 1
)
INSERT INTO transaction_financial_entries (transaction_id, invoice_id, kind, direction, amount, occurred_at, status, reference, verified_by, verified_at)
SELECT transaction.id, invoice.id, 'customer_payment', 'in', source.amount, now() - source.age, 'verified', source.reference, (SELECT id FROM admin_user), now() - source.age
FROM (VALUES
  ('TRX-2026-00002', 'INV-2026-00002', 11488500.00, interval '2 days', 'TRF-883920'),
  ('TRX-2026-00003', 'INV-2026-00003', 1000000.00, interval '4 days', 'TRF-882117')
) AS source(reference_no, invoice_no, amount, age, reference)
JOIN business_transactions transaction ON transaction.reference_no = source.reference_no
JOIN transaction_invoices invoice ON invoice.invoice_no = source.invoice_no
WHERE NOT EXISTS (SELECT 1 FROM transaction_financial_entries existing WHERE existing.reference = source.reference);

INSERT INTO production_batches (transaction_id, product_id, material_id, mould_id, batch_no, kind, status, planned_quantity, completed_quantity, started_at)
SELECT transaction.id, product.id, material.id, mould.id, source.batch_no, source.kind, source.status, source.planned, source.completed, now() - source.age
FROM (VALUES
  ('TRX-2026-00002', 'PRD-SPACER-001', 'MAT-NYL-01', 'MLD-GEAR-01', 'BAT-2026-00012', 'production', 'in_progress', 1500.000, 740.000, interval '1 day'),
  ('TRX-2026-00003', 'PRD-CLIP-001', 'MAT-PP-01', 'MLD-CLIP-01', 'BAT-2026-00013', 'sample', 'awaiting_approval', 20.000, 20.000, interval '3 days')
) AS source(reference_no, product_sku, material_code, mould_code, batch_no, kind, status, planned, completed, age)
JOIN business_transactions transaction ON transaction.reference_no = source.reference_no
JOIN products product ON product.sku = source.product_sku
JOIN materials material ON material.code = source.material_code
JOIN moulds mould ON mould.code = source.mould_code
ON CONFLICT (batch_no) DO NOTHING;

INSERT INTO transaction_number_counters (reference_year, last_value)
VALUES (2026, 3)
ON CONFLICT (reference_year) DO UPDATE SET last_value = GREATEST(transaction_number_counters.last_value, EXCLUDED.last_value), updated_at = now();
