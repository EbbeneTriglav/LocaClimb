/*
 * data.mjs - the climbs for v2, from the SAME data files as the classic app (nothing duplicated):
 *   data/osm_index.json    every climb, marker fields only (+ "f": its region file)
 *   data/osm_regions.json  the region files, in the order "f" refers to
 *   data/passes_data.js    the 24 curated passes (loaded by index.html as a classic script)
 *   data/curated_overrides.json  their sides rebuilt by the pipeline
 * Region files (1-14 MB, with tracks) are fetched only when a climb of that file is opened.
 */
const DATA = "../data/";
const cache = new Map();          // region file -> Promise<Map(id -> record)>
let state = null;

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/* "🛣️ Asfalto" -> "Asfalto": the classic app's labels start with an emoji */
export function cleanLabel(s) { return String(s || "").replace(/^[^\p{L}\p{N}]+/u, "").trim(); }

export async function loadIndex() {
  if (state) return state;
  const [idx, regions, overrides] = await Promise.all([
    fetch(DATA + "osm_index.json", { cache: "no-cache" }).then((r) => r.json()),
    fetch(DATA + "osm_regions.json", { cache: "no-cache" }).then((r) => r.json()).catch(() => []),
    fetch(DATA + "curated_overrides.json", { cache: "no-cache" }).then((r) => r.json()).catch(() => ({}))
  ]);
  const curated = (globalThis.PASSES_DATA || []).map((p) => {
    const o = overrides[p.id];
    return { ...p, versanti: o && o.versanti && o.versanti.length ? o.versanti : p.versanti, curated: true };
  });
  // a curated pass replaces the OSM twin at the same summit
  const near = (a, b) => Math.abs(a.lat - b.lat) < 0.008 && Math.abs(a.lon - b.lon) < 0.011;
  const climbs = curated.concat(idx.filter((p) => p.hasV && !curated.some((c) => near(c, p))));
  for (const c of climbs) c._n = norm(c.name);
  state = { climbs, regions, byId: new Map(climbs.map((c) => [String(c.id), c])) };
  return state;
}

export function search(q, limit = 8) {
  const n = norm(q).trim();
  if (n.length < 2 || !state) return [];
  const starts = [], has = [];
  for (const c of state.climbs) {
    if (c._n.startsWith(n)) starts.push(c); else if (c._n.includes(n)) has.push(c);
    if (starts.length >= limit) break;
  }
  return starts.concat(has).slice(0, limit);
}

export function inBounds(b, limit = 40) {
  if (!state) return [];
  const out = [];
  for (const c of state.climbs) if (c.lat >= b.s && c.lat <= b.n && c.lon >= b.w && c.lon <= b.e) out.push(c);
  out.sort((a, b2) => (b2.difficulty || 0) - (a.difficulty || 0) || (b2.elevation || 0) - (a.elevation || 0));
  return { total: out.length, list: out.slice(0, limit) };
}

export function nearby(lat, lon, km, limit) {
  if (!state) return [];
  const dLat = km / 111, dLon = km / (111 * Math.cos(lat * Math.PI / 180));
  return state.climbs.filter((c) => Math.abs(c.lat - lat) < dLat && Math.abs(c.lon - lon) < dLon && (c.difficulty || 0) >= 5)
    .sort((a, b) => (b.difficulty || 0) - (a.difficulty || 0)).slice(0, limit);
}

/* full record (with sides and tracks) of a climb */
export async function getClimb(id) {
  const c = state && state.byId.get(String(id));
  if (!c) return null;
  if (c.curated || c.versanti) return c;
  let full = null;
  if (c.f != null && state.regions[c.f]) full = (await regionFile(state.regions[c.f])).get(String(id));
  if (!full) {
    // index built before "f" existed: look through the region files, the likely ones first
    // (road-network climbs live in osm_passes_disc_*), a few at a time; each file is cached
    const disc = /^osm-rt/.test(String(id));
    const order = state.regions.slice().sort((a, b) => (/_disc_/.test(b) === disc) - (/_disc_/.test(a) === disc));
    for (let i = 0; i < order.length && !full; i += 4) {
      const maps = await Promise.all(order.slice(i, i + 4).map((f) => regionFile(f).catch(() => new Map())));
      for (const m of maps) { full = full || m.get(String(id)); }
    }
  }
  if (full) { Object.assign(c, { versanti: full.versanti, surfaceLabel: full.surfaceLabel, trafFeriale: full.trafFeriale, trafWeekend: full.trafWeekend }); }
  return c;
}

function regionFile(file) {
  if (!cache.has(file)) {
    cache.set(file, fetch(DATA + file, { cache: "no-cache" }).then((r) => r.json())
      .then((arr) => new Map(arr.map((p) => [String(p.id), p])))
      .catch((e) => { cache.delete(file); throw e; }));
  }
  return cache.get(file);
}

export function geojson(climbs) {
  return {
    type: "FeatureCollection",
    features: climbs.map((c) => ({ type: "Feature", id: undefined, properties: { id: String(c.id), name: c.name, d: c.difficulty || 0, ele: c.elevation || 0, cur: c.curated ? 1 : 0 }, geometry: { type: "Point", coordinates: [c.lon, c.lat] } }))
  };
}
