export const campaignAttributionKeys = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "gbraid",
  "wbraid",
] as const;

export type CampaignAttributionKey = (typeof campaignAttributionKeys)[number];
export type CampaignAttribution = Partial<Record<CampaignAttributionKey, string>>;

const paidGoogleMediums = new Set(["cpc", "paid", "paid_search", "display", "demand_gen"]);

export function campaignLeadSource(attribution: CampaignAttribution | undefined) {
  const source = attribution?.utm_source?.trim().toLowerCase();
  const medium = attribution?.utm_medium?.trim().toLowerCase();
  if (source === "google" && medium && paidGoogleMediums.has(medium)) return "google / cpc";
  if (attribution?.gclid || attribution?.gbraid || attribution?.wbraid) return "google / cpc";
  return "website";
}
