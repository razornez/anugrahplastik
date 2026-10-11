export const businessSource = "serpapi_business_discovery";
export const businessMonthlyLimit = 4;
export const businessCacheDays = 7;

// City reference points, not company coordinates. The map describes search areas.
export const businessCities = [
  { id: "bandung", label: "Bandung", group: "Bandung Raya", lat: -6.9175, lon: 107.6191 },
  { id: "cimahi", label: "Cimahi", group: "Bandung Raya", lat: -6.8722, lon: 107.5425 },
  { id: "kab-bandung", label: "Kabupaten Bandung", group: "Bandung Raya", lat: -7.0253, lon: 107.5198 },
  { id: "bandung-barat", label: "Bandung Barat", group: "Bandung Raya", lat: -6.8333, lon: 107.4833 },
  { id: "jakarta", label: "Jakarta", group: "Jabodetabek", lat: -6.2088, lon: 106.8456 },
  { id: "bogor", label: "Bogor", group: "Jabodetabek", lat: -6.5971, lon: 106.806 },
  { id: "depok", label: "Depok", group: "Jabodetabek", lat: -6.4025, lon: 106.7942 },
  { id: "tangerang", label: "Tangerang", group: "Jabodetabek", lat: -6.1783, lon: 106.6319 },
  { id: "tangerang-selatan", label: "Tangerang Selatan", group: "Jabodetabek", lat: -6.2886, lon: 106.7179 },
  { id: "bekasi", label: "Bekasi", group: "Jabodetabek", lat: -6.2383, lon: 106.9756 },
] as const;
export type BusinessCityId = (typeof businessCities)[number]["id"];
export type BusinessReview = "new" | "relevant" | "dismissed";
export type BusinessResult = {
  stableId: string | null;
  name: string;
  category: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  mapsUrl: string;
};
export type BusinessCandidate = BusinessResult & {
  id: string;
  areas: string[];
  checkedAt: string;
  status: BusinessReview;
  leadId: string | null;
};
export type BusinessBoardData = {
  evaluatedAt: string;
  available: boolean;
  error: string | null;
  candidates: BusinessCandidate[];
  searches: {
    id: string;
    phrase: string;
    cityId: string;
    status: string;
    count: number;
    startedAt: string;
    error: string | null;
  }[];
  budget: { used: number; limit: number; businessUsed: number; reserved: number; available: number } | null;
  members: { id: string; name: string }[];
  configured: boolean;
};

export function normalizeBusinessQuery(phrase: string, cityId: string) {
  const city = businessCities.find((item) => item.id === cityId);
  const cleaned = phrase.trim().replace(/\s+/g, " ");
  if (!city || cleaned.length < 3 || cleaned.length > 120 || /[\u0000-\u001f\u007f]/.test(cleaned))
    throw new Error("Pilih wilayah dan isi frasa industri sepanjang 3–120 karakter.");
  return { phrase: cleaned, city, queryKey: `${city.id}:${cleaned.toLocaleLowerCase("id-ID")}` };
}

export function safeBusinessWebsite(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 1000) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (
      !/^(https?:)$/.test(url.protocol) ||
      url.username ||
      url.password ||
      !host.includes(".") ||
      host.endsWith(".local") ||
      host.endsWith(".localhost") ||
      host === "localhost" ||
      /^[\d.]+$/.test(host) ||
      host.includes(":")
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

function text(value: unknown, length: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, length) : null;
}

export function parseBusinessResults(payload: unknown, cityLabel: string): BusinessResult[] {
  if (!payload || typeof payload !== "object") throw new Error("Respons pencarian tidak dapat dibaca.");
  const data = payload as { error?: unknown; local_results?: unknown; search_metadata?: { status?: string } };
  // Never propagate source errors: they can contain request parameters or credentials.
  if (data.error || (data.search_metadata?.status && data.search_metadata.status !== "Success"))
    throw new Error("Sumber belum berhasil menyelesaikan pencarian. Hasil lama tetap tersedia.");
  if (!Array.isArray(data.local_results)) {
    if (data.local_results != null) throw new Error("Format hasil pencarian tidak sesuai.");
    return [];
  }
  const seen = new Set<string>();
  return data.local_results.slice(0, 20).flatMap((value): BusinessResult[] => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    const name = text(row.title, 120);
    if (!name) return [];
    const place = text(row.place_id, 240);
    const cid = text(row.data_cid, 40);
    const stableId =
      place && /^[\w-]{8,240}$/.test(place) ? `place:${place}` : cid && /^\d+$/.test(cid) ? `cid:${cid}` : null;
    if (stableId && seen.has(stableId)) return [];
    if (stableId) seen.add(stableId);
    const query = new URLSearchParams({ api: "1", query: `${name} ${cityLabel}` });
    if (stableId?.startsWith("place:")) query.set("query_place_id", stableId.slice(6));
    return [
      {
        stableId,
        name,
        category: text(row.type, 120),
        address: text(row.address, 500),
        phone: text(row.phone, 32),
        website: safeBusinessWebsite(row.website),
        mapsUrl: `https://www.google.com/maps/search/?${query.toString()}`,
      },
    ];
  });
}

export function businessBudget(used: number, businessUsed: number, reserved: number, limit = 40) {
  return {
    used,
    limit,
    businessUsed,
    reserved,
    available: Math.max(0, Math.min(businessMonthlyLimit - businessUsed, limit - used - reserved)),
  };
}
export function businessCacheFresh(checkedAt: Date | null, now: Date) {
  return Boolean(checkedAt && checkedAt <= now && now.getTime() - checkedAt.getTime() < businessCacheDays * 86_400_000);
}
export function filterBusinessCandidates(items: BusinessCandidate[], area: string, status: string, query: string) {
  const needle = query.trim().toLocaleLowerCase("id-ID");
  return items.filter(
    (item) =>
      (!area || item.areas.includes(area)) &&
      (!status || item.status === status) &&
      (!needle ||
        `${item.name} ${item.category ?? ""} ${item.address ?? ""}`.toLocaleLowerCase("id-ID").includes(needle)),
  );
}
