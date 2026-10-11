import { desc, eq } from "drizzle-orm";
import { getDatabase } from "@/lib/database/client";
import { growthCompetitorSettings, growthSearchAudits } from "@/lib/database/schema";
import {
  defaultCompetitors,
  isAuditStale,
  type Competitor,
  type SearchAudit,
  type SearchAuditResult,
} from "./competitor-model";

export async function getCompetitorVisibility() {
  const database = getDatabase();
  if (!database)
    return {
      available: false,
      competitors: [...defaultCompetitors] as Competitor[],
      audit: null as SearchAudit | null,
      stale: false,
    };
  const [settings, audits] = await Promise.all([
    database
      .select({ competitors: growthCompetitorSettings.competitors })
      .from(growthCompetitorSettings)
      .where(eq(growthCompetitorSettings.id, 1)),
    database
      .select()
      .from(growthSearchAudits)
      .orderBy(desc(growthSearchAudits.checkedAt), desc(growthSearchAudits.createdAt))
      .limit(1),
  ]);
  const competitors = (settings[0]?.competitors as Competitor[] | undefined) ?? [...defaultCompetitors];
  const latest = audits[0];
  const audit: SearchAudit | null = latest
    ? {
        id: latest.id,
        checkedAt: latest.checkedAt,
        location: latest.location,
        device: latest.device,
        competitors: latest.competitors as Competitor[],
        results: latest.results as SearchAuditResult[],
      }
    : null;
  return {
    available: true,
    competitors,
    audit,
    stale: isAuditStale(audit),
  };
}
