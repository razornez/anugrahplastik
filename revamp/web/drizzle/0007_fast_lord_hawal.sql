CREATE TABLE IF NOT EXISTS "transaction_number_counters" (
	"reference_year" integer PRIMARY KEY NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analytics_sessions" ADD COLUMN IF NOT EXISTS "event_sequence" integer DEFAULT 0 NOT NULL;
