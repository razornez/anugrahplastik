import { boolean, date, index, integer, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

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
    anonymousId: varchar("anonymous_id", { length: 72 }).notNull().unique(),
    landingPath: varchar("landing_path", { length: 500 }).notNull(),
    referrer: varchar("referrer", { length: 1000 }),
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
    consentVersion: varchar("consent_version", { length: 20 }).notNull().default("v1"),
    consentedAt: timestamp("consented_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("analytics_sessions_created_at_idx").on(table.createdAt),
    index("analytics_sessions_device_created_at_idx").on(table.deviceCategory, table.createdAt),
    index("analytics_sessions_city_created_at_idx").on(table.cityName, table.createdAt),
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
