/*
 * poi.mjs - water and food along a climb, from the static POI tiles the classic app uses
 * (data/poi/c/<floor(lat*4)>_<floor(lon*4)>.json, built by scripts/build_poi.mjs; 0.25 deg cells,
 * each { n: [[osmId, lat, lon, tags]...] }). No Overpass from v2: a zone without tiles says so.
 */
const DATA = new URL("../../data/poi/", import.meta.url).href;
let index = null;
const cells = new Map();

export function cellKey(lat, lon) { return Math.floor(lat * 4) + "_" + Math.floor(lon * 4); }

/* pure: what a node is for a cyclist -> { kind: "water" | "food", label } | null */
export function classify(tags) {
  const a = tags.amenity, m = tags.man_made, n = tags.natural, s = tags.shop;
  if (a === "drinking_water") return { kind: "water", label: "Acqua potabile" };
  if (m === "water_tap") return { kind: "water", label: "Rubinetto" };
  if (n === "spring") return { kind: "water", label: tags.drinking_water === "no" ? null : "Sorgente" };
  if (a === "fountain" && tags.drinking_water === "yes") return { kind: "water", label: "Fontana" };
  if (a === "cafe" || a === "bar" || a === "pub") return { kind: "food", label: "Bar" };
  if (a === "restaurant" || a === "fast_food") return { kind: "food", label: "Ristorante" };
  if (a === "ice_cream") return { kind: "food", label: "Gelateria" };
  if (s === "bakery" || s === "pastry") return { kind: "food", label: "Forno" };
  if (s === "convenience" || s === "supermarket" || s === "greengrocer") return { kind: "food", label: "Alimentari" };
  return null;
}

/* pure: the cells covering a track's bounding box */
export function cellsFor(track) {
  let la0 = 90, la1 = -90, lo0 = 180, lo1 = -180;
  for (const q of track) { la0 = Math.min(la0, q[0]); la1 = Math.max(la1, q[0]); lo0 = Math.min(lo0, q[1]); lo1 = Math.max(lo1, q[1]); }
  const out = [];
  for (let a = Math.floor((la0 - 0.002) * 4); a <= Math.floor((la1 + 0.002) * 4); a++)
    for (let b = Math.floor((lo0 - 0.002) * 4); b <= Math.floor((lo1 + 0.002) * 4); b++) out.push(a + "_" + b);
  return out;
}

/* -> { covered: bool, points: [{ lat, lon, kind, label, name }] } */
export async function poisNear(track) {
  if (!track || track.length < 2) return { covered: false, points: [] };
  if (!index) index = fetch(DATA + "index.json", { cache: "no-cache" }).then((r) => r.json()).then((j) => new Set(j.cells || [])).catch(() => new Set());
  const have = await index, keys = cellsFor(track);
  const covered = keys.length > 0 && keys.every((k) => have.has(k));
  const lists = await Promise.all(keys.filter((k) => have.has(k)).map((k) => {
    if (!cells.has(k)) cells.set(k, fetch(DATA + "c/" + k + ".json").then((r) => r.json()).catch(() => ({ n: [] })));
    return cells.get(k);
  }));
  const points = [];
  for (const c of lists) for (const [, lat, lon, tags] of (c.n || [])) {
    const k = classify(tags || {});
    if (k && k.label) points.push({ lat, lon, kind: k.kind, label: k.label, name: tags.name || "" });
  }
  return { covered, points };
}
