ALTER TABLE "shipments" ADD COLUMN "operation_key" uuid;
--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_operation_key_unique" UNIQUE("operation_key");
