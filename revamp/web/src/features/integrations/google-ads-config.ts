import "server-only";

export type GoogleAdsConfigurationIssue = {
  code: "oauth" | "developer-token" | "customer-id" | "manager-id";
  label: string;
  recovery: string;
};

function normalizedCustomerId(value?: string) {
  const normalized = value?.replaceAll("-", "").trim() ?? "";
  return /^\d{10}$/.test(normalized) ? normalized : null;
}

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

export function googleAdsCustomerId() {
  return normalizedCustomerId(process.env.GOOGLE_ADS_CUSTOMER_ID);
}

export function googleAdsLoginCustomerId() {
  return normalizedCustomerId(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);
}

export function googleAdsExpectedEmail() {
  const email = process.env.GOOGLE_ADS_LOGIN_EMAIL?.trim().toLowerCase() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** Server-only secret. It is never persisted or returned to a client. */
export function googleAdsDeveloperToken() {
  const token = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim() ?? "";
  return token.length >= 10 && token.length <= 512 ? token : null;
}

export function getGoogleAdsOAuthConfigurationIssues(): GoogleAdsConfigurationIssue[] {
  const issues: GoogleAdsConfigurationIssue[] = [];
  if (!isGoogleAdsOAuthConfigured())
    issues.push({
      code: "oauth",
      label: "OAuth Client dan kunci enkripsi",
      recovery: "Lengkapi OAuth Client ID, Client Secret, dan kunci enkripsi di environment privat server.",
    });
  if (!googleAdsExpectedEmail())
    issues.push({
      code: "oauth",
      label: "Email owner Google Ads",
      recovery: "Isi email akun Google owner yang diizinkan menyambungkan OAuth di environment privat.",
    });
  return issues;
}

export function getGoogleAdsReportingConfigurationIssues(): GoogleAdsConfigurationIssue[] {
  const issues: GoogleAdsConfigurationIssue[] = [];
  if (!googleAdsDeveloperToken())
    issues.push({
      code: "developer-token",
      label: "Developer Token Google Ads",
      recovery: "Simpan Developer Token yang telah disetujui pada environment privat server.",
    });
  if (!googleAdsCustomerId())
    issues.push({
      code: "customer-id",
      label: "Customer ID akun iklan",
      recovery: "Isi ID 10 digit akun iklan yang akan dilaporkan di environment privat.",
    });
  if (!googleAdsLoginCustomerId())
    issues.push({
      code: "manager-id",
      label: "MCC Login Customer ID",
      recovery: "Tautkan akun iklan ke MCC aktif lalu isi ID MCC 10 digit tanpa tanda hubung di environment privat.",
    });
  return issues;
}

export function isGoogleAdsReportingConfigured() {
  return getGoogleAdsReportingConfigurationIssues().length === 0;
}

export function maskGoogleAdsCustomerId(value: string | null) {
  return value ? `••••••${value.slice(-4)}` : "Belum ditetapkan";
}
