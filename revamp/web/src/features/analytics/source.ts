import type { CampaignAttribution } from "@/features/leads/attribution";

export function trafficSource(referrer: string | null, attribution: CampaignAttribution = {}) {
  const campaignSource = attribution.utm_source?.trim().toLowerCase();
  const campaignMedium = attribution.utm_medium?.trim().toLowerCase();
  if (attribution.gclid || attribution.gbraid || attribution.wbraid) return "Google Ads";
  if (
    campaignSource === "google" &&
    ["cpc", "paid", "paid_search", "display", "demand_gen"].includes(campaignMedium ?? "")
  )
    return "Google Ads";
  if (campaignSource) return campaignSource === "google" ? "Google" : campaignSource.slice(0, 120);
  if (!referrer) return "Langsung";

  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "");
    if (host === "anugrahplastik.com" || host === "localhost" || host === "127.0.0.1") return "Langsung";
    if (host === "google.com" || host.endsWith(".google.com") || host.startsWith("google.")) return "Google";
    if (host === "instagram.com" || host.endsWith(".instagram.com")) return "Instagram";
    if (host === "facebook.com" || host.endsWith(".facebook.com")) return "Facebook";
    return host;
  } catch {
    return "Langsung";
  }
}
