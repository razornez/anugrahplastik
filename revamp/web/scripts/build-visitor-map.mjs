// Build-time only: runtime maps never contact a third-party service.
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const neRevision = "ca96624a56bd078437bca8184e78163e5039ad19";
const gbRevision = "5c25134028196d43ce97b5071934fd0cfc92f09f";
const ne = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${neRevision}/geojson/`;
const gb = `https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/${gbRevision}/releaseData/gbOpen/IDN/ADM1/`;
const sources = [];
async function load(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Map source returned ${response.status}`);
  const text = await response.text();
  sources.push({ url, sha256: createHash("sha256").update(text).digest("hex") });
  return JSON.parse(text);
}
const [world, detailed, provinces, metadata] = await Promise.all([
  load(`${ne}ne_110m_admin_0_countries.geojson`),
  load(`${ne}ne_50m_admin_0_countries.geojson`),
  load(`${gb}geoBoundaries-IDN-ADM1_simplified.geojson`),
  load(`${gb}geoBoundaries-IDN-ADM1-metaData.json`),
]);
function rings(feature) {
  return feature.geometry.type === "Polygon" ? feature.geometry.coordinates : feature.geometry.coordinates.flat();
}
function project([longitude, latitude], extent) {
  const [west, south, east, north] = extent;
  return [((longitude - west) / (east - west)) * 900, ((north - latitude) / (north - south)) * 400];
}
function path(feature, extent) {
  return rings(feature)
    .map(
      (ring) =>
        ring
          .map((point, index) => {
            const [x, y] = project(point, extent);
            const move = !index || Math.abs(point[0] - ring[index - 1][0]) > 180;
            return `${move ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join("") + "Z",
    )
    .join("");
}
function representativePoint(feature) {
  // Centre of the most detailed ring's bounding box: a region reference, never a visitor coordinate.
  const largest = rings(feature).sort((a, b) => b.length - a.length)[0];
  const xs = largest.map((p) => p[0]);
  const ys = largest.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}
const countryShapes = world.features.filter((f) => f.properties.ADMIN !== "Antarctica");
const data = {
  world: countryShapes.map((f) => ({ name: f.properties.ADMIN, path: path(f, [-180, -60, 180, 85]) })),
  indonesia: path(
    detailed.features.find((f) => f.properties.ADM0_A3 === "IDN"),
    [94, -12, 142, 9],
  ),
};
const catalog = {
  countries: detailed.features
    .filter((f) => f.properties.ADMIN !== "Antarctica")
    .map((f) => ({
      key: f.properties.ADM0_A3,
      iso: f.properties.ISO_A2_EH,
      names: [
        ...new Set(
          [f.properties.ADMIN, f.properties.NAME_EN, f.properties.NAME_LONG, f.properties.NAME].filter(Boolean),
        ),
      ],
      point: [f.properties.LABEL_X, f.properties.LABEL_Y],
    })),
  provinces: provinces.features.map((f) => ({
    name: f.properties.shapeName,
    key: f.properties.shapeISO,
    point: representativePoint(f),
  })),
};
await mkdir("src/features/analytics/map-data", { recursive: true });
await writeFile("src/features/analytics/map-data/shapes.json", JSON.stringify(data) + "\n");
await writeFile("src/features/analytics/map-data/catalog.json", JSON.stringify(catalog, null, 2) + "\n");
await writeFile(
  "src/features/analytics/map-data/provenance.json",
  JSON.stringify(
    {
      sources,
      naturalEarthLicense: "Public domain",
      provinceCatalogLicense: metadata.boundaryLicense,
      provinceSource: metadata.boundarySource,
      provinceYear: metadata.boundaryYear,
      provinceCount: provinces.features.length,
      note: "Historical region reference points, not current administrative borders. Unmatched provinces remain unmapped.",
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Generated local map: ${catalog.countries.length} countries, ${catalog.provinces.length} province reference points.`,
);
