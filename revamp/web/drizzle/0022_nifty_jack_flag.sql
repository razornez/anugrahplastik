CREATE TABLE "handover_number_counters" (
	"reference_year" integer PRIMARY KEY NOT NULL,
	"last_value" integer NOT NULL,
	"initialized_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shipment_lines" ADD COLUMN "accepted_quantity" numeric(16, 3);--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "handover_no" varchar(80);--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "handover_details" jsonb;--> statement-breakpoint
ALTER TABLE "handover_number_counters" ADD CONSTRAINT "handover_number_counters_initialized_by_users_id_fk" FOREIGN KEY ("initialized_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_handover_no_unique" UNIQUE("handover_no");