import { desc, eq } from "drizzle-orm";
import { getDatabase } from "@/lib/database/client";
import { contentBlocks, contentRevisions, users } from "@/lib/database/schema";
import {
  defaultLandingContent,
  LANDING_CONTENT_KEY,
  landingContentSchema,
  normalizeLandingContentCopy,
  upgradeLandingContent,
  type LandingContent,
} from "./landing-content";

function parseLandingContent(value: unknown): LandingContent {
  const parsed = landingContentSchema.safeParse(upgradeLandingContent(value));
  return parsed.success ? normalizeLandingContentCopy(parsed.data) : defaultLandingContent;
}

export async function getPublishedLandingContent(): Promise<LandingContent> {
  const database = getDatabase();
  if (!database) return defaultLandingContent;

  const [record] = await database
    .select({ publishedContent: contentBlocks.publishedContent, legacyContent: contentBlocks.content })
    .from(contentBlocks)
    .where(eq(contentBlocks.key, LANDING_CONTENT_KEY));

  return parseLandingContent(record?.publishedContent ?? record?.legacyContent);
}

export async function getLandingPublishedAt(): Promise<Date> {
  const database = getDatabase();
  if (!database) return new Date("2026-01-01T00:00:00.000Z");
  const [record] = await database
    .select({ publishedAt: contentBlocks.publishedAt, updatedAt: contentBlocks.updatedAt })
    .from(contentBlocks)
    .where(eq(contentBlocks.key, LANDING_CONTENT_KEY));
  return record?.publishedAt ?? record?.updatedAt ?? new Date("2026-01-01T00:00:00.000Z");
}

export async function getDraftLandingContent(): Promise<LandingContent> {
  const database = getDatabase();
  if (!database) return defaultLandingContent;

  const [record] = await database
    .select({
      draftContent: contentBlocks.draftContent,
      publishedContent: contentBlocks.publishedContent,
      legacyContent: contentBlocks.content,
    })
    .from(contentBlocks)
    .where(eq(contentBlocks.key, LANDING_CONTENT_KEY));

  return parseLandingContent(record?.draftContent ?? record?.publishedContent ?? record?.legacyContent);
}

export async function getLandingEditorialRecord() {
  const database = getDatabase();
  if (!database) {
    return {
      content: defaultLandingContent,
      version: 0,
      updatedAt: null,
      publishedAt: null,
      hasUnpublishedDraft: false,
      revisions: [],
    };
  }
  const [block] = await database.select().from(contentBlocks).where(eq(contentBlocks.key, LANDING_CONTENT_KEY));
  if (!block)
    return {
      content: defaultLandingContent,
      version: 0,
      updatedAt: null,
      publishedAt: null,
      hasUnpublishedDraft: false,
      revisions: [],
    };
  const revisions = await database
    .select({
      id: contentRevisions.id,
      version: contentRevisions.version,
      action: contentRevisions.action,
      createdAt: contentRevisions.createdAt,
      actorName: users.name,
    })
    .from(contentRevisions)
    .leftJoin(users, eq(contentRevisions.actorId, users.id))
    .where(eq(contentRevisions.contentBlockId, block.id))
    .orderBy(desc(contentRevisions.version))
    .limit(12);
  return {
    content: parseLandingContent(block.draftContent ?? block.publishedContent ?? block.content),
    version: block.version,
    updatedAt: block.updatedAt,
    publishedAt: block.publishedAt,
    hasUnpublishedDraft: JSON.stringify(block.draftContent) !== JSON.stringify(block.publishedContent),
    revisions,
  };
}
