import catalog from "./map-data/catalog.json";

export type MapExtent = "indonesia" | "world";
export type GeographyRow = {
  country: string | null;
  region: string | null;
  city: string | null;
  total: number;
  forms: number;
};
export type GeographyBucket = {
  key: string;
  label: string;
  country: string;
  region: string;
  total: number;
  forms: number;
  point: number[] | null;
  cities: Array<{ label: string; total: number }>;
};
const provinceNames: Record<string, string> = {
  "ID-JB": "Jawa Barat",
  "ID-JT": "Jawa Tengah",
  "ID-JI": "Jawa Timur",
  "ID-JK": "DKI Jakarta",
  "ID-YO": "DI Yogyakarta",
  "ID-BT": "Banten",
  "ID-BA": "Bali",
  "ID-AC": "Aceh",
  "ID-SU": "Sumatera Utara",
  "ID-SB": "Sumatera Barat",
  "ID-SS": "Sumatera Selatan",
  "ID-RI": "Riau",
  "ID-KR": "Kepulauan Riau",
  "ID-JA": "Jambi",
  "ID-BE": "Bengkulu",
  "ID-LA": "Lampung",
  "ID-BB": "Kepulauan Bangka Belitung",
  "ID-KB": "Kalimantan Barat",
  "ID-KT": "Kalimantan Tengah",
  "ID-KS": "Kalimantan Selatan",
  "ID-KI": "Kalimantan Timur",
  "ID-KU": "Kalimantan Utara",
  "ID-SA": "Sulawesi Utara",
  "ID-ST": "Sulawesi Tengah",
  "ID-SN": "Sulawesi Selatan",
  "ID-SG": "Sulawesi Tenggara",
  "ID-SR": "Sulawesi Barat",
  "ID-GO": "Gorontalo",
  "ID-NB": "Nusa Tenggara Barat",
  "ID-NT": "Nusa Tenggara Timur",
  "ID-MA": "Maluku",
  "ID-MU": "Maluku Utara",
  "ID-PA": "Papua",
  "ID-PB": "Papua Barat",
};
const normalize = (value: string) => value.trim().toLocaleLowerCase("id-ID");
const countryNames = new Intl.DisplayNames(["id"], { type: "region" });
const countryIndex = new Map(
  catalog.countries.flatMap((country) => {
    const local = /^[A-Z]{2}$/.test(country.iso) ? countryNames.of(country.iso) : country.names[0];
    return [...country.names, local || "", country.iso, country.key]
      .filter(Boolean)
      .map((name) => [normalize(name), country] as const);
  }),
);
const provinceIndex = new Map(
  catalog.provinces.flatMap((province) =>
    [
      province.name,
      provinceNames[province.key],
      province.key,
      ...(province.key === "ID-JK"
        ? ["Jakarta", "Jakarta Raya", "Daerah Khusus Ibukota Jakarta", "Jakarta Special Capital Region"]
        : []),
      ...(province.key === "ID-YO" ? ["Yogyakarta", "Daerah Istimewa Yogyakarta"] : []),
    ]
      .filter(Boolean)
      .map((name) => [normalize(name), province] as const),
  ),
);

export function locationAliases(value: string, level: "country" | "region") {
  const index = level === "country" ? countryIndex : provinceIndex;
  const match = index.get(normalize(value));
  return match ? [...index].filter(([, item]) => item === match).map(([key]) => key) : [normalize(value)];
}

export function geographyBuckets(rows: GeographyRow[], extent: MapExtent): GeographyBucket[] {
  const buckets = new Map<string, GeographyBucket>();
  for (const row of rows) {
    const country = row.country ? countryIndex.get(normalize(row.country)) : undefined;
    if (extent === "indonesia" && country?.key !== "IDN") continue;
    const province = country?.key === "IDN" && row.region ? provinceIndex.get(normalize(row.region)) : undefined;
    const key =
      extent === "world"
        ? country?.key || `unknown:${row.country || ""}`
        : province?.key || `unmapped:${row.region || ""}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      const localName = country && /^[A-Z]{2}$/.test(country.iso) ? countryNames.of(country.iso) : undefined;
      bucket = {
        key,
        label:
          extent === "world"
            ? localName || row.country || "Lokasi belum diketahui"
            : province
              ? provinceNames[province.key] || province.name
              : row.region || "Provinsi belum diketahui",
        country: row.country || "",
        region: extent === "indonesia" ? row.region || "" : "",
        total: 0,
        forms: 0,
        point: extent === "world" ? country?.point || null : province?.point || null,
        cities: [],
      };
      buckets.set(key, bucket);
    }
    bucket.total += Number(row.total);
    bucket.forms += Number(row.forms);
    const cityLabel = row.city || "Kota belum diketahui";
    const city = bucket.cities.find((item) => item.label === cityLabel);
    if (city) city.total += Number(row.total);
    else bucket.cities.push({ label: cityLabel, total: Number(row.total) });
  }
  return [...buckets.values()]
    .map((bucket) => ({
      ...bucket,
      cities: bucket.cities.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

export function geographySummary(rows: GeographyRow[]) {
  return rows.reduce(
    (summary, row) => {
      const country = row.country ? countryIndex.get(normalize(row.country)) : undefined;
      summary.total += Number(row.total);
      if (!country) summary.unknown += Number(row.total);
      else if (country.key !== "IDN") summary.overseas += Number(row.total);
      else {
        summary.indonesia += Number(row.total);
        if (!row.region || !provinceIndex.has(normalize(row.region))) summary.unmapped += Number(row.total);
      }
      return summary;
    },
    { total: 0, indonesia: 0, overseas: 0, unknown: 0, unmapped: 0 },
  );
}

export function visitorQuery(
  filters: {
    days: number;
    device: string;
    city: string;
    source: string;
    outcome: string;
    country?: string;
    region?: string;
  },
  extent: MapExtent,
  page: { session?: string; cursor?: string; direction?: string } = {},
) {
  const query = new URLSearchParams({ days: String(filters.days), map: extent });
  for (const key of ["city", "source", "outcome", "country", "region"] as const)
    if (filters[key]) query.set(key, filters[key]);
  if (filters.device !== "all") query.set("device", filters.device);
  for (const key of ["session", "cursor", "direction"] as const) if (page[key]) query.set(key, page[key]);
  return query.toString();
}

export function mapPoint(point: number[], extent: MapExtent) {
  const [west, south, east, north] = extent === "indonesia" ? [94, -12, 142, 9] : [-180, -60, 180, 85];
  return [((point[0] - west) / (east - west)) * 900, ((north - point[1]) / (north - south)) * 400];
}

export function layoutMapMarkers(buckets: GeographyBucket[], extent: MapExtent) {
  const placed: Array<GeographyBucket & { anchor: number[]; position: number[] }> = [];
  for (const bucket of buckets) {
    if (!bucket.point) continue;
    const anchor = mapPoint(bucket.point, extent);
    let position = anchor;
    for (let attempt = 0; attempt < 64; attempt++) {
      const angle = (attempt * Math.PI) / 4;
      const radius = attempt === 0 ? 0 : 64 * Math.ceil(attempt / 8);
      const candidate = [
        Math.max(32, Math.min(868, anchor[0] + Math.cos(angle) * radius)),
        Math.max(32, Math.min(368, anchor[1] + Math.sin(angle) * radius)),
      ];
      position = candidate;
      if (!placed.some((item) => Math.hypot(item.position[0] - candidate[0], item.position[1] - candidate[1]) < 70))
        break;
    }
    placed.push({ ...bucket, anchor, position });
  }
  return placed;
}
