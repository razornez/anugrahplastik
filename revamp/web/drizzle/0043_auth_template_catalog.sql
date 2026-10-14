ALTER TABLE "users" ADD COLUMN "username" varchar(24);
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN "temporary_pin" boolean DEFAULT false NOT NULL;
ALTER TABLE "users" ADD COLUMN "pin_changed_at" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN "failed_login_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "users" ADD COLUMN "failed_login_window_started_at" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN "locked_until" timestamp with time zone;

WITH cleaned AS (
  SELECT
    id,
    coalesce(nullif(trim(both '.' from regexp_replace(regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9.]+', '.', 'g'), '\.{2,}', '.', 'g')), ''), 'user') AS raw_base
  FROM users
), normalized AS (
  SELECT id, left(CASE WHEN length(raw_base) < 3 THEN raw_base || repeat('0', 3 - length(raw_base)) ELSE raw_base END, 20) AS base
  FROM cleaned
), ranked AS (
  SELECT id, base, row_number() over (partition by base order by id) AS occurrence
  FROM normalized
)
UPDATE users
SET username = CASE
  WHEN ranked.occurrence = 1 THEN ranked.base
  ELSE left(ranked.base, greatest(3, 23 - length(ranked.occurrence::text))) || '.' || ranked.occurrence::text
END
FROM ranked
WHERE users.id = ranked.id;

ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;
ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE("username");

INSERT INTO "audit_logs" ("action", "entity_type", "entity_id", "metadata")
SELECT 'auth.cutover_notice_required', 'user', "id", '{"source":"pin_cutover"}'::jsonb
FROM "users"
WHERE "is_active" = true;

ALTER TABLE "sessions" ADD COLUMN "absolute_expires_at" timestamp with time zone;
ALTER TABLE "sessions" ADD COLUMN "last_active_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "sessions" ADD COLUMN "remembered" boolean DEFAULT false NOT NULL;
ALTER TABLE "sessions" ADD COLUMN "device_label" varchar(160);
ALTER TABLE "sessions" ADD COLUMN "location_label" varchar(120);
ALTER TABLE "sessions" ADD COLUMN "ip_hash" varchar(64);
UPDATE "sessions" SET "absolute_expires_at" = "expires_at" WHERE "absolute_expires_at" IS NULL;
ALTER TABLE "sessions" ALTER COLUMN "absolute_expires_at" SET NOT NULL;

CREATE TABLE "auth_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "purpose" varchar(24) NOT NULL,
  "token_hash" varchar(64) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "auth_tokens_token_hash_unique" UNIQUE("token_hash")
);
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
CREATE INDEX "auth_tokens_user_purpose_idx" ON "auth_tokens" USING btree ("user_id","purpose","created_at");

CREATE TABLE "auth_rate_limits" (
  "key_hash" varchar(64) PRIMARY KEY NOT NULL,
  "user_id" uuid,
  "attempts" integer DEFAULT 0 NOT NULL,
  "window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "locked_until" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "auth_rate_limits" ADD CONSTRAINT "auth_rate_limits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
CREATE INDEX "auth_rate_limits_user_idx" ON "auth_rate_limits" USING btree ("user_id");

CREATE TABLE "email_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "template_key" varchar(32) NOT NULL,
  "name" varchar(120) NOT NULL,
  "language" varchar(10) DEFAULT 'id' NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "is_archived" boolean DEFAULT false NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "email_templates_key_language_name_unique" UNIQUE("template_key","language","name")
);
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null;
CREATE INDEX "email_templates_key_language_idx" ON "email_templates" USING btree ("template_key","language","is_archived");
CREATE UNIQUE INDEX "email_templates_one_default_idx" ON "email_templates" ("template_key","language") WHERE "is_default" = true AND "is_archived" = false;

INSERT INTO "email_templates" ("template_key", "name", "language", "is_default")
SELECT DISTINCT "template_key",
  CASE "template_key"
    WHEN 'layout' THEN 'Tata letak utama'
    WHEN 'new' THEN 'Pesan baru utama'
    WHEN 'reply' THEN 'Balasan utama'
    WHEN 'quotation' THEN 'Penawaran utama'
    WHEN 'invoice' THEN 'Invoice utama'
    WHEN 'delivery' THEN 'Surat jalan utama'
    ELSE initcap("template_key") || ' utama'
  END,
  'id', true
FROM "email_template_versions";

INSERT INTO "email_templates" ("template_key", "name", "language", "is_default")
SELECT seed.template_key, seed.name, 'id', true
FROM (VALUES
  ('layout', 'Tata letak utama'),
  ('new', 'Pesan baru utama'),
  ('reply', 'Balasan utama'),
  ('quotation', 'Penawaran utama'),
  ('invoice', 'Invoice utama'),
  ('delivery', 'Surat jalan utama'),
  ('handover', 'STB utama')
) AS seed(template_key, name)
WHERE NOT EXISTS (SELECT 1 FROM "email_templates" current WHERE current.template_key = seed.template_key AND current.language = 'id');

ALTER TABLE "email_template_versions" ADD COLUMN "template_id" uuid;
UPDATE "email_template_versions" versions
SET "template_id" = templates.id
FROM "email_templates" templates
WHERE templates.template_key = versions.template_key AND templates.language = 'id' AND templates.is_default = true;
ALTER TABLE "email_template_versions" ALTER COLUMN "template_id" SET NOT NULL;
ALTER TABLE "email_template_versions" ADD CONSTRAINT "email_template_versions_template_id_email_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."email_templates"("id") ON DELETE cascade;
ALTER TABLE "email_template_versions" DROP CONSTRAINT IF EXISTS "email_template_key_version_unique";
ALTER TABLE "email_template_versions" ADD CONSTRAINT "email_template_id_version_unique" UNIQUE("template_id","version");

INSERT INTO "email_template_versions" ("template_id", "template_key", "version", "subject", "content")
SELECT templates.id,
  templates.template_key,
  1,
  CASE templates.template_key
    WHEN 'layout' THEN 'Tata letak Anugrah Plastik'
    WHEN 'new' THEN ''
    WHEN 'reply' THEN 'Re: {{originalSubject}}'
    ELSE '{{documentName}} · {{transactionNo}}'
  END,
  CASE templates.template_key
    WHEN 'layout' THEN '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"{{message}}"}]},{"type":"paragraph","content":[{"type":"text","text":"Terima kasih telah menghubungi Anugrah Plastik."}]}]}'::jsonb
    WHEN 'new' THEN '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Halo,"}]},{"type":"paragraph","content":[{"type":"text","text":"Tulis pesan di sini."}]},{"type":"paragraph","content":[{"type":"text","text":"Salam,\n{{senderName}}"}]}]}'::jsonb
    WHEN 'reply' THEN '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Halo,"}]},{"type":"paragraph","content":[{"type":"text","text":"Terima kasih telah menghubungi kami."}]},{"type":"paragraph","content":[{"type":"text","text":"Salam,\n{{senderName}}"}]}]}'::jsonb
    ELSE '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Yth. {{customerName}},"}]},{"type":"paragraph","content":[{"type":"text","text":"Terlampir {{documentName}} untuk pekerjaan {{transactionNo}}."}]},{"type":"paragraph","content":[{"type":"text","text":"Salam,\n{{senderName}}"}]}]}'::jsonb
  END
FROM "email_templates" templates
WHERE NOT EXISTS (
  SELECT 1 FROM "email_template_versions" versions WHERE versions.template_id = templates.id
);

CREATE TABLE "email_template_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "template_id" uuid NOT NULL,
  "storage_path" varchar(500) NOT NULL,
  "filename" varchar(180) NOT NULL,
  "mime_type" varchar(160) NOT NULL,
  "size" integer NOT NULL,
  "sha256" varchar(64) NOT NULL,
  "scan_status" varchar(24) DEFAULT 'pending' NOT NULL,
  "scan_detail" varchar(120),
  "uploaded_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "email_template_attachments" ADD CONSTRAINT "email_template_attachments_template_id_email_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."email_templates"("id") ON DELETE cascade;
ALTER TABLE "email_template_attachments" ADD CONSTRAINT "email_template_attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null;
CREATE INDEX "email_template_attachments_template_idx" ON "email_template_attachments" USING btree ("template_id","created_at");
