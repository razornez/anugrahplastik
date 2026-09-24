import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  pinHash: varchar("pin_hash", { length: 255 }),
  role: varchar("role", { length: 20 }).notNull().default("content"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const contentBlocks = pgTable("content_blocks", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  content: jsonb("content").notNull(),
  draftContent: jsonb("draft_content"),
  publishedContent: jsonb("published_content"),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  version: integer("version").notNull().default(1),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const contentRevisions = pgTable("content_revisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  contentBlockId: uuid("content_block_id")
    .notNull()
    .references(() => contentBlocks.id, { onDelete: "cascade" }),
  content: jsonb("content").notNull(),
  version: integer("version").notNull(),
  action: varchar("action", { length: 20 }).notNull(),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const mediaAssets = pgTable("media_assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  path: varchar("path", { length: 500 }).notNull().unique(),
  altText: varchar("alt_text", { length: 220 }).notNull(),
  caption: text("caption"),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const portfolioItems = pgTable("portfolio_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: varchar("slug", { length: 160 }).notNull().unique(),
  title: varchar("title", { length: 180 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  material: varchar("material", { length: 100 }),
  imagePath: varchar("image_path", { length: 500 }).notNull(),
  altText: varchar("alt_text", { length: 180 }).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  isPublished: boolean("is_published").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const leads = pgTable("leads", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  message: text("message").notNull(),
  status: varchar("status", { length: 32 }).default("new").notNull(),
  source: varchar("source", { length: 64 }).default("website").notNull(),
  dataClass: varchar("data_class", { length: 16 }).default("production").notNull(),
  landingPath: varchar("landing_path", { length: 500 }),
  referrer: varchar("referrer", { length: 1000 }),
  attribution: jsonb("attribution"),
  assignedUserId: uuid("assigned_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const leadNotes = pgTable(
  "lead_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("lead_notes_lead_created_at_idx").on(table.leadId, table.createdAt)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 100 }).notNull(),
    entityType: varchar("entity_type", { length: 60 }).notNull(),
    entityId: varchar("entity_id", { length: 100 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_logs_created_at_idx").on(table.createdAt),
    index("audit_logs_entity_created_at_idx").on(table.entityType, table.entityId, table.createdAt),
  ],
);

export const analyticsSessions = pgTable(
  "analytics_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Stable opaque visitor key. It never contains customer identity. */
    anonymousId: varchar("anonymous_id", { length: 72 }).notNull(),
    /** Per-tab/session key; a visitor can have several sessions. */
    sessionKey: varchar("session_key", { length: 72 }).notNull().unique(),
    trafficClass: varchar("traffic_class", { length: 16 }).notNull().default("public"),
    landingPath: varchar("landing_path", { length: 500 }).notNull(),
    referrer: varchar("referrer", { length: 1000 }),
    sourceName: varchar("source_name", { length: 120 }).notNull().default("Langsung"),
    outcome: varchar("outcome", { length: 40 }).notNull().default("Melihat halaman"),
    attribution: jsonb("attribution"),
    deviceCategory: varchar("device_category", { length: 20 }).notNull().default("unknown"),
    browserName: varchar("browser_name", { length: 80 }),
    operatingSystem: varchar("operating_system", { length: 80 }),
    countryName: varchar("country_name", { length: 100 }),
    regionName: varchar("region_name", { length: 120 }),
    cityName: varchar("city_name", { length: 120 }),
    lastSectionKey: varchar("last_section_key", { length: 100 }),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds"),
    eventSequence: integer("event_sequence").notNull().default(0),
    consentVersion: varchar("consent_version", { length: 20 }).notNull().default("v1"),
    consentedAt: timestamp("consented_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("analytics_sessions_created_at_idx").on(table.createdAt),
    index("analytics_sessions_device_created_at_idx").on(table.deviceCategory, table.createdAt),
    index("analytics_sessions_city_created_at_idx").on(table.cityName, table.createdAt),
    index("analytics_sessions_source_created_at_idx").on(table.sourceName, table.createdAt),
    index("analytics_sessions_outcome_created_at_idx").on(table.outcome, table.createdAt),
  ],
);

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => analyticsSessions.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    path: varchar("path", { length: 500 }).notNull(),
    sectionKey: varchar("section_key", { length: 100 }),
    elementKey: varchar("element_key", { length: 160 }),
    metadata: jsonb("metadata"),
    conversionId: varchar("conversion_id", { length: 72 }),
    sequence: integer("sequence").notNull().default(1),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("analytics_events_occurred_at_idx").on(table.occurredAt),
    index("analytics_events_name_occurred_at_idx").on(table.name, table.occurredAt),
    index("analytics_events_section_occurred_at_idx").on(table.sectionKey, table.occurredAt),
    index("analytics_events_session_sequence_idx").on(table.sessionId, table.sequence),
  ],
);

export const analyticsDailyMetrics = pgTable(
  "analytics_daily_metrics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reportDate: date("report_date").notNull(),
    deviceCategory: varchar("device_category", { length: 20 }).notNull().default("unknown"),
    cityName: varchar("city_name", { length: 120 }).notNull().default("Tidak diketahui"),
    sourceName: varchar("source_name", { length: 120 }).notNull().default("Langsung"),
    sessions: integer("sessions").notNull().default(0),
    formSubmits: integer("form_submits").notNull().default(0),
    ctaClicks: integer("cta_clicks").notNull().default(0),
    whatsappClicks: integer("whatsapp_clicks").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("analytics_daily_metrics_date_idx").on(table.reportDate)],
);

/**
 * The public website only appends compact batches here. A dedicated worker
 * expands them into the reporting tables, so visitor traffic cannot compete
 * with lead forms or the operational workspace for request time.
 */
export const analyticsIngestBatches = pgTable(
  "analytics_ingest_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    anonymousId: varchar("anonymous_id", { length: 72 }).notNull(),
    payload: jsonb("payload").notNull(),
    eventCount: integer("event_count").notNull(),
    priority: integer("priority").notNull().default(0),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    lastError: text("last_error"),
  },
  (table) => [
    index("analytics_ingest_batches_status_received_idx").on(table.status, table.receivedAt),
    index("analytics_ingest_batches_anonymous_received_idx").on(table.anonymousId, table.receivedAt),
  ],
);

export const analyticsWorkerState = pgTable("analytics_worker_state", {
  name: varchar("name", { length: 60 }).primaryKey(),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }).notNull().defaultNow(),
  processedBatches: integer("processed_batches").notNull().default(0),
  processedEvents: integer("processed_events").notNull().default(0),
  failedBatches: integer("failed_batches").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 32 }).notNull().unique(),
    kind: varchar("kind", { length: 20 }).notNull().default("business"),
    legalName: varchar("legal_name", { length: 180 }).notNull(),
    displayName: varchar("display_name", { length: 180 }).notNull(),
    taxId: varchar("tax_id", { length: 32 }),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 32 }),
    billingAddress: text("billing_address"),
    deliveryAddress: text("delivery_address"),
    notes: text("notes"),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("customers_status_display_name_idx").on(table.status, table.displayName)],
);

