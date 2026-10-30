/*
 * data.mjs - the climbs for v2, from the SAME data files as the classic app (nothing duplicated):
 *   data/osm_index.json    every climb, marker fields only (+ "f": its region file)
 *   data/osm_regions.json  the region files, in the order "f" refers to
 *   data/passes_data.js    the 24 curated passes (loaded by index.html as a classic script)
 *   data/curated_overrides.json  their sides rebuilt by the pipeline
 * Region files (1-14 MB, with tracks) are fetched only when a climb of that file is opened.
 */
import { sameOrigin, newSidesFor } from "./climb.mjs";

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
  // curated passes with everything the pipeline rebuilt (position, sides, difficulty, category),
  // exactly as the classic app applies curated_overrides.json
  const curated = (globalThis.PASSES_DATA || []).map((p) => {
    const o = overrides[p.id] || {};
    return { ...p, lat: o.lat ?? p.lat, lon: o.lon ?? p.lon, difficulty: o.difficulty ?? p.difficulty, cat: o.cat ?? p.cat,
      versanti: o.versanti && o.versanti.length ? o.versanti : p.versanti, curated: true, twins: [] };
  });
  const climbs = curated.concat(mergeIndex(idx, curated));
  for (const c of climbs) { if (!c.curated) c.name = displayName(c); c._n = norm(c.name); }
  state = { climbs, regions, byId: new Map(climbs.map((c) => [String(c.id), c])) };
  return state;
}

/* The index lists a pass once per region file it is in (border passes, overlapping zones), and the
   same summit can come from two files with different ids. As the classic app (js/data.js):
   - same id -> one marker, sides read from every file ("fs");
   - another pass within ~1 km -> merged into the first ("co"), sides unioned;
   - within ~800 m of a curated pass -> hidden, its missing sides offered to the curated pass. */
export function baseName(n) { return norm(n).replace(/\b(passo|colle|col|monte|forcella|sella|giogo|del|della|dello|di|de|la|il|lo)\b/g, "").replace(/[^a-z0-9]/g, ""); }
export function mergeIndex(idx, curated) {
  const out = [], byId = new Map(), grid = new Map(), G = 0.009;
  const near = (a, b, d) => Math.abs(a.lat - b.lat) < d && Math.abs(a.lon - b.lon) < d;
  const cell = (la, lo) => Math.floor(la / G) + ":" + Math.floor(lo / G);
  const hostNear = (p) => {
    const a = Math.floor(p.lat / G), b = Math.floor(p.lon / G);
    for (let i = a - 1; i <= a + 1; i++) for (let j = b - 1; j <= b + 1; j++) {
      for (const q of grid.get(i + ":" + j) || []) if (near(q, p, G)) return q;
    }
    return null;
  };
  for (const p0 of idx) {
    if (!p0.hasV) continue;
    const seen = byId.get(p0.id);
    if (seen) { if (p0.f != null && !seen.fs.includes(p0.f)) seen.fs.push(p0.f); continue; }
    const p = { ...p0, fs: p0.f != null ? [p0.f] : [], co: [] };
    byId.set(p.id, p);
    // a curated twin: within ~800 m (as v1), or the same name within ~2 km - OSM's pass node can sit
    // away from the road summit (Mortirolo: 900 m east, shown twice in v1)
    const cur = curated.find((c) => near(c, p, 0.008) || (near(c, p, 0.02) && baseName(c.name) === baseName(p.name)));
    if (cur) { cur.twins.push(p); continue; }
    const host = hostNear(p);
    if (host) { host.co.push(p); if ((p.elevation || 0) > (host.elevation || 0)) host.elevation = p.elevation; continue; }
    out.push(p);
    const k = cell(p.lat, p.lon); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p);
  }
  return out;
}

/* Names that say nothing: ~1200 OSM tops are called just "Passo" / "Colle" / "Sattel". Show the
   height with them, so the list does not read "Passo, Passo, Passo". A few discover tops took the
   name of a nearby feature that is not the climb: fixed by id (position-based, stable). */
