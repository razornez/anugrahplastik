import { isIP } from "node:net";
import { open } from "maxmind";

type DeviceContext = {
  deviceCategory: "mobile" | "tablet" | "desktop" | "unknown";
  browserName: string;
  operatingSystem: string;
};
type LocationContext = { countryName: string | null; regionName: string | null; cityName: string | null };

let readerPromise: Promise<Awaited<ReturnType<typeof open>> | null> | null = null;

function labelBrowser(userAgent: string) {
  if (/edg\//i.test(userAgent)) return "Microsoft Edge";
  if (/firefox\//i.test(userAgent)) return "Firefox";
  if (/chrome\//i.test(userAgent) && !/edg\//i.test(userAgent)) return "Chrome";
  if (/safari\//i.test(userAgent) && !/chrome\//i.test(userAgent)) return "Safari";
  return "Browser lain";
}

function labelOperatingSystem(userAgent: string) {
  if (/iphone|ipad|ipod/i.test(userAgent)) return "iOS";
  if (/android/i.test(userAgent)) return "Android";
  if (/windows/i.test(userAgent)) return "Windows";
  if (/mac os/i.test(userAgent)) return "macOS";
  if (/linux/i.test(userAgent)) return "Linux";
  return "Tidak diketahui";
}

export function deviceContext(userAgent: string | null): DeviceContext {
  const value = userAgent ?? "";
  const deviceCategory = /ipad|tablet/i.test(value)
    ? "tablet"
    : /mobi|iphone|ipod|android/i.test(value)
      ? "mobile"
      : value
        ? "desktop"
        : "unknown";
  return { deviceCategory, browserName: labelBrowser(value), operatingSystem: labelOperatingSystem(value) };
}

function forwardedIp(headers: Headers) {
  if (process.env.TRUST_PROXY_HEADERS !== "true") return null;
  const candidate = headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  return candidate && isIP(candidate) ? candidate : null;
}

export async function locationContext(headers: Headers): Promise<LocationContext> {
  const databasePath = process.env.GEOIP_CITY_DB_PATH;
  const ip = forwardedIp(headers);
  if (!databasePath || !ip) return { countryName: null, regionName: null, cityName: null };
  try {
    readerPromise ??= open(databasePath);
    const reader = await readerPromise;
    if (!reader) return { countryName: null, regionName: null, cityName: null };
    const result = reader.get(ip) as {
      country?: { names?: { en?: string } };
      subdivisions?: Array<{ names?: { en?: string } }>;
      city?: { names?: { en?: string } };
    } | null;
    return {
      countryName: result?.country?.names?.en ?? null,
      regionName: result?.subdivisions?.[0]?.names?.en ?? null,
      cityName: result?.city?.names?.en ?? null,
    };
  } catch {
    return { countryName: null, regionName: null, cityName: null };
  }
}
