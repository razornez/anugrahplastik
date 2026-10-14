CREATE TABLE "indonesia_regions" (
	"code" varchar(20) PRIMARY KEY NOT NULL,
	"parent_code" varchar(20),
	"level" varchar(16) NOT NULL,
	"name" varchar(180) NOT NULL,
	"postal_code" varchar(8),
	"source_version" varchar(80) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "region_catalog_metadata" (
	"id" integer PRIMARY KEY NOT NULL,
	"source_repository" varchar(255) NOT NULL,
	"source_commit" varchar(64) NOT NULL,
	"source_updated_at" date,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"kind" varchar(16) NOT NULL,
	"label" varchar(100) NOT NULL,
	"country_code" varchar(2) DEFAULT 'ID' NOT NULL,
	"country_name" varchar(120) DEFAULT 'Indonesia' NOT NULL,
	"address_line" text NOT NULL,
	"province_code" varchar(20),
	"province_name" varchar(180),
	"regency_code" varchar(20),
	"regency_name" varchar(180),
	"district_code" varchar(20),
	"district_name" varchar(180),
	"village_code" varchar(20),
	"village_name" varchar(180),
	"postal_code" varchar(12),
	"is_default" boolean DEFAULT false NOT NULL,
	"is_structured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_addresses_kind_check" CHECK ("kind" IN ('billing', 'delivery')),
	CONSTRAINT "customer_addresses_country_code_check" CHECK ("country_code" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
ALTER TABLE "business_transactions" ADD COLUMN "customer_snapshot" jsonb;
--> statement-breakpoint
ALTER TABLE "customer_contacts" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "indonesia_regions" ADD CONSTRAINT "indonesia_regions_parent_code_indonesia_regions_code_fk" FOREIGN KEY ("parent_code") REFERENCES "public"."indonesia_regions"("code") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "indonesia_regions_parent_name_idx" ON "indonesia_regions" USING btree ("parent_code","name");
--> statement-breakpoint
CREATE INDEX "indonesia_regions_level_name_idx" ON "indonesia_regions" USING btree ("level","name");
--> statement-breakpoint
CREATE INDEX "indonesia_regions_postal_code_idx" ON "indonesia_regions" USING btree ("postal_code");
--> statement-breakpoint
CREATE INDEX "customer_addresses_customer_kind_idx" ON "customer_addresses" USING btree ("customer_id","kind");
--> statement-breakpoint
CREATE INDEX "customer_addresses_country_province_idx" ON "customer_addresses" USING btree ("country_code","province_code");
--> statement-breakpoint
CREATE INDEX "customer_addresses_regency_idx" ON "customer_addresses" USING btree ("regency_code");
--> statement-breakpoint
CREATE INDEX "customer_contacts_customer_primary_idx" ON "customer_contacts" USING btree ("customer_id","is_primary");
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_contacts_one_primary_idx" ON "customer_contacts" ("customer_id") WHERE "is_primary" = true;
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_addresses_one_billing_idx" ON "customer_addresses" ("customer_id") WHERE "kind" = 'billing';
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_addresses_one_default_delivery_idx" ON "customer_addresses" ("customer_id") WHERE "kind" = 'delivery' AND "is_default" = true;
--> statement-breakpoint
INSERT INTO "customer_addresses" ("customer_id", "kind", "label", "country_code", "country_name", "address_line", "is_default", "is_structured")
SELECT "id", 'billing', 'Alamat penagihan lama', 'ZZ', 'Belum ditentukan', "billing_address", true, false
FROM "customers"
WHERE nullif(trim("billing_address"), '') IS NOT NULL;
--> statement-breakpoint
INSERT INTO "customer_addresses" ("customer_id", "kind", "label", "country_code", "country_name", "address_line", "is_default", "is_structured")
SELECT "id", 'delivery', 'Alamat pengiriman lama', 'ZZ', 'Belum ditentukan', "delivery_address", true, false
FROM "customers"
WHERE nullif(trim("delivery_address"), '') IS NOT NULL;
--> statement-breakpoint
UPDATE "business_transactions" AS transaction
SET "customer_snapshot" = jsonb_build_object(
	'version', 1,
	'capturedAt', transaction."created_at",
	'customerId', customer."id",
	'name', customer."display_name",
	'taxId', coalesce(customer."tax_id", ''),
	'contacts', coalesce(
		(SELECT jsonb_agg(jsonb_build_object(
			'id', contact."id", 'name', contact."name", 'position', coalesce(contact."position", ''),
			'email', coalesce(contact."email", ''), 'phone', coalesce(contact."phone", ''),
			'isPrimary', contact."is_primary"
		) ORDER BY contact."is_primary" DESC, contact."created_at")
		FROM "customer_contacts" AS contact WHERE contact."customer_id" = customer."id"),
		CASE WHEN customer."email" IS NOT NULL OR customer."phone" IS NOT NULL THEN
			jsonb_build_array(jsonb_build_object(
				'name', customer."display_name", 'position', 'Kontak utama',
				'email', coalesce(customer."email", ''), 'phone', coalesce(customer."phone", ''), 'isPrimary', true
			))
		ELSE '[]'::jsonb END
	),
	'billingAddress', (
		SELECT jsonb_build_object(
			'id', address."id", 'kind', address."kind", 'label', address."label",
			'countryCode', address."country_code", 'countryName', address."country_name",
			'addressLine', address."address_line", 'provinceCode', coalesce(address."province_code", ''),
			'provinceName', coalesce(address."province_name", ''), 'regencyCode', coalesce(address."regency_code", ''),
			'regencyName', coalesce(address."regency_name", ''), 'districtCode', coalesce(address."district_code", ''),
			'districtName', coalesce(address."district_name", ''), 'villageCode', coalesce(address."village_code", ''),
			'villageName', coalesce(address."village_name", ''), 'postalCode', coalesce(address."postal_code", ''),
			'isDefault', address."is_default", 'isStructured', address."is_structured"
		)
		FROM "customer_addresses" AS address
		WHERE address."customer_id" = customer."id" AND address."kind" = 'billing' LIMIT 1
	),
	'deliveryAddresses', coalesce((
		SELECT jsonb_agg(jsonb_build_object(
			'id', address."id", 'kind', address."kind", 'label', address."label",
			'countryCode', address."country_code", 'countryName', address."country_name",
			'addressLine', address."address_line", 'provinceCode', coalesce(address."province_code", ''),
			'provinceName', coalesce(address."province_name", ''), 'regencyCode', coalesce(address."regency_code", ''),
			'regencyName', coalesce(address."regency_name", ''), 'districtCode', coalesce(address."district_code", ''),
			'districtName', coalesce(address."district_name", ''), 'villageCode', coalesce(address."village_code", ''),
			'villageName', coalesce(address."village_name", ''), 'postalCode', coalesce(address."postal_code", ''),
			'isDefault', address."is_default", 'isStructured', address."is_structured"
		) ORDER BY address."is_default" DESC, address."created_at")
		FROM "customer_addresses" AS address
		WHERE address."customer_id" = customer."id" AND address."kind" = 'delivery'
	), '[]'::jsonb),
	'selectedDeliveryAddressId', (
		SELECT address."id" FROM "customer_addresses" AS address
		WHERE address."customer_id" = customer."id" AND address."kind" = 'delivery'
		ORDER BY address."is_default" DESC, address."created_at" LIMIT 1
	)
)
FROM "customers" AS customer
WHERE customer."id" = transaction."customer_id" AND transaction."customer_snapshot" IS NULL;
