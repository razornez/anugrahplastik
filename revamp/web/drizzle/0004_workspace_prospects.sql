ALTER TABLE "users" ADD COLUMN "pin_hash" varchar(255);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "assigned_user_id" uuid REFERENCES "users"("id") ON DELETE set null;
--> statement-breakpoint
CREATE TABLE "lead_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" uuid NOT NULL REFERENCES "leads"("id") ON DELETE cascade,
  "author_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "lead_notes_lead_created_at_idx" ON "lead_notes" ("lead_id", "created_at");
--> statement-breakpoint
CREATE TABLE "audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "action" varchar(100) NOT NULL,
  "entity_type" varchar(60) NOT NULL,
  "entity_id" varchar(100),
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" ("created_at");
--> statement-breakpoint
CREATE INDEX "audit_logs_entity_created_at_idx" ON "audit_logs" ("entity_type", "entity_id", "created_at");
