ALTER TABLE "cs_email_outbox" ALTER COLUMN "to_address" SET DATA TYPE varchar(5500);--> statement-breakpoint
CREATE INDEX "cs_email_outbox_draft_revision_idx" ON "cs_email_outbox" USING btree ("draft_id","draft_revision");--> statement-breakpoint
CREATE INDEX "cs_emails_message_id_idx" ON "cs_emails" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "cs_emails_thread_key_idx" ON "cs_emails" USING btree ("thread_key");