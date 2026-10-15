ALTER TABLE "business_transactions" ADD COLUMN "archived_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "business_transactions" ADD COLUMN "archived_by" uuid;
--> statement-breakpoint
ALTER TABLE "production_batches" ADD COLUMN "transaction_line_id" uuid;
--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "planned_ship_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "business_transactions" ADD CONSTRAINT "business_transactions_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_transaction_line_id_transaction_lines_id_fk" FOREIGN KEY ("transaction_line_id") REFERENCES "public"."transaction_lines"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "production_batches_transaction_line_idx" ON "production_batches" USING btree ("transaction_id", "transaction_line_id");
--> statement-breakpoint
CREATE INDEX "business_transactions_archived_updated_idx" ON "business_transactions" USING btree ("archived_at", "updated_at");
--> statement-breakpoint
UPDATE "production_batches" AS batch SET "transaction_line_id" = lines."id"
FROM (
  SELECT "transaction_id", min("id"::text)::uuid AS "id"
  FROM "transaction_lines"
  GROUP BY "transaction_id"
  HAVING count(*) = 1
) AS lines
WHERE batch."transaction_id" = lines."transaction_id" AND batch."transaction_line_id" IS NULL;
