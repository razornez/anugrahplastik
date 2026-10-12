CREATE TABLE "remote_desktop_launch_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "remote_desktop_launch_tickets_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "remote_desktop_launch_tickets" ADD CONSTRAINT "remote_desktop_launch_tickets_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "remote_desktop_launch_tickets_actor_created_idx" ON "remote_desktop_launch_tickets" USING btree ("actor_id","created_at");
--> statement-breakpoint
CREATE INDEX "remote_desktop_launch_tickets_expires_idx" ON "remote_desktop_launch_tickets" USING btree ("expires_at");
