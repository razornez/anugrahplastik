CREATE TABLE "integration_sync_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "trigger" varchar(16) NOT NULL,
  "status" varchar(16) NOT NULL,
  "mail_status" varchar(24) DEFAULT 'skipped' NOT NULL,
  "mail_count" integer DEFAULT 0 NOT NULL,
  "mail_error_code" varchar(64),
  "ads_status" varchar(24) DEFAULT 'skipped' NOT NULL,
  "ads_count" integer DEFAULT 0 NOT NULL,
  "ads_error_code" varchar(64),
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "integration_sync_runs_started_at_idx" ON "integration_sync_runs" USING btree ("started_at");
