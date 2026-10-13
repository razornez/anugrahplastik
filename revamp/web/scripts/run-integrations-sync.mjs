#!/usr/bin/env node

/**
 * Intended for a VPS scheduler. It deliberately reads secrets only from the
 * process environment and prints no token, credential, or provider response.
 */
const baseUrl = (process.env.INTEGRATIONS_SYNC_URL || process.env.APP_ORIGIN || "").replace(/\/$/, "");
const token = process.env.INTEGRATIONS_CRON_TOKEN || "";
const service = process.argv.find((argument) => argument.startsWith("--service="))?.slice("--service=".length) || "";
if (service && service !== "mail" && service !== "ads") {
  console.error("Integrations sync service must be mail or ads.");
  process.exit(2);
}
if (!/^https:\/\//i.test(baseUrl) || !token) {
  console.error(
    "Integrations sync is not configured: set HTTPS INTEGRATIONS_SYNC_URL (or APP_ORIGIN) and INTEGRATIONS_CRON_TOKEN.",
  );
  process.exit(2);
}

try {
  const response = await fetch(`${baseUrl}/api/integrations/sync`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(service ? { services: [service] } : {}),
    signal: AbortSignal.timeout(45_000),
  });
  const payload = await response.json().catch(() => ({}));
  const summary = {
    ok: response.ok && payload.ok === true,
    mail: payload.mail?.status ?? "unavailable",
    ads: payload.ads?.status ?? "unavailable",
  };
  console.log(JSON.stringify(summary));
  if (!summary.ok) process.exitCode = 1;
} catch {
  console.error("Integrations sync request failed before a safe result was returned.");
  process.exitCode = 1;
}
