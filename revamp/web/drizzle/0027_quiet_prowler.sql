CREATE TABLE "growth_seo_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_key" varchar(10) NOT NULL,
	"status" varchar(16) NOT NULL,
	"checked_at" timestamp with time zone,
	"competitors" jsonb NOT NULL,
	"results" jsonb,
	"pages" jsonb,
	"error" varchar(300),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "growth_seo_audits_week_key_unique" UNIQUE("week_key")
);
--> statement-breakpoint
CREATE TABLE "growth_serp_usage" (
	"month_key" varchar(7) PRIMARY KEY NOT NULL,
	"used" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "growth_seo_audits_checked_at_idx" ON "growth_seo_audits" USING btree ("checked_at");