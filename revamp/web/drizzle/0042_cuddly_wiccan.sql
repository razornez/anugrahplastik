ALTER TABLE "product_design_files" ADD COLUMN "derived_preview_storage_path" varchar(500);--> statement-breakpoint
ALTER TABLE "product_design_files" ADD COLUMN "derived_preview_checksum" varchar(128);--> statement-breakpoint
ALTER TABLE "product_design_files" ADD COLUMN "derived_preview_byte_size" integer;--> statement-breakpoint
ALTER TABLE "product_design_files" ADD COLUMN "derived_preview_source_checksum" varchar(128);--> statement-breakpoint
ALTER TABLE "product_design_files" ADD COLUMN "derived_preview_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "product_design_files" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;