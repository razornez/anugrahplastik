CREATE TABLE "invoice_issuer_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"legal_name" varchar(180) DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"phone" varchar(60) DEFAULT '' NOT NULL,
	"email" varchar(255) DEFAULT '' NOT NULL,
	"website" varchar(255) DEFAULT '' NOT NULL,
	"tax_id" varchar(40) DEFAULT '' NOT NULL,
	"bank_name" varchar(100) DEFAULT '' NOT NULL,
	"bank_account_no" varchar(80) DEFAULT '' NOT NULL,
	"bank_account_name" varchar(180) DEFAULT '' NOT NULL,
	"signer_name" varchar(120) DEFAULT '' NOT NULL,
	"signer_title" varchar(100) DEFAULT '' NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_number_counters" (
	"reference_year" integer PRIMARY KEY NOT NULL,
	"last_value" integer NOT NULL,
	"initialized_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transaction_invoices" ADD COLUMN "shipment_id" uuid;--> statement-breakpoint
ALTER TABLE "transaction_invoices" ADD COLUMN "dp_applied" numeric(16, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction_invoices" ADD COLUMN "payment_terms" text;--> statement-breakpoint
ALTER TABLE "transaction_invoices" ADD COLUMN "snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "transaction_lines" ADD COLUMN "tax_method" varchar(24) DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction_lines" ADD COLUMN "discount_kind" varchar(12) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction_lines" ADD COLUMN "discount_value" numeric(16, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_issuer_settings" ADD CONSTRAINT "invoice_issuer_settings_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_number_counters" ADD CONSTRAINT "invoice_number_counters_initialized_by_users_id_fk" FOREIGN KEY ("initialized_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_invoices" ADD CONSTRAINT "transaction_invoices_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE restrict ON UPDATE no action;