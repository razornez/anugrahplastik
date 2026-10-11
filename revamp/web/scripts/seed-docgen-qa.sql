-- Local-only fixture for the temporary DocGen templates. Never run against production.
BEGIN;

INSERT INTO customers (code, kind, legal_name, display_name, email, notes, status)
VALUES (
  'CUS-QA-DOCGEN',
  'business',
  'Pelanggan Uji DocGen',
  '[UJI] Pelanggan DocGen',
  'razornez@gmail.com',
  'Data fiktif untuk menguji PDF contoh. Jangan gunakan untuk pekerjaan customer.',
  'active'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO business_transactions (reference_no, customer_id, title, data_class)
SELECT 'TRX-2026-UJI01', id, '[UJI] Contoh Spacer Conduit', 'test'
FROM customers
WHERE code = 'CUS-QA-DOCGEN'
ON CONFLICT (reference_no) DO NOTHING;

INSERT INTO transaction_lines (transaction_id, description, quantity, unit, unit_price, tax_rate, sort_order)
SELECT id, 'Spacer conduit contoh', 100, 'pcs', 10000, 0, 0
FROM business_transactions
WHERE reference_no = 'TRX-2026-UJI01'
  AND NOT EXISTS (
    SELECT 1 FROM transaction_lines WHERE transaction_id = business_transactions.id
  );

COMMIT;
