import { boolean, integer, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
