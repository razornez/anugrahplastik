CREATE TABLE "growth_business_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stable_id" varchar(250),
	"name" varchar(120) NOT NULL,
	"category" varchar(120),
	"address" varchar(500),
	"phone" varchar(32),
	"website" varchar(1000),
	"maps_url" varchar(1000) NOT NULL,
	"status" varchar(16) DEFAULT 'new' NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"lead_id" uuid,
	"updated_by" uuid,
	CONSTRAINT "growth_business_candidates_stable_id_unique" UNIQUE("stable_id"),
	CONSTRAINT "growth_business_candidates_lead_id_unique" UNIQUE("lead_id")
);
--> statement-breakpoint
CREATE TABLE "growth_business_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"search_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "growth_business_matches_unique" UNIQUE("search_id","candidate_id")
);
--> statement-breakpoint
CREATE TABLE "growth_business_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_key" varchar(180) NOT NULL,
	"phrase" varchar(120) NOT NULL,
	"city_id" varchar(32) NOT NULL,
	"month_key" varchar(7) NOT NULL,
	"status" varchar(16) NOT NULL,
	"checked_at" timestamp with time zone,
	"result_count" integer DEFAULT 0 NOT NULL,
	"error" varchar(300),
	"created_by" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "growth_business_candidates" ADD CONSTRAINT "growth_business_candidates_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_business_candidates" ADD CONSTRAINT "growth_business_candidates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_business_matches" ADD CONSTRAINT "growth_business_matches_search_id_growth_business_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."growth_business_searches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_business_matches" ADD CONSTRAINT "growth_business_matches_candidate_id_growth_business_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."growth_business_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_business_searches" ADD CONSTRAINT "growth_business_searches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "growth_business_searches_query_idx" ON "growth_business_searches" USING btree ("query_key","started_at");--> statement-breakpoint
CREATE INDEX "growth_business_searches_month_idx" ON "growth_business_searches" USING btree ("month_key");