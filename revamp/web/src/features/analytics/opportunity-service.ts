import { inArray } from "drizzle-orm";
import { getDatabase } from "@/lib/database/client";
import { growthOpportunityReviews } from "@/lib/database/schema";
import { getLatestMarketSignal } from "./market-signals";
import { getDiscoveryBudget, getLatestSearchDiscovery } from "./search-discovery";
import { getLatestSeoAudit } from "./seo-audit-service";
import { buildSearchOpportunities, type SearchOpportunity, type OpportunityStatus } from "./search-opportunities";

export async function getSearchOpportunities() {
  const [seo, market, searchDiscovery, budget] = await Promise.all([
    getLatestSeoAudit(),
    getLatestMarketSignal(),
    getLatestSearchDiscovery(),
    getDiscoveryBudget(),
  ]);
  const items = buildSearchOpportunities(seo.audit, market.signal, searchDiscovery.discovery);
  const database = getDatabase();
  if (database && items.length) {
    try {
      const reviews = await database
        .select()
        .from(growthOpportunityReviews)
        .where(
          inArray(
            growthOpportunityReviews.key,
            items.map((item) => item.key),
          ),
        );
      const status = new Map(reviews.map((item) => [item.key, item.status as OpportunityStatus]));
      for (const item of items) item.status = status.get(item.key) ?? "new";
    } catch {
      // The read-only report remains available before the additive migration is applied.
    }
  }
  return { items: items as SearchOpportunity[], seo, market, searchDiscovery, budget };
}
