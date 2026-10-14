CREATE TABLE "document_template_catalogs" (
  "kind" varchar(24) PRIMARY KEY NOT NULL,
  "active_version_id" uuid,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_template_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "kind" varchar(24) NOT NULL,
  "version" integer NOT NULL,
  "config" jsonb NOT NULL,
  "compiled_checksum" varchar(64) NOT NULL,
  "provider_template_id" varchar(160),
  "status" varchar(24) DEFAULT 'publishing' NOT NULL,
  "failure_code" varchar(80),
  "restored_from_id" uuid,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "activated_at" timestamp with time zone,
  CONSTRAINT "document_template_kind_version_unique" UNIQUE("kind","version")
);
--> statement-breakpoint
ALTER TABLE "document_template_versions" ADD CONSTRAINT "document_template_versions_kind_catalog_kind_fk" FOREIGN KEY ("kind") REFERENCES "public"."document_template_catalogs"("kind") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "document_template_versions" ADD CONSTRAINT "document_template_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "document_template_versions" ADD CONSTRAINT "document_template_versions_restored_from_version_fk" FOREIGN KEY ("restored_from_id") REFERENCES "public"."document_template_versions"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "document_template_catalogs" ADD CONSTRAINT "document_template_catalogs_active_version_fk" FOREIGN KEY ("active_version_id") REFERENCES "public"."document_template_versions"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX "document_template_kind_status_idx" ON "document_template_versions" USING btree ("kind","status","created_at");
--> statement-breakpoint
INSERT INTO "document_template_catalogs" ("kind") VALUES ('quotation'), ('invoice'), ('delivery'), ('handover') ON CONFLICT DO NOTHING;
