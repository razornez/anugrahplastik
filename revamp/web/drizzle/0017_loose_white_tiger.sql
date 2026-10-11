ALTER TABLE "transaction_documents" ADD COLUMN "operation_key" uuid;--> statement-breakpoint
ALTER TABLE "transaction_documents" ADD COLUMN "payload" jsonb;--> statement-breakpoint
ALTER TABLE "transaction_documents" ADD CONSTRAINT "transaction_documents_operation_key_unique" UNIQUE("operation_key");
