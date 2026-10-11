ALTER TABLE "content_blocks" ADD COLUMN "draft_content" jsonb;
--> statement-breakpoint
ALTER TABLE "content_blocks" ADD COLUMN "published_content" jsonb;
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "revoked_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "content_blocks"
SET "published_content" = "content"
WHERE "status" = 'published' AND "published_content" IS NULL;
--> statement-breakpoint
CREATE INDEX "content_blocks_status_key_idx" ON "content_blocks" ("status", "key");
