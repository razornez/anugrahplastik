CREATE TABLE "user_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "kind" varchar(40) NOT NULL,
  "title" varchar(160) NOT NULL,
  "body" text NOT NULL,
  "href" varchar(500),
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
CREATE INDEX "user_notifications_user_read_idx" ON "user_notifications" USING btree ("user_id","read_at","created_at");
