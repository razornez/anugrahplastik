CREATE TABLE "transaction_file_cleanup_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "storage_path" varchar(500) NOT NULL UNIQUE,
  "transaction_reference" varchar(32) NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'pending',
  "attempts" integer NOT NULL DEFAULT 0,
  "last_error" varchar(300),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "transaction_file_cleanup_status_idx" ON "transaction_file_cleanup_jobs" USING btree ("status", "created_at");