export const customerContacts = pgTable(
  "customer_contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    position: varchar("position", { length: 100 }),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 32 }),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("customer_contacts_customer_idx").on(table.customerId)],
);

export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 32 }).notNull().unique(),
    name: varchar("name", { length: 180 }).notNull(),
    contactName: varchar("contact_name", { length: 120 }),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 32 }),
    address: text("address"),
    notes: text("notes"),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("suppliers_status_name_idx").on(table.status, table.name)],
);

export const materials = pgTable(
  "materials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 32 }).notNull().unique(),
    name: varchar("name", { length: 160 }).notNull(),
    polymerFamily: varchar("polymer_family", { length: 100 }).notNull(),
    grade: varchar("grade", { length: 120 }),
    density: numeric("density", { precision: 7, scale: 3 }),
    unit: varchar("unit", { length: 16 }).notNull().default("kg"),
    notes: text("notes"),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("materials_status_name_idx").on(table.status, table.name)],
);

export const materialSuppliers = pgTable(
  "material_suppliers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    supplierSku: varchar("supplier_sku", { length: 100 }),
    referencePrice: numeric("reference_price", { precision: 16, scale: 2 }),
    leadTimeDays: integer("lead_time_days"),
    isPreferred: boolean("is_preferred").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("material_suppliers_material_supplier_unique").on(table.materialId, table.supplierId),
    index("material_suppliers_supplier_idx").on(table.supplierId),
  ],
);

