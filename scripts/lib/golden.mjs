/*
 * golden.mjs - shared logic for the "golden set" regression guard.
 *
 * The golden set is a small list of iconic passes whose *effective* climb data (what the
 * app actually shows after merging passes_data.js + curated_overrides.json + the OSM
 * region files) is frozen in test/golden/golden.json after a human review. Any later
 * build or code change that silently loses a versante, moves a summit, or distorts a
 * climb beyond tolerance fails the test (test/golden.test.mjs).
 *
 * Why: the dynamic base-rule regression that deleted Stelvio's Bormio versante passed
 * every schema check. Only a comparison against a known-good state catches that class.
 *
 * Scope: pipeline output only. manual_enriched.json / manual_overrides.json (in-app
 * editor) are NOT merged here - they are human-authored and applied on top at runtime.
 *
 * Used by: test/golden.test.mjs (compare), scripts/golden_snapshot.mjs (write baseline).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp } from "../../test/helpers/load-app.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const GOLDEN_FILE = path.join(ROOT, "test", "golden", "golden.json");
export const GOLDEN_LIST = path.join(ROOT, "test", "golden", "golden_list.json");

// Tolerances. Deliberately loose on "noise" (DEM resampling, a few snapped nodes) and
// strict on "structure" (a versante disappearing, a summit jumping).
export const TOL = {
  summitMoveKm: 0.5,        // summit position shift
  summitElevM: 50,          // summit elevation change
  originMatchKm: 2.0,       // a versante start within this distance counts as "the same versante"
  distRel: 0.15, distAbsKm: 1.5,   // distance_km: fail only if BOTH relative and absolute limits are exceeded
  gainRel: 0.10, gainAbsM: 80,     // elevation gain: same rule
  avgGradPts: 1.0,          // avgGradient in percentage points
  statsDropRel: 0.03        // whole-dataset counts may not drop more than 3%
};

export function havKm(lat1, lon1, lat2, lon2) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(path.join(ROOT, "data", file), "utf8")); } catch { return fallback; }
}

/* Build the effective dataset the app would show (minus manual editor overrides).
   Mirrors js/data.js: loadCuratedOverrides() + loadOsmBaked()/mergeColocated(). */
export async function loadEffective() {
  const app = await loadApp();
  const overrides = await readJson("curated_overrides.json", {});
  const curated = (app.PASSES_DATA || []).map((p0) => {
    const p = JSON.parse(JSON.stringify(p0));
    const ov = overrides[p.id];
    if (ov) {
      if (ov.lat) { p.lat = ov.lat; p.lon = ov.lon; }
      if (ov.versanti && ov.versanti.length) p.versanti = ov.versanti;
    }
    return { ...p, _src: "curated" };
  });
  const regions = await readJson("osm_regions.json", null);
  const files = Array.isArray(regions) && regions.length ? regions : ["osm_passes.json"];
  const parts = await Promise.all(files.map((f) => readJson(f, [])));
  const osmRaw = [].concat(...parts.map((x) => (Array.isArray(x) ? x : [])));
  // Mirror js/data.js adoptOsm(): OSM passes within ~800 m of a curated one are hidden, and the
  // curated pass adopts their clearly-different sides (newSidesFor, shared with the app).
  const merged = app.mergeColocated(JSON.parse(JSON.stringify(osmRaw)));
  const near = (a, b) => Math.abs(a.lat - b.lat) < 0.008 && Math.abs(a.lon - b.lon) < 0.008;
  const osm = [];
  for (const op of merged) {
    const c = curated.find((p) => near(p, op));
    if (!c) { osm.push({ ...op, _src: "osm" }); continue; }
    if (typeof app.newSidesFor === "function") {
      for (const v of app.newSidesFor(c, op)) (c.versanti = c.versanti || []).push({ ...v, fromOsm: true });
    }
  }
  return { curated, osm, all: curated.concat(osm), files };
}

/* Resolve a golden_list entry: { id } (exact, preferred) or { name } (case-insensitive).
   Returns { pass } or { error }. A name that matches several passes is an error on
   purpose - pin it with an id instead of guessing. */
export function resolveEntry(entry, data) {
  if (entry.id) {
    const p = data.all.find((x) => String(x.id) === String(entry.id));
    return p ? { pass: p } : { error: `id "${entry.id}" not found` };
  }
  const q = String(entry.name || "").trim().toLowerCase();
  if (!q) return { error: "entry has neither id nor name" };
  const exact = data.all.filter((x) => (x.name || "").toLowerCase() === q);
  const hits = exact.length ? exact : data.all.filter((x) => (x.name || "").toLowerCase().includes(q));
  if (!hits.length) return { error: `name "${entry.name}" not found` };
  if (hits.length > 1) {
    return { error: `name "${entry.name}" is ambiguous: ` + hits.slice(0, 6).map((h) => `${h.id} (${h.name}, ${h.elevation}m)`).join("; ") + " - pin it with {\"id\": ...}" };
  }
  return { pass: hits[0] };
}

