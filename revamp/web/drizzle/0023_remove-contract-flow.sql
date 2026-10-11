-- Keep historical contract documents and audit intact. Only align the current
-- commercial stage with the invoice and PO records that actually exist.
UPDATE "business_transactions" AS "transaction"
SET "commercial_status" = CASE
  WHEN EXISTS (
    SELECT 1 FROM "transaction_invoices" AS "invoice"
    WHERE "invoice"."transaction_id" = "transaction"."id"
      AND "invoice"."status" IN ('issued', 'sent', 'partial', 'paid', 'overdue')
  ) THEN 'invoice_issued'
  WHEN EXISTS (
    SELECT 1 FROM "transaction_documents" AS "document"
    WHERE "document"."transaction_id" = "transaction"."id"
      AND "document"."type" = 'purchase_order'
      AND "document"."status" = 'received'
  ) THEN 'po_received'
  ELSE 'quotation'
END
WHERE "transaction"."commercial_status" = 'contract';
