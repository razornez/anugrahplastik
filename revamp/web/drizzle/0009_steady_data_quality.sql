ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "data_class" varchar(16) DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "business_transactions" ADD COLUMN IF NOT EXISTS "data_class" varchar(16) DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "analytics_sessions" ADD COLUMN IF NOT EXISTS "session_key" varchar(72);
--> statement-breakpoint
UPDATE "analytics_sessions" SET "session_key" = "anonymous_id" WHERE "session_key" IS NULL;
--> statement-breakpoint
ALTER TABLE "analytics_sessions" ALTER COLUMN "session_key" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "analytics_sessions" ADD COLUMN IF NOT EXISTS "traffic_class" varchar(16) DEFAULT 'public' NOT NULL;
--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN IF NOT EXISTS "conversion_id" varchar(72);
--> statement-breakpoint
ALTER TABLE "analytics_sessions" DROP CONSTRAINT IF EXISTS "analytics_sessions_anonymous_id_unique";
--> statement-breakpoint
ALTER TABLE "analytics_sessions" DROP CONSTRAINT IF EXISTS "analytics_sessions_anonymous_id_key";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "analytics_sessions_session_key_unique" ON "analytics_sessions" ("session_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_sessions_traffic_created_idx" ON "analytics_sessions" ("traffic_class", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "analytics_events_conversion_unique" ON "analytics_events" ("conversion_id") WHERE "conversion_id" IS NOT NULL;
--> statement-breakpoint
UPDATE "analytics_sessions" SET "traffic_class" = 'internal'
WHERE "referrer" ILIKE '%127.0.0.1%' OR "referrer" ILIKE '%localhost%';
--> statement-breakpoint
UPDATE "business_transactions" SET "data_class" = 'test'
WHERE lower("title") IN ('tessss', 'test') OR lower("title") LIKE 'test %';
