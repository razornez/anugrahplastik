CREATE TABLE "finance_qa_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cleaned_at" timestamp with time zone,
	CONSTRAINT "finance_qa_runs_label_unique" UNIQUE("label")
);
--> statement-breakpoint
ALTER TABLE "finance_accounts" ADD COLUMN "qa_run_id" uuid;--> statement-breakpoint
ALTER TABLE "finance_employees" ADD COLUMN "qa_run_id" uuid;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD COLUMN "qa_run_id" uuid;--> statement-breakpoint
ALTER TABLE "finance_payroll_runs" ADD COLUMN "qa_run_id" uuid;--> statement-breakpoint
ALTER TABLE "finance_accounts" ADD CONSTRAINT "finance_accounts_qa_run_id_finance_qa_runs_id_fk" FOREIGN KEY ("qa_run_id") REFERENCES "public"."finance_qa_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_employees" ADD CONSTRAINT "finance_employees_qa_run_id_finance_qa_runs_id_fk" FOREIGN KEY ("qa_run_id") REFERENCES "public"."finance_qa_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_qa_run_id_finance_qa_runs_id_fk" FOREIGN KEY ("qa_run_id") REFERENCES "public"."finance_qa_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_payroll_runs" ADD CONSTRAINT "finance_payroll_runs_qa_run_id_finance_qa_runs_id_fk" FOREIGN KEY ("qa_run_id") REFERENCES "public"."finance_qa_runs"("id") ON DELETE cascade ON UPDATE no action;