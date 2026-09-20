import { integer, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const contentBlocks = pgTable("content_blocks", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  content: jsonb("content").notNull(),
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
  isPublished: integer("is_published").default(0).notNull(),
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
