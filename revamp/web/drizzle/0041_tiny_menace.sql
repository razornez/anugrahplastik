ALTER TABLE "media_assets" ADD COLUMN "storage_path" varchar(500);--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "preview_path" varchar(500);--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "byte_size" integer;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "preview_byte_size" integer;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "sha256" varchar(64);--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "width" integer;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "height" integer;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "scope" varchar(32) DEFAULT 'landing' NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "uploaded_by" uuid;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
