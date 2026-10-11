CREATE TABLE "growth_search_discoveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_key" varchar(10) NOT NULL,
	"status" varchar(16) NOT NULL,
	"checked_at" timestamp with time zone,
	"results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" varchar(300),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "growth_search_discoveries_week_key_unique" UNIQUE("week_key")
);
