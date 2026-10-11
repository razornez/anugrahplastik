CREATE TABLE "growth_competitor_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"competitors" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "growth_search_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"location" varchar(80) NOT NULL,
	"device" varchar(16) NOT NULL,
	"competitors" jsonb NOT NULL,
	"results" jsonb NOT NULL,
	"evidence_path" varchar(500),
	"evidence_checksum" varchar(64),
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "growth_competitor_settings" ADD CONSTRAINT "growth_competitor_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_search_audits" ADD CONSTRAINT "growth_search_audits_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "growth_search_audits_checked_at_idx" ON "growth_search_audits" USING btree ("checked_at");--> statement-breakpoint
CREATE INDEX "analytics_sessions_anonymous_created_at_idx" ON "analytics_sessions" USING btree ("anonymous_id","created_at");