CREATE TABLE "cs_email_draft_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"filename" varchar(180) NOT NULL,
	"content_type" varchar(40) NOT NULL,
	"size" integer NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"content_ciphertext" text NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cs_email_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"payload_ciphertext" text NOT NULL,
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cs_email_outbox" ADD COLUMN "draft_id" uuid;--> statement-breakpoint
ALTER TABLE "cs_email_outbox" ADD COLUMN "draft_revision" integer;--> statement-breakpoint
ALTER TABLE "cs_email_outbox" ADD COLUMN "snapshot_ciphertext" text;--> statement-breakpoint
ALTER TABLE "cs_email_outbox" ADD COLUMN "result_ciphertext" text;--> statement-breakpoint
ALTER TABLE "cs_email_outbox" ADD COLUMN "prepared_by" uuid;--> statement-breakpoint
ALTER TABLE "cs_email_outbox" ADD COLUMN "prepared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cs_email_outbox" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cs_emails" ADD COLUMN "references" text;--> statement-breakpoint
ALTER TABLE "cs_emails" ADD COLUMN "reply_to_address" varchar(1000);--> statement-breakpoint
ALTER TABLE "cs_emails" ADD COLUMN "cc_address" varchar(1000);--> statement-breakpoint
ALTER TABLE "cs_emails" ADD COLUMN "thread_key" varchar(500);--> statement-breakpoint
ALTER TABLE "cs_email_draft_files" ADD CONSTRAINT "cs_email_draft_files_draft_id_cs_email_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."cs_email_drafts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cs_email_drafts" ADD CONSTRAINT "cs_email_drafts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cs_email_draft_files_draft_idx" ON "cs_email_draft_files" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "cs_email_drafts_owner_updated_idx" ON "cs_email_drafts" USING btree ("owner_id","updated_at");--> statement-breakpoint
ALTER TABLE "cs_email_outbox" ADD CONSTRAINT "cs_email_outbox_prepared_by_users_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;