const GENERIC = /^(passo|pass|colle|col|sella|forcella|valico|sattel|joch|bocchetta|coll|collado|puerto|prevoj|sedlo|przelecz|salita)$/i;
const NAME_FIX = { "osm-rt4692440x1094453": "Ötztaler Gletscherstraße (Tiefenbach)" };
export function displayName(c) {
  if (NAME_FIX[c.id]) return NAME_FIX[c.id];
  const n = String(c.name || "").trim();
  if (!n) return c.elevation ? `Salita a ${c.elevation} m` : "Salita senza nome";
  if (GENERIC.test(n)) return c.elevation ? `${n[0].toUpperCase() + n.slice(1)} a ${c.elevation} m` : `${n} senza nome`;
  return n;
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

/* full record of one index entry, from its region file(s) */
async function fullRecord(p) {
  let full = null;
  for (const f of (p.fs || [])) {
    const r = state.regions[f] && (await regionFile(state.regions[f])).get(String(p.id));
    if (!r) continue;
    if (!full) full = { ...r, versanti: (r.versanti || []).slice() };
    else for (const v of (r.versanti || [])) if (!full.versanti.some((w) => sameOrigin(v, w))) full.versanti.push(v);
  }
  if (!full) {
    // index built before "f" existed: look through the region files, the likely ones first
    // (road-network climbs live in osm_passes_disc_*), a few at a time; each file is cached
    const disc = /^osm-rt/.test(String(p.id));
    const order = state.regions.slice().sort((a, b) => (/_disc_/.test(b) === disc) - (/_disc_/.test(a) === disc));
    for (let i = 0; i < order.length && !full; i += 4) {
      const maps = await Promise.all(order.slice(i, i + 4).map((f) => regionFile(f).catch(() => new Map())));
      for (const m of maps) { const r = m.get(String(p.id)); if (r && !full) full = { ...r, versanti: (r.versanti || []).slice() }; }
    }
  }
  return full;
}

/* full record (with sides and tracks) of a climb */
export async function getClimb(id) {
  const c = state && state.byId.get(String(id));
  if (!c) return null;
  if (c._full) return c;
  if (c.curated) {
    // sides the OSM twin has and the curated pass lacks (typically the foreign side of a border pass)
    for (const t of c.twins || []) {
      const r = await fullRecord(t).catch(() => null);
      const add = r ? newSidesFor(c, r.versanti) : [];
      if (add.length) c.versanti = (c.versanti || []).concat(add.map((v) => ({ ...v, fromOsm: true })));
    }
    c._full = true;
    return c;
  }
  const full = await fullRecord(c);
  if (full) {
    const vs = full.versanti || [];
    for (const o of c.co || []) {
      const r = await fullRecord(o).catch(() => null);
      for (const v of (r && r.versanti) || []) if (!vs.some((w) => sameOrigin(v, w))) vs.push(v);
    }
    Object.assign(c, { versanti: vs, surfaceLabel: full.surfaceLabel, trafFeriale: full.trafFeriale, trafWeekend: full.trafWeekend, trucks: full.trucks });
  }
  c._full = true;
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

/* unpaved: the pipeline's surface label ("🪨 Sterrato/gravel", "Misto"...) */
export function isGravel(c) { return /sterrato|gravel|misto|unpaved|dirt|ground|sand/i.test(String(c.surfaceLabel || "")); }

export function geojson(climbs) {
  return {
    type: "FeatureCollection",
    features: climbs.map((c) => ({ type: "Feature", id: undefined, properties: { id: String(c.id), name: c.name, d: c.difficulty || 0, ele: c.elevation || 0, cur: c.curated ? 1 : 0, gr: isGravel(c) ? 1 : 0 }, geometry: { type: "Point", coordinates: [c.lon, c.lat] } }))
  };
}

/* Nominatim (jsonv2) hit -> { name, sub, lat, lon, bb: [[w, s], [e, n]] | null } */
export function placeHit(h) {
  const lat = +h.lat, lon = +h.lon;
  if (!isFinite(lat) || !isFinite(lon)) return null;
  const parts = String(h.display_name || "").split(",").map((x) => x.trim()).filter(Boolean);
  const name = h.name || parts[0] || "";
  const sub = parts.filter((x) => x !== name && !/^\d{4,6}$/.test(x)).slice(0, 2).join(", ");
  const b = (h.boundingbox || []).map(Number);
  const bb = b.length === 4 && b.every(isFinite) ? [[b[2], b[0]], [b[3], b[1]]] : null;
  return { name, sub, lat, lon, bb };
}
