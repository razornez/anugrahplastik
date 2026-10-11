ALTER TABLE "product_design_files" ADD COLUMN "material_id" uuid;--> statement-breakpoint
ALTER TABLE "product_design_files" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "product_design_files" ADD CONSTRAINT "product_design_files_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_design_files_material_created_idx" ON "product_design_files" USING btree ("material_id","created_at");