ALTER TABLE "transaction_financial_entries" ADD COLUMN "operation_key" uuid;--> statement-breakpoint
ALTER TABLE "transaction_financial_entries" ADD COLUMN "request_fingerprint" varchar(64);--> statement-breakpoint
ALTER TABLE "transaction_financial_entries" ADD CONSTRAINT "transaction_financial_entries_operation_key_unique" UNIQUE("operation_key");