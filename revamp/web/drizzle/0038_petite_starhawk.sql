CREATE TABLE "finance_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"bank_name" varchar(120) NOT NULL,
	"account_no_masked" varchar(48) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reconciled_at" timestamp with time zone,
	"reconciled_balance" numeric(16, 2),
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(48) NOT NULL,
	"name" varchar(120) NOT NULL,
	"direction" varchar(12) NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_categories_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "finance_employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"position" varchar(120),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"category_id" uuid,
	"transaction_id" uuid,
	"invoice_id" uuid,
	"supplier_id" uuid,
	"employee_id" uuid,
	"transfer_group_id" uuid,
	"kind" varchar(32) NOT NULL,
	"direction" varchar(12) NOT NULL,
	"amount" numeric(16, 2) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"reference" varchar(160),
	"counterparty_name" varchar(180),
	"notes" text,
	"reversal_of_id" uuid,
	"created_by" uuid,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"reconciled_at" timestamp with time zone,
	"reconciled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_entry_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"storage_path" varchar(500) NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"mime_type" varchar(120) NOT NULL,
	"byte_size" integer NOT NULL,
	"checksum" varchar(128) NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_payroll_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payroll_run_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"base_pay" numeric(16, 2) DEFAULT '0' NOT NULL,
	"overtime_pay" numeric(16, 2) DEFAULT '0' NOT NULL,
	"allowance" numeric(16, 2) DEFAULT '0' NOT NULL,
	"deduction" numeric(16, 2) DEFAULT '0' NOT NULL,
	"net_pay" numeric(16, 2) NOT NULL,
	"entry_id" uuid,
	CONSTRAINT "finance_payroll_employee_unique" UNIQUE("payroll_run_id","employee_id")
);
--> statement-breakpoint
CREATE TABLE "finance_payroll_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_by" uuid,
	CONSTRAINT "finance_payroll_period_unique" UNIQUE("period_start","period_end")
);
--> statement-breakpoint
ALTER TABLE "finance_accounts" ADD CONSTRAINT "finance_accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_account_id_finance_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."finance_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_category_id_finance_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."finance_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_transaction_id_business_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."business_transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_invoice_id_transaction_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."transaction_invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_employee_id_finance_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."finance_employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_reversal_of_id_finance_entries_id_fk" FOREIGN KEY ("reversal_of_id") REFERENCES "public"."finance_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_reconciled_by_users_id_fk" FOREIGN KEY ("reconciled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entry_documents" ADD CONSTRAINT "finance_entry_documents_entry_id_finance_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."finance_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entry_documents" ADD CONSTRAINT "finance_entry_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_payroll_items" ADD CONSTRAINT "finance_payroll_items_payroll_run_id_finance_payroll_runs_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."finance_payroll_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_payroll_items" ADD CONSTRAINT "finance_payroll_items_employee_id_finance_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."finance_employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_payroll_items" ADD CONSTRAINT "finance_payroll_items_entry_id_finance_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."finance_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_payroll_runs" ADD CONSTRAINT "finance_payroll_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_payroll_runs" ADD CONSTRAINT "finance_payroll_runs_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finance_accounts_status_idx" ON "finance_accounts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "finance_categories_direction_active_idx" ON "finance_categories" USING btree ("direction","is_active");--> statement-breakpoint
CREATE INDEX "finance_employees_status_name_idx" ON "finance_employees" USING btree ("status","name");--> statement-breakpoint
CREATE INDEX "finance_entries_account_occurred_idx" ON "finance_entries" USING btree ("account_id","occurred_at");--> statement-breakpoint
CREATE INDEX "finance_entries_status_occurred_idx" ON "finance_entries" USING btree ("status","occurred_at");--> statement-breakpoint
CREATE INDEX "finance_entries_transaction_idx" ON "finance_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "finance_entries_supplier_idx" ON "finance_entries" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "finance_entry_documents_entry_idx" ON "finance_entry_documents" USING btree ("entry_id");--> statement-breakpoint
