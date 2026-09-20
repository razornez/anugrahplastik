import { cacheLife, cacheTag } from "next/cache";
import { eq } from "drizzle-orm";
import { getDatabase } from "@/lib/database/client";
import { contentBlocks } from "@/lib/database/schema";
import {
  defaultLandingContent,
  LANDING_CONTENT_KEY,
  landingContentSchema,
  type LandingContent,
} from "./landing-content";

export async function getPublishedLandingContent(): Promise<LandingContent> {
  "use cache";
  cacheLife("days");
  cacheTag("landing.page");

  const database = getDatabase();
  if (!database) return defaultLandingContent;

  const [record] = await database
    .select({ publishedContent: contentBlocks.publishedContent, legacyContent: contentBlocks.content })
    .from(contentBlocks)
    .where(eq(contentBlocks.key, LANDING_CONTENT_KEY));

  const parsed = landingContentSchema.safeParse(record?.publishedContent ?? record?.legacyContent);
  return parsed.success ? parsed.data : defaultLandingContent;
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

  const parsed = landingContentSchema.safeParse(
    record?.draftContent ?? record?.publishedContent ?? record?.legacyContent,
  );
  return parsed.success ? parsed.data : defaultLandingContent;
}
