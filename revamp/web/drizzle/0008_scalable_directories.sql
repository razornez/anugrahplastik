CREATE TABLE IF NOT EXISTS "master_number_counters" (
  "kind" varchar(24) PRIMARY KEY NOT NULL,
  "last_value" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "master_number_counters" ("kind", "last_value")
VALUES
  ('customer', COALESCE((SELECT MAX((substring("code" from '[0-9]+$'))::integer) FROM "customers" WHERE "code" ~ '^CUS-[0-9]+$'), 0)),
  ('supplier', COALESCE((SELECT MAX((substring("code" from '[0-9]+$'))::integer) FROM "suppliers" WHERE "code" ~ '^SUP-[0-9]+$'), 0)),
  ('material', COALESCE((SELECT MAX((substring("code" from '[0-9]+$'))::integer) FROM "materials" WHERE "code" ~ '^MAT-[0-9]+$'), 0)),
  ('product', COALESCE((SELECT MAX((substring("sku" from '[0-9]+$'))::integer) FROM "products" WHERE "sku" ~ '^PRD-[0-9]+$'), 0)),
  ('mould', COALESCE((SELECT MAX((substring("code" from '[0-9]+$'))::integer) FROM "moulds" WHERE "code" ~ '^MLD-[0-9]+$'), 0))
ON CONFLICT ("kind") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "analytics_sessions" ADD COLUMN IF NOT EXISTS "source_name" varchar(120) DEFAULT 'Langsung' NOT NULL;
--> statement-breakpoint
ALTER TABLE "analytics_sessions" ADD COLUMN IF NOT EXISTS "outcome" varchar(40) DEFAULT 'Melihat halaman' NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_sessions_source_created_at_idx" ON "analytics_sessions" USING btree ("source_name", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_sessions_outcome_created_at_idx" ON "analytics_sessions" USING btree ("outcome", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_created_at_idx" ON "leads" USING btree ("created_at");
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_search_idx" ON "customers" USING gin (("display_name" || ' ' || "code") gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suppliers_search_idx" ON "suppliers" USING gin (("name" || ' ' || "code") gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "materials_search_idx" ON "materials" USING gin (("name" || ' ' || "code") gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_search_idx" ON "products" USING gin (("name" || ' ' || "sku") gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "moulds_search_idx" ON "moulds" USING gin (("name" || ' ' || "code") gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_search_idx" ON "leads" USING gin (("name" || ' ' || "phone") gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_search_idx" ON "business_transactions" USING gin (("reference_no" || ' ' || "title") gin_trgm_ops);
--> statement-breakpoint
UPDATE "analytics_sessions"
SET "source_name" = CASE
  WHEN "referrer" IS NULL OR "referrer" = '' THEN 'Langsung'
  WHEN lower("referrer") LIKE '%google%' THEN 'Google'
  WHEN lower("referrer") LIKE '%instagram%' THEN 'Instagram'
  WHEN lower("referrer") LIKE '%facebook%' THEN 'Facebook'
  ELSE regexp_replace(regexp_replace("referrer", '^https?://', ''), '/.*$', '')
END;
--> statement-breakpoint
UPDATE "analytics_sessions" session
SET "outcome" = CASE
  WHEN EXISTS (SELECT 1 FROM "analytics_events" event WHERE event."session_id" = session."id" AND event."name" = 'form_submit') THEN 'Form terkirim'
  WHEN EXISTS (SELECT 1 FROM "analytics_events" event WHERE event."session_id" = session."id" AND event."name" = 'whatsapp_click') THEN 'Klik WhatsApp'
  WHEN EXISTS (SELECT 1 FROM "analytics_events" event WHERE event."session_id" = session."id" AND event."name" = 'form_start') THEN 'Form mulai diisi'
  WHEN EXISTS (SELECT 1 FROM "analytics_events" event WHERE event."session_id" = session."id" AND event."name" = 'cta_click') THEN 'Tombol minat diklik'
  ELSE 'Melihat halaman'
END;