export const materialColorLots = pgTable(
  "material_color_lots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    colorName: varchar("color_name", { length: 100 }).notNull(),
    colorCode: varchar("color_code", { length: 32 }),
    lotNumber: varchar("lot_number", { length: 100 }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("material_color_lots_material_idx").on(table.materialId)],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sku: varchar("sku", { length: 64 }).notNull().unique(),
    name: varchar("name", { length: 180 }).notNull(),
    specification: text("specification"),
    defaultMaterialId: uuid("default_material_id").references(() => materials.id, { onDelete: "set null" }),
    unitWeightGrams: numeric("unit_weight_grams", { precision: 12, scale: 3 }),
    unit: varchar("unit", { length: 16 }).notNull().default("pcs"),
    photoAssetId: uuid("photo_asset_id").references(() => mediaAssets.id, { onDelete: "set null" }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("products_status_name_idx").on(table.status, table.name)],
);

export const moulds = pgTable(
  "moulds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 64 }).notNull().unique(),
    name: varchar("name", { length: 180 }).notNull(),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    cavityCount: integer("cavity_count"),
    constructionMaterial: varchar("construction_material", { length: 120 }),
    status: varchar("status", { length: 24 }).notNull().default("planned"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("moulds_product_status_idx").on(table.productId, table.status)],
);

