CREATE TABLE "cs_email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to_address" varchar(255) NOT NULL,
	"subject" varchar(998) NOT NULL,
	"body_ciphertext" text NOT NULL,
	"idempotency_key" varchar(80) NOT NULL,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"message_id" varchar(500),
	"in_reply_to" varchar(500),
	"linked_email_id" uuid,
	"linked_lead_id" uuid,
	"linked_transaction_id" uuid,
	"sent_by" uuid,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cs_email_outbox_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "cs_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folder" varchar(16) NOT NULL,
	"uid_validity" varchar(40) NOT NULL,
	"uid" integer NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"message_id" varchar(500),
	"in_reply_to" varchar(500),
	"from_name" varchar(255),
	"from_address" varchar(255),
	"to_address" varchar(1000),
	"subject" varchar(998) DEFAULT '(tanpa subjek)' NOT NULL,
	"preview" varchar(500),
	"received_at" timestamp with time zone,
	"linked_lead_id" uuid,
	"linked_transaction_id" uuid,
	"sync_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cs_emails_folder_uid_unique" UNIQUE("folder","uid_validity","uid")
);
--> statement-breakpoint
CREATE TABLE "google_ads_daily_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_date" date NOT NULL,
	"campaign_id" varchar(40) NOT NULL,
	"campaign_name" varchar(255) NOT NULL,
	"status" varchar(40) NOT NULL,
	"currency_code" varchar(3) DEFAULT 'IDR' NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"cost_micros" varchar(40) DEFAULT '0' NOT NULL,
	"conversions" varchar(40) DEFAULT '0' NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_ads_campaign_day_unique" UNIQUE("report_date","campaign_id")
);
--> statement-breakpoint
CREATE TABLE "integration_oauth_states" (
	"state_hash" varchar(64) PRIMARY KEY NOT NULL,
	"actor_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"key" varchar(40) PRIMARY KEY NOT NULL,
	"status" varchar(24) DEFAULT 'disconnected' NOT NULL,
	"secret_ciphertext" text,
	"metadata" jsonb,
	"last_sync_at" timestamp with time zone,
	"last_error" varchar(500),
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "email" varchar(255);--> statement-breakpoint
ALTER TABLE "cs_email_outbox" ADD CONSTRAINT "cs_email_outbox_linked_email_id_cs_emails_id_fk" FOREIGN KEY ("linked_email_id") REFERENCES "public"."cs_emails"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cs_email_outbox" ADD CONSTRAINT "cs_email_outbox_linked_lead_id_leads_id_fk" FOREIGN KEY ("linked_lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cs_email_outbox" ADD CONSTRAINT "cs_email_outbox_linked_transaction_id_business_transactions_id_fk" FOREIGN KEY ("linked_transaction_id") REFERENCES "public"."business_transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cs_email_outbox" ADD CONSTRAINT "cs_email_outbox_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cs_emails" ADD CONSTRAINT "cs_emails_linked_lead_id_leads_id_fk" FOREIGN KEY ("linked_lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cs_emails" ADD CONSTRAINT "cs_emails_linked_transaction_id_business_transactions_id_fk" FOREIGN KEY ("linked_transaction_id") REFERENCES "public"."business_transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_oauth_states" ADD CONSTRAINT "integration_oauth_states_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cs_email_outbox_sent_at_idx" ON "cs_email_outbox" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "cs_email_outbox_to_address_idx" ON "cs_email_outbox" USING btree ("to_address");--> statement-breakpoint
CREATE INDEX "cs_email_outbox_subject_idx" ON "cs_email_outbox" USING btree ("subject");--> statement-breakpoint
CREATE INDEX "cs_emails_folder_received_idx" ON "cs_emails" USING btree ("folder","received_at");--> statement-breakpoint
CREATE INDEX "cs_emails_from_address_idx" ON "cs_emails" USING btree ("from_address");--> statement-breakpoint
CREATE INDEX "cs_emails_subject_idx" ON "cs_emails" USING btree ("subject");--> statement-breakpoint
CREATE INDEX "cs_emails_linked_lead_idx" ON "cs_emails" USING btree ("linked_lead_id");--> statement-breakpoint
CREATE INDEX "cs_emails_linked_transaction_idx" ON "cs_emails" USING btree ("linked_transaction_id");--> statement-breakpoint
CREATE INDEX "google_ads_report_date_idx" ON "google_ads_daily_reports" USING btree ("report_date");--> statement-breakpoint
CREATE INDEX "leads_email_idx" ON "leads" USING btree ("email");