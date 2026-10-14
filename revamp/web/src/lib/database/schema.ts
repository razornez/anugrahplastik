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
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: varchar("username", { length: 24 }).notNull().unique(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }),
  pinHash: varchar("pin_hash", { length: 255 }),
  temporaryPin: boolean("temporary_pin").notNull().default(false),
  pinChangedAt: timestamp("pin_changed_at", { withTimezone: true }),
  failedLoginCount: integer("failed_login_count").notNull().default(0),
  failedLoginWindowStartedAt: timestamp("failed_login_window_started_at", { withTimezone: true }),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
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
  absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).defaultNow().notNull(),
  remembered: boolean("remembered").notNull().default(false),
  deviceLabel: varchar("device_label", { length: 160 }),
  locationLabel: varchar("location_label", { length: 120 }),
  ipHash: varchar("ip_hash", { length: 64 }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: varchar("purpose", { length: 24 }).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("auth_tokens_user_purpose_idx").on(table.userId, table.purpose, table.createdAt)],
);

export const authRateLimits = pgTable(
  "auth_rate_limits",
  {
    keyHash: varchar("key_hash", { length: 64 }).primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    attempts: integer("attempts").notNull().default(0),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).defaultNow().notNull(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("auth_rate_limits_user_idx").on(table.userId)],
);

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
  storagePath: varchar("storage_path", { length: 500 }),
  previewPath: varchar("preview_path", { length: 500 }),
  altText: varchar("alt_text", { length: 220 }).notNull(),
  caption: text("caption"),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  byteSize: integer("byte_size"),
  previewByteSize: integer("preview_byte_size"),
  sha256: varchar("sha256", { length: 64 }),
  width: integer("width"),
  height: integer("height"),
  scope: varchar("scope", { length: 32 }).notNull().default("landing"),
  uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
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

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    phone: varchar("phone", { length: 32 }),
    email: varchar("email", { length: 255 }),
    message: text("message").notNull(),
    status: varchar("status", { length: 32 }).default("new").notNull(),
    source: varchar("source", { length: 64 }).default("website").notNull(),
    dataClass: varchar("data_class", { length: 16 }).default("production").notNull(),
    landingPath: varchar("landing_path", { length: 500 }),
    referrer: varchar("referrer", { length: 1000 }),
    attribution: jsonb("attribution"),
    assignedUserId: uuid("assigned_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("leads_email_idx").on(table.email)],
);

