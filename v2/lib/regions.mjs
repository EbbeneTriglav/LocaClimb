/*
 * regions.mjs - which Italian region a point is in (contributor levels by region, 03/11/2026).
 * data/regions_it.json: ISTAT boundaries via openpolis/geojson-italy (CC BY 4.0), simplified
 * (~5% of the points): good to a few hundred metres, enough for a summit. Outside Italy the
 * caller falls back to the country (lib/data.mjs countryNear).
 */
const URL_REG = new URL("../../data/regions_it.json", import.meta.url).href;
let REG = null;

/* ray casting on one ring of [lon, lat] */
export function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/* polys: [[outer, hole...], ...] */
export function inPolys(lon, lat, polys) {
  for (const p of polys) if (inRing(lon, lat, p[0]) && !p.slice(1).some((h) => inRing(lon, lat, h))) return true;
  return false;
}
export function regionAt(data, lat, lon) {
  for (const r of (data && data.regions) || []) if (inPolys(lon, lat, r.polys)) return r.name;
  return null;
}
export async function loadRegions() {
  if (!REG) REG = fetch(URL_REG).then((r) => r.json()).catch(() => ({ regions: [] }));
  return REG;
}
