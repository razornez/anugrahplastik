CREATE TABLE "delivery_number_counters" (
	"reference_year" integer PRIMARY KEY NOT NULL,
	"last_value" integer NOT NULL,
	"initialized_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shipment_lines" ADD COLUMN "logistics" jsonb;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "delivery_no" varchar(80);--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "delivery_details" jsonb;--> statement-breakpoint
ALTER TABLE "delivery_number_counters" ADD CONSTRAINT "delivery_number_counters_initialized_by_users_id_fk" FOREIGN KEY ("initialized_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_delivery_no_unique" UNIQUE("delivery_no");