export const integrations = pgTable("integrations", {
  key: varchar("key", { length: 40 }).primaryKey(),
  status: varchar("status", { length: 24 }).notNull().default("disconnected"),
  secretCiphertext: text("secret_ciphertext"),
  metadata: jsonb("metadata"),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastError: varchar("last_error", { length: 500 }),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const integrationOauthStates = pgTable("integration_oauth_states", {
  stateHash: varchar("state_hash", { length: 64 }).primaryKey(),
  actorId: uuid("actor_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Private operational history. It stores only safe outcome codes, never provider responses or secrets. */
export const integrationSyncRuns = pgTable(
  "integration_sync_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    trigger: varchar("trigger", { length: 16 }).notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    mailStatus: varchar("mail_status", { length: 24 }).notNull().default("skipped"),
    mailCount: integer("mail_count").notNull().default(0),
    mailErrorCode: varchar("mail_error_code", { length: 64 }),
    adsStatus: varchar("ads_status", { length: 24 }).notNull().default("skipped"),
    adsCount: integer("ads_count").notNull().default(0),
    adsErrorCode: varchar("ads_error_code", { length: 64 }),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [index("integration_sync_runs_started_at_idx").on(table.startedAt)],
);

export const csEmails = pgTable(
  "cs_emails",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    folder: varchar("folder", { length: 16 }).notNull(),
    uidValidity: varchar("uid_validity", { length: 40 }).notNull(),
    uid: integer("uid").notNull(),
    size: integer("size").notNull().default(0),
    messageId: varchar("message_id", { length: 500 }),
    inReplyTo: varchar("in_reply_to", { length: 500 }),
    references: text("references"),
    replyToAddress: varchar("reply_to_address", { length: 1000 }),
    ccAddress: varchar("cc_address", { length: 1000 }),
    threadKey: varchar("thread_key", { length: 500 }),
    fromName: varchar("from_name", { length: 255 }),
    fromAddress: varchar("from_address", { length: 255 }),
    toAddress: varchar("to_address", { length: 1000 }),
    subject: varchar("subject", { length: 998 }).notNull().default("(tanpa subjek)"),
    preview: varchar("preview", { length: 500 }),
    bodyCiphertext: text("body_ciphertext"),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    linkedLeadId: uuid("linked_lead_id").references(() => leads.id, { onDelete: "set null" }),
    linkedTransactionId: uuid("linked_transaction_id").references(() => businessTransactions.id, {
      onDelete: "set null",
    }),
    syncAt: timestamp("sync_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("cs_emails_folder_uid_unique").on(table.folder, table.uidValidity, table.uid),
    index("cs_emails_folder_received_idx").on(table.folder, table.receivedAt),
    index("cs_emails_from_address_idx").on(table.fromAddress),
    index("cs_emails_subject_idx").on(table.subject),
    index("cs_emails_message_id_idx").on(table.messageId),
    index("cs_emails_thread_key_idx").on(table.threadKey),
    index("cs_emails_linked_lead_idx").on(table.linkedLeadId),
    index("cs_emails_linked_transaction_idx").on(table.linkedTransactionId),
  ],
);

export const csEmailOutbox = pgTable(
  "cs_email_outbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    toAddress: varchar("to_address", { length: 5500 }).notNull(),
    subject: varchar("subject", { length: 998 }).notNull(),
    bodyCiphertext: text("body_ciphertext").notNull(),
    htmlCiphertext: text("html_ciphertext"),
    idempotencyKey: varchar("idempotency_key", { length: 80 }).notNull().unique(),
    draftId: uuid("draft_id"),
    draftRevision: integer("draft_revision"),
    snapshotCiphertext: text("snapshot_ciphertext"),
    resultCiphertext: text("result_ciphertext"),
    preparedBy: uuid("prepared_by").references(() => users.id),
    preparedAt: timestamp("prepared_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    messageId: varchar("message_id", { length: 500 }),
    inReplyTo: varchar("in_reply_to", { length: 500 }),
    linkedEmailId: uuid("linked_email_id").references(() => csEmails.id, { onDelete: "set null" }),
    linkedLeadId: uuid("linked_lead_id").references(() => leads.id, { onDelete: "set null" }),
    linkedTransactionId: uuid("linked_transaction_id").references(() => businessTransactions.id, {
      onDelete: "set null",
    }),
    sentBy: uuid("sent_by").references(() => users.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("cs_email_outbox_sent_at_idx").on(table.sentAt),
    index("cs_email_outbox_to_address_idx").on(table.toAddress),
    index("cs_email_outbox_subject_idx").on(table.subject),
    index("cs_email_outbox_draft_revision_idx").on(table.draftId, table.draftRevision),
  ],
);

export const csEmailDrafts = pgTable(
  "cs_email_drafts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    revision: integer("revision").notNull().default(1),
    payloadCiphertext: text("payload_ciphertext").notNull(),
    status: varchar("status", { length: 24 }).notNull().default("draft"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("cs_email_drafts_owner_updated_idx").on(table.ownerId, table.updatedAt)],
);

export const csEmailDraftFiles = pgTable(
  "cs_email_draft_files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => csEmailDrafts.id),
    filename: varchar("filename", { length: 180 }).notNull(),
    contentType: varchar("content_type", { length: 40 }).notNull(),
    size: integer("size").notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    contentCiphertext: text("content_ciphertext").notNull(),
    scanStatus: varchar("scan_status", { length: 24 }).notNull().default("pending"),
    scanDetail: varchar("scan_detail", { length: 160 }),
    scannedAt: timestamp("scanned_at", { withTimezone: true }),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("cs_email_draft_files_draft_idx").on(table.draftId)],
);

export const emailTemplates = pgTable(
  "email_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    templateKey: varchar("template_key", { length: 32 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    language: varchar("language", { length: 10 }).notNull().default("id"),
    isDefault: boolean("is_default").notNull().default(false),
    isArchived: boolean("is_archived").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("email_templates_key_language_name_unique").on(table.templateKey, table.language, table.name),
    index("email_templates_key_language_idx").on(table.templateKey, table.language, table.isArchived),
  ],
);

export const emailTemplateVersions = pgTable(
  "email_template_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => emailTemplates.id, { onDelete: "cascade" }),
    templateKey: varchar("template_key", { length: 32 }).notNull(),
    version: integer("version").notNull(),
    subject: varchar("subject", { length: 998 }).notNull(),
    content: jsonb("content").notNull(),
    shellConfig: jsonb("shell_config"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    restoredFromId: uuid("restored_from_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique("email_template_id_version_unique").on(table.templateId, table.version)],
);

export const documentTemplateCatalogs = pgTable("document_template_catalogs", {
  kind: varchar("kind", { length: 24 }).primaryKey(),
  activeVersionId: uuid("active_version_id").references((): AnyPgColumn => documentTemplateVersions.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const documentTemplateVersions = pgTable(
  "document_template_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: varchar("kind", { length: 24 })
      .notNull()
      .references(() => documentTemplateCatalogs.kind, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    config: jsonb("config").notNull(),
    compiledChecksum: varchar("compiled_checksum", { length: 64 }).notNull(),
    providerTemplateId: varchar("provider_template_id", { length: 160 }),
    status: varchar("status", { length: 24 }).notNull().default("publishing"),
    failureCode: varchar("failure_code", { length: 80 }),
    restoredFromId: uuid("restored_from_id"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
  },
  (table) => [
    unique("document_template_kind_version_unique").on(table.kind, table.version),
    index("document_template_kind_status_idx").on(table.kind, table.status, table.createdAt),
  ],
);

export const emailTemplateAttachments = pgTable(
  "email_template_attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => emailTemplates.id, { onDelete: "cascade" }),
    storagePath: varchar("storage_path", { length: 500 }).notNull(),
    filename: varchar("filename", { length: 180 }).notNull(),
    mimeType: varchar("mime_type", { length: 160 }).notNull(),
    size: integer("size").notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    scanStatus: varchar("scan_status", { length: 24 }).notNull().default("pending"),
    scanDetail: varchar("scan_detail", { length: 120 }),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("email_template_attachments_template_idx").on(table.templateId, table.createdAt)],
);

export const privateDownloadTokens = pgTable(
  "private_download_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => transactionDocuments.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    downloadCount: integer("download_count").notNull().default(0),
    lastDownloadedAt: timestamp("last_downloaded_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("private_download_tokens_document_idx").on(table.documentId, table.createdAt)],
);

export const emailTemplateMedia = pgTable("email_template_media", {
  id: uuid("id").defaultRandom().primaryKey(),
  storagePath: varchar("storage_path", { length: 500 }).notNull(),
  mimeType: varchar("mime_type", { length: 32 }).notNull(),
  size: integer("size").notNull(),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const googleAdsDailyReports = pgTable(
  "google_ads_daily_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reportDate: date("report_date").notNull(),
    campaignId: varchar("campaign_id", { length: 40 }).notNull(),
    campaignName: varchar("campaign_name", { length: 255 }).notNull(),
    status: varchar("status", { length: 40 }).notNull(),
    currencyCode: varchar("currency_code", { length: 3 }).notNull().default("IDR"),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    costMicros: varchar("cost_micros", { length: 40 }).notNull().default("0"),
    conversions: varchar("conversions", { length: 40 }).notNull().default("0"),
    conversionsValue: varchar("conversions_value", { length: 40 }).notNull().default("0"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("google_ads_campaign_day_unique").on(table.reportDate, table.campaignId),
    index("google_ads_report_date_idx").on(table.reportDate),
    index("google_ads_campaign_date_idx").on(table.campaignId, table.reportDate),
  ],
);

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

export const userNotifications = pgTable(
  "user_notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 40 }).notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    body: text("body").notNull(),
    href: varchar("href", { length: 500 }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("user_notifications_user_read_idx").on(table.userId, table.readAt, table.createdAt)],
);

/**
 * A short-lived, one-time authorization for downloading an RDP profile.
 * Only a SHA-256 digest is stored, never the launch token itself.
 */
export const remoteDesktopLaunchTickets = pgTable(
  "remote_desktop_launch_tickets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("remote_desktop_launch_tickets_actor_created_idx").on(table.actorId, table.createdAt),
    index("remote_desktop_launch_tickets_expires_idx").on(table.expiresAt),
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
    formStatus: varchar("form_status", { length: 24 }),
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
    durationQuality: varchar("duration_quality", { length: 24 }).notNull().default("unverified"),
    eventSequence: integer("event_sequence").notNull().default(0),
    consentVersion: varchar("consent_version", { length: 20 }).notNull().default("v1"),
    consentedAt: timestamp("consented_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("analytics_sessions_created_at_idx").on(table.createdAt),
    index("analytics_sessions_anonymous_created_at_idx").on(table.anonymousId, table.createdAt),
    index("analytics_sessions_device_created_at_idx").on(table.deviceCategory, table.createdAt),
    index("analytics_sessions_city_created_at_idx").on(table.cityName, table.createdAt),
    index("analytics_sessions_source_created_at_idx").on(table.sourceName, table.createdAt),
    index("analytics_sessions_outcome_created_at_idx").on(table.outcome, table.createdAt),
  ],
);

export const growthCompetitorSettings = pgTable("growth_competitor_settings", {
  id: integer("id").primaryKey(),
  competitors: jsonb("competitors").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const growthSearchAudits = pgTable(
  "growth_search_audits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
    location: varchar("location", { length: 80 }).notNull(),
    device: varchar("device", { length: 16 }).notNull(),
    competitors: jsonb("competitors").notNull(),
    results: jsonb("results").notNull(),
    evidencePath: varchar("evidence_path", { length: 500 }),
    evidenceChecksum: varchar("evidence_checksum", { length: 64 }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("growth_search_audits_checked_at_idx").on(table.checkedAt)],
);

export const growthSeoAudits = pgTable(
  "growth_seo_audits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    weekKey: varchar("week_key", { length: 10 }).notNull().unique(),
    status: varchar("status", { length: 16 }).notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    competitors: jsonb("competitors").notNull(),
    results: jsonb("results"),
    pages: jsonb("pages"),
    error: varchar("error", { length: 300 }),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("growth_seo_audits_checked_at_idx").on(table.checkedAt)],
);

export const growthSerpUsage = pgTable("growth_serp_usage", {
  monthKey: varchar("month_key", { length: 7 }).primaryKey(),
  used: integer("used").notNull().default(0),
});

export const growthMarketSignals = pgTable("growth_market_signals", {
  id: uuid("id").defaultRandom().primaryKey(),
  weekKey: varchar("week_key", { length: 10 }).notNull().unique(),
  topic: varchar("topic", { length: 100 }).notNull(),
  status: varchar("status", { length: 16 }).notNull(),
  checkedAt: timestamp("checked_at", { withTimezone: true }),
  rising: jsonb("rising"),
  error: varchar("error", { length: 300 }),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
});

export const growthSearchDiscoveries = pgTable("growth_search_discoveries", {
  id: uuid("id").defaultRandom().primaryKey(),
  weekKey: varchar("week_key", { length: 10 }).notNull().unique(),
  status: varchar("status", { length: 16 }).notNull(),
  checkedAt: timestamp("checked_at", { withTimezone: true }),
  results: jsonb("results").notNull().default([]),
  error: varchar("error", { length: 300 }),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
});

export const growthOpportunityReviews = pgTable("growth_opportunity_reviews", {
  key: varchar("key", { length: 64 }).primaryKey(),
  status: varchar("status", { length: 20 }).notNull(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const growthBusinessSearches = pgTable(
  "growth_business_searches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    queryKey: varchar("query_key", { length: 180 }).notNull(),
    phrase: varchar("phrase", { length: 120 }).notNull(),
    cityId: varchar("city_id", { length: 32 }).notNull(),
    monthKey: varchar("month_key", { length: 7 }).notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    resultCount: integer("result_count").notNull().default(0),
    error: varchar("error", { length: 300 }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("growth_business_searches_query_idx").on(table.queryKey, table.startedAt),
    index("growth_business_searches_month_idx").on(table.monthKey),
  ],
);

export const growthBusinessCandidates = pgTable("growth_business_candidates", {
  id: uuid("id").defaultRandom().primaryKey(),
  stableId: varchar("stable_id", { length: 250 }).unique(),
  name: varchar("name", { length: 120 }).notNull(),
  category: varchar("category", { length: 120 }),
  address: varchar("address", { length: 500 }),
  phone: varchar("phone", { length: 32 }),
  website: varchar("website", { length: 1000 }),
  mapsUrl: varchar("maps_url", { length: 1000 }).notNull(),
  status: varchar("status", { length: 16 }).notNull().default("new"),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
  leadId: uuid("lead_id")
    .unique()
    .references(() => leads.id, { onDelete: "set null" }),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
});

export const growthBusinessMatches = pgTable(
  "growth_business_matches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    searchId: uuid("search_id")
      .notNull()
      .references(() => growthBusinessSearches.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => growthBusinessCandidates.id, { onDelete: "cascade" }),
    snapshot: jsonb("snapshot").notNull(),
  },
  (table) => [unique("growth_business_matches_unique").on(table.searchId, table.candidateId)],
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
    quotationNo: varchar("quotation_no", { length: 80 }).unique(),
    quoteLetter: jsonb("quote_letter"),
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

export const invoiceNumberCounters = pgTable("invoice_number_counters", {
  referenceYear: integer("reference_year").primaryKey(),
  lastValue: integer("last_value").notNull(),
  initializedBy: uuid("initialized_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quotationNumberCounters = pgTable("quotation_number_counters", {
  referenceYear: integer("reference_year").primaryKey(),
  lastValue: integer("last_value").notNull(),
  initializedBy: uuid("initialized_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const deliveryNumberCounters = pgTable("delivery_number_counters", {
  referenceYear: integer("reference_year").primaryKey(),
  lastValue: integer("last_value").notNull(),
  initializedBy: uuid("initialized_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const handoverNumberCounters = pgTable("handover_number_counters", {
  referenceYear: integer("reference_year").primaryKey(),
  lastValue: integer("last_value").notNull(),
  initializedBy: uuid("initialized_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invoiceIssuerSettings = pgTable("invoice_issuer_settings", {
  id: integer("id").primaryKey(),
  legalName: varchar("legal_name", { length: 180 }).notNull().default(""),
  address: text("address").notNull().default(""),
  phone: varchar("phone", { length: 60 }).notNull().default(""),
  email: varchar("email", { length: 255 }).notNull().default(""),
  website: varchar("website", { length: 255 }).notNull().default(""),
  taxId: varchar("tax_id", { length: 40 }).notNull().default(""),
  bankName: varchar("bank_name", { length: 100 }).notNull().default(""),
  bankAccountNo: varchar("bank_account_no", { length: 80 }).notNull().default(""),
  bankAccountName: varchar("bank_account_name", { length: 180 }).notNull().default(""),
  logoPath: varchar("logo_path", { length: 255 }).notNull().default(""),
  signerName: varchar("signer_name", { length: 120 }).notNull().default(""),
  signerTitle: varchar("signer_title", { length: 100 }).notNull().default(""),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
    materialLabel: varchar("material_label", { length: 160 }).notNull().default(""),
    mouldingLabel: varchar("moulding_label", { length: 160 }).notNull().default(""),
    quantity: numeric("quantity", { precision: 16, scale: 3 }).notNull(),
    unit: varchar("unit", { length: 16 }).notNull().default("pcs"),
    unitPrice: numeric("unit_price", { precision: 16, scale: 2 }).notNull().default("0"),
    taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
    taxMethod: varchar("tax_method", { length: 24 }).notNull().default("legacy"),
    discountKind: varchar("discount_kind", { length: 12 }).notNull().default("none"),
    discountValue: numeric("discount_value", { precision: 16, scale: 2 }).notNull().default("0"),
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
    shipmentId: uuid("shipment_id").references((): AnyPgColumn => shipments.id, { onDelete: "restrict" }),
    dpApplied: numeric("dp_applied", { precision: 16, scale: 2 }).notNull().default("0"),
    paymentTerms: text("payment_terms"),
    snapshot: jsonb("snapshot"),
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
    operationKey: uuid("operation_key").unique(),
    payload: jsonb("payload"),
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
    operationKey: uuid("operation_key").unique(),
    requestFingerprint: varchar("request_fingerprint", { length: 64 }),
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

/** A local-only QA run marker. It is never created by the production UI. */
export const financeQaRuns = pgTable("finance_qa_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  label: varchar("label", { length: 120 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  cleanedAt: timestamp("cleaned_at", { withTimezone: true }),
});

/**
 * Operational finance is intentionally independent from customer transactions:
 * a bank movement may be a customer payment, a supplier bill, payroll, or an
 * owner's private draw.  Financial accounts only represent bank accounts in
 * the first release; cash and bank connectors can be introduced later.
 */
export const financeAccounts = pgTable(
  "finance_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    bankName: varchar("bank_name", { length: 120 }).notNull(),
    accountNoMasked: varchar("account_no_masked", { length: 48 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow().notNull(),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    reconciledBalance: numeric("reconciled_balance", { precision: 16, scale: 2 }),
    qaRunId: uuid("qa_run_id").references(() => financeQaRuns.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("finance_accounts_status_idx").on(table.status)],
);

export const financeCategories = pgTable(
  "finance_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 48 }).notNull().unique(),
    name: varchar("name", { length: 120 }).notNull(),
    direction: varchar("direction", { length: 12 }).notNull(),
    isSystem: boolean("is_system").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("finance_categories_direction_active_idx").on(table.direction, table.isActive)],
);

export const financeEmployees = pgTable(
  "finance_employees",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    position: varchar("position", { length: 120 }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    qaRunId: uuid("qa_run_id").references(() => financeQaRuns.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("finance_employees_status_name_idx").on(table.status, table.name)],
);

export const financeEntries = pgTable(
  "finance_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => financeAccounts.id, { onDelete: "restrict" }),
    categoryId: uuid("category_id").references(() => financeCategories.id, { onDelete: "restrict" }),
    transactionId: uuid("transaction_id").references(() => businessTransactions.id, { onDelete: "set null" }),
    invoiceId: uuid("invoice_id").references(() => transactionInvoices.id, { onDelete: "set null" }),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    employeeId: uuid("employee_id").references(() => financeEmployees.id, { onDelete: "set null" }),
    transferGroupId: uuid("transfer_group_id"),
    kind: varchar("kind", { length: 32 }).notNull(),
    direction: varchar("direction", { length: 12 }).notNull(),
    amount: numeric("amount", { precision: 16, scale: 2 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    reference: varchar("reference", { length: 160 }),
    counterpartyName: varchar("counterparty_name", { length: 180 }),
    notes: text("notes"),
    reversalOfId: uuid("reversal_of_id").references((): AnyPgColumn => financeEntries.id, { onDelete: "restrict" }),
    qaRunId: uuid("qa_run_id").references(() => financeQaRuns.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    verifiedBy: uuid("verified_by").references(() => users.id, { onDelete: "set null" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    reconciledBy: uuid("reconciled_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("finance_entries_account_occurred_idx").on(table.accountId, table.occurredAt),
    index("finance_entries_status_occurred_idx").on(table.status, table.occurredAt),
    index("finance_entries_transaction_idx").on(table.transactionId),
    index("finance_entries_supplier_idx").on(table.supplierId),
  ],
);

export const financeEntryDocuments = pgTable(
  "finance_entry_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => financeEntries.id, { onDelete: "cascade" }),
    storagePath: varchar("storage_path", { length: 500 }).notNull(),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 120 }).notNull(),
    byteSize: integer("byte_size").notNull(),
    checksum: varchar("checksum", { length: 128 }).notNull(),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("finance_entry_documents_entry_idx").on(table.entryId)],
);

export const financePayrollRuns = pgTable(
  "finance_payroll_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    status: varchar("status", { length: 24 }).notNull().default("draft"),
    notes: text("notes"),
    qaRunId: uuid("qa_run_id").references(() => financeQaRuns.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedBy: uuid("verified_by").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => [unique("finance_payroll_period_unique").on(table.periodStart, table.periodEnd)],
);

export const financePayrollItems = pgTable(
  "finance_payroll_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    payrollRunId: uuid("payroll_run_id")
      .notNull()
      .references(() => financePayrollRuns.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => financeEmployees.id, { onDelete: "restrict" }),
    basePay: numeric("base_pay", { precision: 16, scale: 2 }).notNull().default("0"),
    overtimePay: numeric("overtime_pay", { precision: 16, scale: 2 }).notNull().default("0"),
    allowance: numeric("allowance", { precision: 16, scale: 2 }).notNull().default("0"),
    deduction: numeric("deduction", { precision: 16, scale: 2 }).notNull().default("0"),
    netPay: numeric("net_pay", { precision: 16, scale: 2 }).notNull(),
    entryId: uuid("entry_id").references(() => financeEntries.id, { onDelete: "set null" }),
  },
  (table) => [unique("finance_payroll_employee_unique").on(table.payrollRunId, table.employeeId)],
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
    deliveryNo: varchar("delivery_no", { length: 80 }).unique(),
    handoverNo: varchar("handover_no", { length: 80 }).unique(),
    handoverDetails: jsonb("handover_details"),
    deliveryDetails: jsonb("delivery_details"),
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
    acceptedQuantity: numeric("accepted_quantity", { precision: 16, scale: 3 }),
    logistics: jsonb("logistics"),
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
    materialId: uuid("material_id").references(() => materials.id, { onDelete: "set null" }),
    origin: varchar("origin", { length: 24 }).notNull(),
    fileKind: varchar("file_kind", { length: 24 }).notNull(),
    format: varchar("format", { length: 12 }).notNull(),
    storagePath: varchar("storage_path", { length: 500 }).notNull().unique(),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    description: text("description"),
    thumbnailStoragePath: varchar("thumbnail_storage_path", { length: 500 }),
    thumbnailChecksum: varchar("thumbnail_checksum", { length: 128 }),
    thumbnailByteSize: integer("thumbnail_byte_size"),
    thumbnailCreatedAt: timestamp("thumbnail_created_at", { withTimezone: true }),
    derivedPreviewStoragePath: varchar("derived_preview_storage_path", { length: 500 }),
    derivedPreviewChecksum: varchar("derived_preview_checksum", { length: 128 }),
    derivedPreviewByteSize: integer("derived_preview_byte_size"),
    derivedPreviewSourceChecksum: varchar("derived_preview_source_checksum", { length: 128 }),
    derivedPreviewCreatedAt: timestamp("derived_preview_created_at", { withTimezone: true }),
    mimeType: varchar("mime_type", { length: 120 }).notNull(),
    byteSize: integer("byte_size").notNull(),
    checksum: varchar("checksum", { length: 128 }).notNull(),
    version: integer("version").notNull().default(1),
    reuseApprovedAt: timestamp("reuse_approved_at", { withTimezone: true }),
    reuseApprovedBy: uuid("reuse_approved_by").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("product_design_files_product_created_idx").on(table.productId, table.createdAt),
    index("product_design_files_customer_created_idx").on(table.customerId, table.createdAt),
    index("product_design_files_material_created_idx").on(table.materialId, table.createdAt),
  ],
);
