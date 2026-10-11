ALTER TABLE "product_design_files" ADD COLUMN "thumbnail_storage_path" varchar(500);--> statement-breakpoint
ALTER TABLE "product_design_files" ADD COLUMN "thumbnail_checksum" varchar(128);--> statement-breakpoint
ALTER TABLE "product_design_files" ADD COLUMN "thumbnail_byte_size" integer;--> statement-breakpoint
ALTER TABLE "product_design_files" ADD COLUMN "thumbnail_created_at" timestamp with time zone;