/* Freeze one pass into a baseline record. */
export function snapshotPass(p, note) {
  return {
    id: String(p.id),
    name: p.name,
    src: p._src,
    note: note || undefined,
    summit: { lat: round(p.lat, 5), lon: round(p.lon, 5), elevation: p.elevation },
    versanti: (p.versanti || []).map((v) => ({
      side: v.side,
      startLat: round(v.startLat, 5), startLon: round(v.startLon, 5),
      distance_km: v.distance_km,
      gain: isNum(v.endElevation) && isNum(v.startElevation) ? v.endElevation - v.startElevation : null,
      avgGradient: v.avgGradient
    }))
  };
}

/* Compare the current pass against its baseline. Returns { errors, warnings }.
   errors fail the test; warnings are printed only. */
export function comparePass(base, cur, tol = TOL) {
  const errors = [], warnings = [];
  const tag = `${base.name} [${base.id}]`;
  if (!cur) return { errors: [`${tag}: pass SPARITO dal dataset`], warnings };

  const mv = havKm(base.summit.lat, base.summit.lon, cur.lat, cur.lon);
  if (mv > tol.summitMoveKm) errors.push(`${tag}: vetta spostata di ${(mv * 1000).toFixed(0)} m (max ${tol.summitMoveKm * 1000} m)`);
  if (isNum(base.summit.elevation) && isNum(cur.elevation) && Math.abs(cur.elevation - base.summit.elevation) > tol.summitElevM) {
    errors.push(`${tag}: quota vetta ${base.summit.elevation} -> ${cur.elevation} m (max ±${tol.summitElevM})`);
  }

  const curV = cur.versanti || [];
  if (curV.length < base.versanti.length) {
    errors.push(`${tag}: versanti ${base.versanti.length} -> ${curV.length} (un versante non deve MAI sparire)`);
  } else if (curV.length > base.versanti.length) {
    warnings.push(`${tag}: versanti ${base.versanti.length} -> ${curV.length} (nuovo versante? se corretto, aggiorna il baseline)`);
  }

  const used = new Set();
  for (const bv of base.versanti) {
    let best = -1, bestD = Infinity;
    curV.forEach((v, i) => {
      if (used.has(i) || !isNum(v.startLat) || !isNum(v.startLon)) return;
      const d = havKm(bv.startLat, bv.startLon, v.startLat, v.startLon);
      if (d < bestD) { bestD = d; best = i; }
    });
    const vtag = `${tag} / "${bv.side}"`;
    if (best < 0 || bestD > tol.originMatchKm) {
      errors.push(`${vtag}: versante non trovato (nessuna partenza entro ${tol.originMatchKm} km)`);
      continue;
    }
    used.add(best);
    const v = curV[best];
    if (outOfTol(bv.distance_km, v.distance_km, tol.distRel, tol.distAbsKm)) {
      errors.push(`${vtag}: distanza ${bv.distance_km} -> ${v.distance_km} km`);
    }
    const gain = isNum(v.endElevation) && isNum(v.startElevation) ? v.endElevation - v.startElevation : null;
    if (outOfTol(bv.gain, gain, tol.gainRel, tol.gainAbsM)) {
      errors.push(`${vtag}: dislivello ${bv.gain} -> ${gain} m`);
    }
    if (isNum(bv.avgGradient) && isNum(v.avgGradient) && Math.abs(v.avgGradient - bv.avgGradient) > tol.avgGradPts) {
      errors.push(`${vtag}: pendenza media ${bv.avgGradient} -> ${v.avgGradient} %`);
    }
    if (v.side !== bv.side) warnings.push(`${vtag}: etichetta cambiata in "${v.side}"`);
  }
  return { errors, warnings };
}

function outOfTol(a, b, rel, abs) {
  if (!isNum(a)) return false;          // nothing to compare against
  if (!isNum(b)) return true;           // value vanished
  const d = Math.abs(b - a);
  return d > abs && d > Math.abs(a) * rel;
}
function isNum(x) { return typeof x === "number" && Number.isFinite(x); }
function round(x, n) { return isNum(x) ? Math.round(x * 10 ** n) / 10 ** n : x; }

/* Whole-dataset counters: catch mass regressions OUTSIDE the ~20 golden passes
   (e.g. a threshold change that silently empties 300 minor climbs). */
export function datasetStats(data) {
  const withV = (arr) => arr.filter((p) => p.versanti && p.versanti.length).length;
  const nV = (arr) => arr.reduce((s, p) => s + ((p.versanti && p.versanti.length) || 0), 0);
  return {
    curated: data.curated.length,
    osm: data.osm.length,
    osmEnriched: withV(data.osm),
    versantiTotal: nV(data.all)
  };
}

export function compareStats(base, cur, tol = TOL) {
  const errors = [], warnings = [];
  if (!base) return { errors, warnings };
  for (const k of Object.keys(base)) {
    const a = base[k], b = cur[k];
    if (!isNum(a) || !isNum(b) || a === 0) continue;
    const rel = (b - a) / a;
    if (rel < -tol.statsDropRel) errors.push(`dataset: ${k} ${a} -> ${b} (${(rel * 100).toFixed(1)}%, max -${tol.statsDropRel * 100}%)`);
    else if (Math.abs(rel) > 0.1) warnings.push(`dataset: ${k} ${a} -> ${b} (${(rel * 100).toFixed(1)}%)`);
  }
  return { errors, warnings };
}
