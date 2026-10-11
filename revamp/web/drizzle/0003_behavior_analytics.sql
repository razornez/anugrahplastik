CREATE TABLE "analytics_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "anonymous_id" varchar(72) NOT NULL,
  "landing_path" varchar(500) NOT NULL,
  "referrer" varchar(1000),
  "attribution" jsonb,
  "consented_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "analytics_sessions_anonymous_id_unique" UNIQUE("anonymous_id")
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL,
  "name" varchar(80) NOT NULL,
  "path" varchar(500) NOT NULL,
  "section_key" varchar(100),
  "element_key" varchar(160),
  "metadata" jsonb,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_session_id_analytics_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."analytics_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "analytics_sessions_created_at_idx" ON "analytics_sessions" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "analytics_events_occurred_at_idx" ON "analytics_events" USING btree ("occurred_at");
--> statement-breakpoint
CREATE INDEX "analytics_events_name_occurred_at_idx" ON "analytics_events" USING btree ("name","occurred_at");
--> statement-breakpoint
CREATE INDEX "analytics_events_section_occurred_at_idx" ON "analytics_events" USING btree ("section_key","occurred_at");
