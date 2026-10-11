export function trafficSource(referrer: string | null) {
  if (!referrer) return "Langsung";

  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "");
    if (host.includes("google")) return "Google";
    if (host.includes("instagram")) return "Instagram";
    if (host.includes("facebook")) return "Facebook";
    return host;
  } catch {
    return "Langsung";
  }
}
