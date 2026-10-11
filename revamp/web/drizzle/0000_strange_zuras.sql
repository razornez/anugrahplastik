CREATE TABLE "content_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(100) NOT NULL,
	"content" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_blocks_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"phone" varchar(32) NOT NULL,
	"message" text NOT NULL,
	"status" varchar(32) DEFAULT 'new' NOT NULL,
	"source" varchar(64) DEFAULT 'website' NOT NULL,
	"landing_path" varchar(500),
	"referrer" varchar(1000),
	"attribution" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(160) NOT NULL,
	"title" varchar(180) NOT NULL,
	"category" varchar(100) NOT NULL,
	"material" varchar(100),
	"image_path" varchar(500) NOT NULL,
	"alt_text" varchar(180) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_published" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portfolio_items_slug_unique" UNIQUE("slug")
);
