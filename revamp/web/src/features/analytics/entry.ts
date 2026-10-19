import { campaignAttributionKeys, type CampaignAttribution } from "@/features/leads/attribution";

export type LandingVariant = "control" | "proof";
export type AnalyticsEntry = {
  sessionKey: string;
  landingPath: string;
  referrer: string | null;
  attribution: CampaignAttribution;
  landingVariant: LandingVariant;
  entryAnchor: string | null;
};

/** Only campaign identifiers are retained; arbitrary query text is never copied into analytics. */
export function campaignAttribution(search: string): CampaignAttribution {
  const query = new URLSearchParams(search);
  const result: CampaignAttribution = {};
  for (const key of campaignAttributionKeys) {
    const value = query.get(key)?.trim();
    if (value && value.length <= 512) result[key] = value;
  }
  return result;
}

export function externalReferrer(value: string, pageUrl: URL): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.host === pageUrl.host) return null;
    return `${parsed.origin}${parsed.pathname}`.slice(0, 1000);
  } catch {
    return null;
  }
}

export function firstTouchEntry(
  sessionKey: string,
  pageUrl: URL,
  documentReferrer: string,
  existing?: AnalyticsEntry | null,
): AnalyticsEntry {
  if (existing?.sessionKey === sessionKey) return existing;
  return {
    sessionKey,
    landingPath: pageUrl.pathname.slice(0, 500),
    referrer: externalReferrer(documentReferrer, pageUrl),
    attribution: campaignAttribution(pageUrl.search),
    landingVariant: pageUrl.searchParams.get("ap_variant") === "proof" ? "proof" : "control",
    entryAnchor: pageUrl.hash ? pageUrl.hash.slice(1, 161) : null,
  };
}
