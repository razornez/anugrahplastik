ALTER TABLE "analytics_sessions" ADD COLUMN "device_category" varchar(20) DEFAULT 'unknown' NOT NULL;
--> statement-breakpoint
ALTER TABLE "analytics_sessions" ADD COLUMN "browser_name" varchar(80);
--> statement-breakpoint
ALTER TABLE "analytics_sessions" ADD COLUMN "operating_system" varchar(80);
--> statement-breakpoint
ALTER TABLE "analytics_sessions" ADD COLUMN "country_name" varchar(100);
--> statement-breakpoint
ALTER TABLE "analytics_sessions" ADD COLUMN "region_name" varchar(120);
--> statement-breakpoint
ALTER TABLE "analytics_sessions" ADD COLUMN "city_name" varchar(120);
--> statement-breakpoint
ALTER TABLE "analytics_sessions" ADD COLUMN "last_section_key" varchar(100);
--> statement-breakpoint
ALTER TABLE "analytics_sessions" ADD COLUMN "last_event_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "analytics_sessions" ADD COLUMN "ended_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "analytics_sessions" ADD COLUMN "duration_seconds" integer;
--> statement-breakpoint
ALTER TABLE "analytics_sessions" ADD COLUMN "consent_version" varchar(20) DEFAULT 'v1' NOT NULL;
--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN "sequence" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
CREATE INDEX "analytics_sessions_device_created_at_idx" ON "analytics_sessions" ("device_category", "created_at");
--> statement-breakpoint
CREATE INDEX "analytics_sessions_city_created_at_idx" ON "analytics_sessions" ("city_name", "created_at");
--> statement-breakpoint
CREATE INDEX "analytics_events_session_sequence_idx" ON "analytics_events" ("session_id", "sequence");
--> statement-breakpoint
CREATE TABLE "analytics_daily_metrics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "report_date" date NOT NULL,
  "device_category" varchar(20) DEFAULT 'unknown' NOT NULL,
  "city_name" varchar(120) DEFAULT 'Tidak diketahui' NOT NULL,
  "source_name" varchar(120) DEFAULT 'Langsung' NOT NULL,
  "sessions" integer DEFAULT 0 NOT NULL,
  "form_submits" integer DEFAULT 0 NOT NULL,
  "cta_clicks" integer DEFAULT 0 NOT NULL,
  "whatsapp_clicks" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "analytics_daily_metrics_dimensions_unique" UNIQUE("report_date", "device_category", "city_name", "source_name")
);
--> statement-breakpoint
CREATE INDEX "analytics_daily_metrics_date_idx" ON "analytics_daily_metrics" ("report_date");
