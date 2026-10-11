-- Local-only negative-test fixture. Never run against production.
-- All records are explicitly classified as test; no DocGen or email is invoked.
DO $$
DECLARE
  qa_customer uuid;
  qa_actor uuid;
  qa_transaction uuid;
  qa_line uuid;
  qa_shipment uuid;
BEGIN
  SELECT id INTO qa_customer FROM customers WHERE code = 'CUS-QA-DOCGEN' AND status = 'active';
  SELECT id INTO qa_actor FROM users WHERE role = 'admin' AND is_active = true ORDER BY created_at LIMIT 1;
  IF qa_customer IS NULL OR qa_actor IS NULL THEN
    RAISE EXCEPTION 'QA customer or active administrator missing';
  END IF;
  SELECT id INTO qa_transaction FROM business_transactions WHERE reference_no = 'TRX-2026-UJI02';
  IF qa_transaction IS NOT NULL THEN
    RAISE NOTICE 'QA fixture already exists: %', qa_transaction;
    RETURN;
  END IF;
  INSERT INTO business_transactions (
    reference_no, customer_id, owner_id, title, data_class,
    commercial_status, payment_status, fulfilment_status, due_at
  ) VALUES (
    'TRX-2026-UJI02', qa_customer, qa_actor,
    '[UJI] Stabilisasi transaksi - tidak untuk pelanggan', 'test',
    'invoice_issued', 'payment_recorded', 'released', now() + interval '14 days'
  ) RETURNING id INTO qa_transaction;
  INSERT INTO transaction_lines (
    transaction_id, description, quantity, unit, unit_price, tax_rate, sort_order
  ) VALUES (
    qa_transaction, '[UJI] Spacer fiktif', 100, 'pcs', 10000, 0, 0
  ) RETURNING id INTO qa_line;
  INSERT INTO transaction_invoices (
    transaction_id, invoice_no, kind, amount, due_at, status, issued_at
  ) VALUES (
    qa_transaction, 'TRX-2026-UJI02-INV-01', 'final', 1000000,
    now() + interval '14 days', 'issued', now()
  );
  INSERT INTO transaction_financial_entries (
    transaction_id, kind, direction, amount, occurred_at, status, reference
  ) VALUES (
    qa_transaction, 'customer_payment', 'in', 300000, now(),
    'unverified', '[UJI] Belum diverifikasi'
  );
  INSERT INTO shipments (
    transaction_id, shipment_no, status, recipient_name, delivery_address, shipped_at
  ) VALUES (
    qa_transaction, 'TRX-2026-UJI02-SJ-01', 'shipped',
    '[UJI] Penerima fiktif', 'Alamat fiktif untuk pengujian lokal', now()
  ) RETURNING id INTO qa_shipment;
  INSERT INTO shipment_lines (shipment_id, transaction_line_id, quantity)
  VALUES (qa_shipment, qa_line, 40);
  INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    qa_actor, 'transaction.qa_fixture_created', 'transaction', qa_transaction,
    '{"dataClass":"test","purpose":"negative workflow checks","noDocgen":true}'::jsonb
  );
  RAISE NOTICE 'Created QA transaction: %', qa_transaction;
END $$;
