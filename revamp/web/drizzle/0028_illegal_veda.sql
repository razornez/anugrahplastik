CREATE TABLE "growth_market_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_key" varchar(10) NOT NULL,
	"topic" varchar(100) NOT NULL,
	"status" varchar(16) NOT NULL,
	"checked_at" timestamp with time zone,
	"rising" jsonb,
	"error" varchar(300),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "growth_market_signals_week_key_unique" UNIQUE("week_key")
);
--> statement-breakpoint
CREATE TABLE "growth_opportunity_reviews" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"status" varchar(20) NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "growth_opportunity_reviews" ADD CONSTRAINT "growth_opportunity_reviews_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;