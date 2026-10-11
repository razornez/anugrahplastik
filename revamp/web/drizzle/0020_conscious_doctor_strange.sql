CREATE TABLE "quotation_number_counters" (
	"reference_year" integer PRIMARY KEY NOT NULL,
	"last_value" integer NOT NULL,
	"initialized_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_transactions" ADD COLUMN "quotation_no" varchar(80);--> statement-breakpoint
ALTER TABLE "business_transactions" ADD COLUMN "quote_letter" jsonb;--> statement-breakpoint
ALTER TABLE "transaction_lines" ADD COLUMN "material_label" varchar(160) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction_lines" ADD COLUMN "moulding_label" varchar(160) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "quotation_number_counters" ADD CONSTRAINT "quotation_number_counters_initialized_by_users_id_fk" FOREIGN KEY ("initialized_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_transactions" ADD CONSTRAINT "business_transactions_quotation_no_unique" UNIQUE("quotation_no");