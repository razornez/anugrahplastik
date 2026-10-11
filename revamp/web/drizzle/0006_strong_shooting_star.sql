CREATE TABLE "analytics_ingest_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "anonymous_id" varchar(72) NOT NULL,
  "payload" jsonb NOT NULL,
  "event_count" integer NOT NULL,
  "priority" integer DEFAULT 0 NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp with time zone,
  "last_error" text
);
--> statement-breakpoint
CREATE TABLE "analytics_worker_state" (
  "name" varchar(60) PRIMARY KEY NOT NULL,
  "heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processed_batches" integer DEFAULT 0 NOT NULL,
  "processed_events" integer DEFAULT 0 NOT NULL,
  "failed_batches" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analytics_sessions" ADD COLUMN "event_sequence" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE "customers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" varchar(32) NOT NULL UNIQUE,
  "kind" varchar(20) DEFAULT 'business' NOT NULL,
  "legal_name" varchar(180) NOT NULL,
  "display_name" varchar(180) NOT NULL,
  "tax_id" varchar(32),
  "email" varchar(255),
  "phone" varchar(32),
  "billing_address" text,
  "delivery_address" text,
  "notes" text,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_contacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
  "name" varchar(120) NOT NULL,
  "position" varchar(100),
  "email" varchar(255),
  "phone" varchar(32),
  "is_primary" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" varchar(32) NOT NULL UNIQUE,
  "name" varchar(180) NOT NULL,
  "contact_name" varchar(120),
  "email" varchar(255),
  "phone" varchar(32),
  "address" text,
  "notes" text,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "materials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" varchar(32) NOT NULL UNIQUE,
  "name" varchar(160) NOT NULL,
  "polymer_family" varchar(100) NOT NULL,
  "grade" varchar(120),
  "density" numeric(7,3),
  "unit" varchar(16) DEFAULT 'kg' NOT NULL,
  "notes" text,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_suppliers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "material_id" uuid NOT NULL REFERENCES "materials"("id") ON DELETE CASCADE,
  "supplier_id" uuid NOT NULL REFERENCES "suppliers"("id") ON DELETE RESTRICT,
  "supplier_sku" varchar(100),
  "reference_price" numeric(16,2),
  "lead_time_days" integer,
  "is_preferred" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "material_suppliers_material_supplier_unique" UNIQUE("material_id", "supplier_id")
);
--> statement-breakpoint
CREATE TABLE "material_color_lots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "material_id" uuid NOT NULL REFERENCES "materials"("id") ON DELETE CASCADE,
  "color_name" varchar(100) NOT NULL,
  "color_code" varchar(32),
  "lot_number" varchar(100),
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sku" varchar(64) NOT NULL UNIQUE,
  "name" varchar(180) NOT NULL,
  "specification" text,
  "default_material_id" uuid REFERENCES "materials"("id") ON DELETE SET NULL,
  "unit_weight_grams" numeric(12,3),
  "unit" varchar(16) DEFAULT 'pcs' NOT NULL,
  "photo_asset_id" uuid REFERENCES "media_assets"("id") ON DELETE SET NULL,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moulds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" varchar(64) NOT NULL UNIQUE,
  "name" varchar(180) NOT NULL,
  "product_id" uuid REFERENCES "products"("id") ON DELETE SET NULL,
  "cavity_count" integer,
  "construction_material" varchar(120),
  "status" varchar(24) DEFAULT 'planned' NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_number_counters" (
  "reference_year" integer PRIMARY KEY NOT NULL,
  "last_value" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "reference_no" varchar(32) NOT NULL UNIQUE,
  "lead_id" uuid REFERENCES "leads"("id") ON DELETE SET NULL,
  "customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE RESTRICT,
  "owner_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "title" varchar(220) NOT NULL,
  "commercial_status" varchar(32) DEFAULT 'quotation' NOT NULL,
  "payment_status" varchar(32) DEFAULT 'awaiting_invoice' NOT NULL,
  "fulfilment_status" varchar(32) DEFAULT 'not_released' NOT NULL,
  "hold_reason" text,
  "cancelled_at" timestamp with time zone,
  "quoted_at" timestamp with time zone,
  "due_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "transaction_id" uuid NOT NULL REFERENCES "business_transactions"("id") ON DELETE CASCADE,
  "product_id" uuid REFERENCES "products"("id") ON DELETE SET NULL,
  "material_id" uuid REFERENCES "materials"("id") ON DELETE SET NULL,
  "color_lot_id" uuid REFERENCES "material_color_lots"("id") ON DELETE SET NULL,
  "description" text NOT NULL,
  "quantity" numeric(16,3) NOT NULL,
  "unit" varchar(16) DEFAULT 'pcs' NOT NULL,
  "unit_price" numeric(16,2) DEFAULT '0' NOT NULL,
  "tax_rate" numeric(5,2) DEFAULT '0' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "transaction_id" uuid NOT NULL REFERENCES "business_transactions"("id") ON DELETE CASCADE,
  "invoice_no" varchar(80) NOT NULL UNIQUE,
  "kind" varchar(24) NOT NULL,
  "amount" numeric(16,2) NOT NULL,
  "due_at" timestamp with time zone,
  "status" varchar(24) DEFAULT 'draft' NOT NULL,
  "issued_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "transaction_id" uuid NOT NULL REFERENCES "business_transactions"("id") ON DELETE CASCADE,
  "invoice_id" uuid REFERENCES "transaction_invoices"("id") ON DELETE SET NULL,
  "type" varchar(36) NOT NULL,
  "direction" varchar(16) DEFAULT 'internal' NOT NULL,
  "document_no" varchar(100),
  "version" integer DEFAULT 1 NOT NULL,
  "status" varchar(24) DEFAULT 'draft' NOT NULL,
  "template_id" varchar(120),
  "provider_document_id" varchar(120),
  "storage_path" varchar(500),
  "original_name" varchar(255),
  "checksum" varchar(128),
  "sent_message_id" varchar(255),
  "recipient" varchar(255),
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_financial_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "transaction_id" uuid NOT NULL REFERENCES "business_transactions"("id") ON DELETE CASCADE,
  "invoice_id" uuid REFERENCES "transaction_invoices"("id") ON DELETE SET NULL,
  "kind" varchar(32) NOT NULL,
  "direction" varchar(12) NOT NULL,
  "amount" numeric(16,2) NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  "status" varchar(24) DEFAULT 'unverified' NOT NULL,
  "proof_document_id" uuid REFERENCES "transaction_documents"("id") ON DELETE SET NULL,
  "reference" varchar(160),
  "notes" text,
  "verified_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "verified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "transaction_id" uuid NOT NULL REFERENCES "business_transactions"("id") ON DELETE CASCADE,
  "product_id" uuid REFERENCES "products"("id") ON DELETE SET NULL,
  "material_id" uuid REFERENCES "materials"("id") ON DELETE SET NULL,
  "color_lot_id" uuid REFERENCES "material_color_lots"("id") ON DELETE SET NULL,
  "mould_id" uuid REFERENCES "moulds"("id") ON DELETE SET NULL,
  "batch_no" varchar(80) NOT NULL UNIQUE,
  "kind" varchar(24) DEFAULT 'production' NOT NULL,
  "status" varchar(32) DEFAULT 'planned' NOT NULL,
  "planned_quantity" numeric(16,3),
  "completed_quantity" numeric(16,3),
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "transaction_id" uuid NOT NULL REFERENCES "business_transactions"("id") ON DELETE CASCADE,
  "shipment_no" varchar(80) NOT NULL UNIQUE,
  "status" varchar(24) DEFAULT 'planned' NOT NULL,
  "recipient_name" varchar(160),
  "delivery_address" text,
  "shipped_at" timestamp with time zone,
  "received_at" timestamp with time zone,
  "delivery_document_id" uuid REFERENCES "transaction_documents"("id") ON DELETE SET NULL,
  "bast_document_id" uuid REFERENCES "transaction_documents"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipment_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "shipment_id" uuid NOT NULL REFERENCES "shipments"("id") ON DELETE CASCADE,
  "transaction_line_id" uuid NOT NULL REFERENCES "transaction_lines"("id") ON DELETE RESTRICT,
  "quantity" numeric(16,3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_design_files" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "product_id" uuid REFERENCES "products"("id") ON DELETE SET NULL,
  "mould_id" uuid REFERENCES "moulds"("id") ON DELETE SET NULL,
  "customer_id" uuid REFERENCES "customers"("id") ON DELETE SET NULL,
  "transaction_id" uuid REFERENCES "business_transactions"("id") ON DELETE SET NULL,
  "origin" varchar(24) NOT NULL,
  "file_kind" varchar(24) NOT NULL,
  "format" varchar(12) NOT NULL,
  "storage_path" varchar(500) NOT NULL UNIQUE,
  "original_name" varchar(255) NOT NULL,
  "mime_type" varchar(120) NOT NULL,
  "byte_size" integer NOT NULL,
  "checksum" varchar(128) NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "reuse_approved_at" timestamp with time zone,
  "reuse_approved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "analytics_ingest_batches_status_received_idx" ON "analytics_ingest_batches" ("status", "received_at");
--> statement-breakpoint
CREATE INDEX "analytics_ingest_batches_anonymous_received_idx" ON "analytics_ingest_batches" ("anonymous_id", "received_at");
--> statement-breakpoint
CREATE INDEX "customers_status_display_name_idx" ON "customers" ("status", "display_name");
--> statement-breakpoint
CREATE INDEX "materials_status_name_idx" ON "materials" ("status", "name");
--> statement-breakpoint
CREATE INDEX "business_transactions_customer_created_idx" ON "business_transactions" ("customer_id", "created_at");
--> statement-breakpoint
CREATE INDEX "business_transactions_status_updated_idx" ON "business_transactions" ("commercial_status", "updated_at");
--> statement-breakpoint
CREATE INDEX "transaction_lines_transaction_idx" ON "transaction_lines" ("transaction_id");
--> statement-breakpoint
CREATE INDEX "transaction_invoices_transaction_status_idx" ON "transaction_invoices" ("transaction_id", "status");
--> statement-breakpoint
CREATE INDEX "transaction_documents_transaction_type_idx" ON "transaction_documents" ("transaction_id", "type");
--> statement-breakpoint
CREATE INDEX "transaction_financial_entries_transaction_status_idx" ON "transaction_financial_entries" ("transaction_id", "status");
--> statement-breakpoint
CREATE INDEX "production_batches_transaction_status_idx" ON "production_batches" ("transaction_id", "status");
--> statement-breakpoint
CREATE INDEX "shipments_transaction_status_idx" ON "shipments" ("transaction_id", "status");
