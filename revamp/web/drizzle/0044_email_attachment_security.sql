ALTER TABLE "cs_email_draft_files" ADD COLUMN "scan_status" varchar(24) DEFAULT 'pending' NOT NULL;
ALTER TABLE "cs_email_draft_files" ADD COLUMN "scan_detail" varchar(160);
ALTER TABLE "cs_email_draft_files" ADD COLUMN "scanned_at" timestamp with time zone;

CREATE TABLE "private_download_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token_hash" varchar(64) NOT NULL,
  "document_id" uuid NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "download_count" integer DEFAULT 0 NOT NULL,
  "last_downloaded_at" timestamp with time zone,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "private_download_tokens_token_hash_unique" UNIQUE("token_hash")
);
ALTER TABLE "private_download_tokens" ADD CONSTRAINT "private_download_tokens_document_id_transaction_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."transaction_documents"("id") ON DELETE cascade;
ALTER TABLE "private_download_tokens" ADD CONSTRAINT "private_download_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null;
CREATE INDEX "private_download_tokens_document_idx" ON "private_download_tokens" USING btree ("document_id","created_at");
