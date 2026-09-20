import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/lib/database/client";
import { contentBlocks } from "@/lib/database/schema";
import { defaultLandingContent, LANDING_CONTENT_KEY, type LandingContent } from "./landing-content";

function isLandingContent(value: unknown): value is LandingContent {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<LandingContent>;
  return Boolean(candidate.metadata?.title && candidate.metadata?.description && candidate.bindings);
}

export async function getPublishedLandingContent(): Promise<LandingContent> {
  const database = getDatabase();

  if (!database) return defaultLandingContent;

  const [record] = await database
    .select({ content: contentBlocks.content })
    .from(contentBlocks)
    .where(and(eq(contentBlocks.key, LANDING_CONTENT_KEY), eq(contentBlocks.status, "published")));

  return isLandingContent(record?.content) ? record.content : defaultLandingContent;
}