export const businessTransactions = pgTable(
  "business_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    referenceNo: varchar("reference_no", { length: 32 }).notNull().unique(),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    title: varchar("title", { length: 220 }).notNull(),
    dataClass: varchar("data_class", { length: 16 }).notNull().default("production"),
    commercialStatus: varchar("commercial_status", { length: 32 }).notNull().default("quotation"),
    paymentStatus: varchar("payment_status", { length: 32 }).notNull().default("awaiting_invoice"),
    fulfilmentStatus: varchar("fulfilment_status", { length: 32 }).notNull().default("not_released"),
    holdReason: text("hold_reason"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    quotedAt: timestamp("quoted_at", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("business_transactions_customer_created_idx").on(table.customerId, table.createdAt),
    index("business_transactions_status_updated_idx").on(table.commercialStatus, table.updatedAt),
  ],
);

export const transactionNumberCounters = pgTable("transaction_number_counters", {
  referenceYear: integer("reference_year").primaryKey(),
  lastValue: integer("last_value").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const masterNumberCounters = pgTable("master_number_counters", {
  kind: varchar("kind", { length: 24 }).primaryKey(),
  lastValue: integer("last_value").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const transactionLines = pgTable(
  "transaction_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => businessTransactions.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    materialId: uuid("material_id").references(() => materials.id, { onDelete: "set null" }),
    colorLotId: uuid("color_lot_id").references(() => materialColorLots.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 16, scale: 3 }).notNull(),
    unit: varchar("unit", { length: 16 }).notNull().default("pcs"),
    unitPrice: numeric("unit_price", { precision: 16, scale: 2 }).notNull().default("0"),
    taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [index("transaction_lines_transaction_idx").on(table.transactionId)],
);

export const transactionInvoices = pgTable(
  "transaction_invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => businessTransactions.id, { onDelete: "cascade" }),
    invoiceNo: varchar("invoice_no", { length: 80 }).notNull().unique(),
    kind: varchar("kind", { length: 24 }).notNull(),
    amount: numeric("amount", { precision: 16, scale: 2 }).notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    status: varchar("status", { length: 24 }).notNull().default("draft"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("transaction_invoices_transaction_status_idx").on(table.transactionId, table.status)],
);

export const transactionDocuments = pgTable(
  "transaction_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => businessTransactions.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id").references(() => transactionInvoices.id, { onDelete: "set null" }),
    type: varchar("type", { length: 36 }).notNull(),
    direction: varchar("direction", { length: 16 }).notNull().default("internal"),
    documentNo: varchar("document_no", { length: 100 }),
    version: integer("version").notNull().default(1),
    status: varchar("status", { length: 24 }).notNull().default("draft"),
    templateId: varchar("template_id", { length: 120 }),
    providerDocumentId: varchar("provider_document_id", { length: 120 }),
    storagePath: varchar("storage_path", { length: 500 }),
    originalName: varchar("original_name", { length: 255 }),
    checksum: varchar("checksum", { length: 128 }),
    sentMessageId: varchar("sent_message_id", { length: 255 }),
    recipient: varchar("recipient", { length: 255 }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("transaction_documents_transaction_type_idx").on(table.transactionId, table.type)],
);

export const transactionFinancialEntries = pgTable(
  "transaction_financial_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => businessTransactions.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id").references(() => transactionInvoices.id, { onDelete: "set null" }),
    kind: varchar("kind", { length: 32 }).notNull(),
    direction: varchar("direction", { length: 12 }).notNull(),
    amount: numeric("amount", { precision: 16, scale: 2 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("unverified"),
    proofDocumentId: uuid("proof_document_id").references(() => transactionDocuments.id, { onDelete: "set null" }),
    reference: varchar("reference", { length: 160 }),
    notes: text("notes"),
    verifiedBy: uuid("verified_by").references(() => users.id, { onDelete: "set null" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("transaction_financial_entries_transaction_status_idx").on(table.transactionId, table.status)],
);

export const productionBatches = pgTable(
  "production_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => businessTransactions.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    materialId: uuid("material_id").references(() => materials.id, { onDelete: "set null" }),
    colorLotId: uuid("color_lot_id").references(() => materialColorLots.id, { onDelete: "set null" }),
    mouldId: uuid("mould_id").references(() => moulds.id, { onDelete: "set null" }),
    batchNo: varchar("batch_no", { length: 80 }).notNull().unique(),
    kind: varchar("kind", { length: 24 }).notNull().default("production"),
    status: varchar("status", { length: 32 }).notNull().default("planned"),
    plannedQuantity: numeric("planned_quantity", { precision: 16, scale: 3 }),
    completedQuantity: numeric("completed_quantity", { precision: 16, scale: 3 }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("production_batches_transaction_status_idx").on(table.transactionId, table.status)],
);

export const shipments = pgTable(
  "shipments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => businessTransactions.id, { onDelete: "cascade" }),
    shipmentNo: varchar("shipment_no", { length: 80 }).notNull().unique(),
    status: varchar("status", { length: 24 }).notNull().default("planned"),
    recipientName: varchar("recipient_name", { length: 160 }),
    deliveryAddress: text("delivery_address"),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    deliveryDocumentId: uuid("delivery_document_id").references(() => transactionDocuments.id, {
      onDelete: "set null",
    }),
    bastDocumentId: uuid("bast_document_id").references(() => transactionDocuments.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("shipments_transaction_status_idx").on(table.transactionId, table.status)],
);

export const shipmentLines = pgTable(
  "shipment_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shipmentId: uuid("shipment_id")
      .notNull()
      .references(() => shipments.id, { onDelete: "cascade" }),
    transactionLineId: uuid("transaction_line_id")
      .notNull()
      .references(() => transactionLines.id, { onDelete: "restrict" }),
    quantity: numeric("quantity", { precision: 16, scale: 3 }).notNull(),
  },
  (table) => [index("shipment_lines_shipment_idx").on(table.shipmentId)],
);

export const productDesignFiles = pgTable(
  "product_design_files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    mouldId: uuid("mould_id").references(() => moulds.id, { onDelete: "set null" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    transactionId: uuid("transaction_id").references(() => businessTransactions.id, { onDelete: "set null" }),
    origin: varchar("origin", { length: 24 }).notNull(),
    fileKind: varchar("file_kind", { length: 24 }).notNull(),
    format: varchar("format", { length: 12 }).notNull(),
    storagePath: varchar("storage_path", { length: 500 }).notNull().unique(),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 120 }).notNull(),
    byteSize: integer("byte_size").notNull(),
    checksum: varchar("checksum", { length: 128 }).notNull(),
    version: integer("version").notNull().default(1),
    reuseApprovedAt: timestamp("reuse_approved_at", { withTimezone: true }),
    reuseApprovedBy: uuid("reuse_approved_by").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("product_design_files_product_created_idx").on(table.productId, table.createdAt),
    index("product_design_files_customer_created_idx").on(table.customerId, table.createdAt),
  ],
);
