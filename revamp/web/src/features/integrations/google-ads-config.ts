import "server-only";

export function googleAdsRedirectUri() {
  return (
    process.env.GOOGLE_ADS_REDIRECT_URI ||
    (process.env.NODE_ENV === "production"
      ? "https://anugrahplastik.com/api/integrations/google-ads/callback"
      : "http://localhost:3100/api/integrations/google-ads/callback")
  );
}

export function isGoogleAdsOAuthConfigured() {
  return Boolean(
    process.env.GOOGLE_ADS_CLIENT_ID &&
    process.env.GOOGLE_ADS_CLIENT_SECRET &&
    /^[\da-f]{64}$/i.test(process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim() ?? ""),
  );
}
