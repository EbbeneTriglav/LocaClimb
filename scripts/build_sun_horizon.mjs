#!/usr/bin/env node
/*
 * build_sun_horizon.mjs - bake the TERRAIN HORIZON seen from each climb.
 * ---------------------------------------------------------------------------
 * For every versante it samples N points along the existing track and, at each
 * point, measures:
 *   - the horizon elevation angle in 16 azimuth sectors (how high the ridges
 *     around it stand), by walking rays out to 10 km over the Terrarium DEM;
 *   - the local slope angle and aspect, from a DEM stencil around the point.
 * The frontend (js/sunexposure.js) then answers "how much sun does this climb
 * get on day X" for any date, with no runtime DEM traffic.
 *
 * Read-only on the pass data: it never touches osm_passes.json, it only writes
 * data/sun_horizon.json. Deleting that file reverts the feature to its estimate.
 *
 *   node scripts/build_sun_horizon.mjs                 # resume, skip done keys
 *   node scripts/build_sun_horizon.mjs --only stelvio  # one pass (id substring)
 *   node scripts/build_sun_horizon.mjs --force         # recompute everything
 *   node scripts/build_sun_horizon.mjs --limit 50      # first 50 passes only
 *
 * Requires: pngjs (npm), Node 18+ (global fetch). 100% ASCII.
 */
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dataPath } from "./lib/paths.mjs";
const { PNG } = createRequire(import.meta.url)("pngjs");

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const has = (n) => process.argv.indexOf(n) >= 0;

const OUT = dataPath(arg("--out", "sun_horizon.json"));
const ONLY = arg("--only", "");
const LIMIT = parseInt(arg("--limit", "0"), 10) || 0;
const FORCE = has("--force");

const DEM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";
const DEM_Z = 12;                 // ~39 m/px at 45N: fine enough for ridge lines, cheap on tiles
const AZ_N = 16;                  // azimuth sectors (22.5 deg each)
const N_PTS = 7;                  // sample points per versante
const STENCIL = 150;              // m, half-width of the slope/aspect stencil
const RAYS_KM = [0.15, 0.3, 0.6, 1, 1.6, 2.5, 4, 6, 8, 10];
const R_EFF = 6371000 / 0.87;     // earth radius corrected for atmospheric refraction (k=0.13)
const TILE_CAP = 500;             // decoded tiles held in RAM (~130 MB) - keeps CI well clear of OOM
const SAVE_EVERY = 25;

function hav(la1, lo1, la2, lo2) {
  const R = 6371, p = Math.PI / 180;
  const dLa = (la2 - la1) * p, dLo = (lo2 - lo1) * p;
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * p) * Math.cos(la2 * p) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/* ----- Terrarium DEM -------------------------------------------------------- */
const demCache = new Map();
function demTile(z, x, y) {
  const k = z + "/" + x + "/" + y;
  if (demCache.has(k)) { const v = demCache.get(k); demCache.delete(k); demCache.set(k, v); return v; } // LRU touch
  const p = (async function () {
    let png = null;
    for (let a = 0; a < 3 && !png; a++) {
      try {
        const r = await fetch(DEM_URL + "/" + k + ".png");
        if (!r.ok) throw new Error("HTTP " + r.status);
        png = PNG.sync.read(Buffer.from(await r.arrayBuffer()));
      } catch (e) {
        if (a === 2) console.warn("  ! dem " + k + ": " + e.message);
        else await new Promise((s) => setTimeout(s, 700 * (a + 1)));
      }
    }
    return png;
  })();
  while (demCache.size >= TILE_CAP) demCache.delete(demCache.keys().next().value);
  demCache.set(k, p);
  return p;
}
async function elevAt(lat, lon) {
  if (!(lat > -85 && lat < 85)) return null;
  const z = DEM_Z, n = 1 << z;
  const fx = (lon + 180) / 360 * n;
  const r = lat * Math.PI / 180;
  const fy = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n;
  const tx = Math.floor(fx), ty = Math.floor(fy);
  const png = await demTile(z, tx, ty);
  if (!png) return null;
  const px = Math.min(png.width - 1, Math.max(0, Math.floor((fx - tx) * png.width)));
  const py = Math.min(png.height - 1, Math.max(0, Math.floor((fy - ty) * png.height)));
  const i = (py * png.width + px) * 4;
  return (png.data[i] * 256 + png.data[i + 1] + png.data[i + 2] / 256) - 32768;
}

/* local metres -> degrees; flat-earth offsets are accurate well past our 10 km rays */
const dLat = (m) => m / 111320;
const dLon = (m, lat) => m / (111320 * Math.cos(lat * Math.PI / 180));

/* ----- per-point measurements ---------------------------------------------- */
async function slopeAspect(lat, lon) {
  const la = dLat(STENCIL), lo = dLon(STENCIL, lat);
  const [e, w, n, s] = await Promise.all([
    elevAt(lat, lon + lo), elevAt(lat, lon - lo), elevAt(lat + la, lon), elevAt(lat - la, lon)
  ]);
  if (e == null || w == null || n == null || s == null) return { asp: 0, slp: 0 };
  const dzdx = (e - w) / (2 * STENCIL);          // rise per metre toward east
  const dzdy = (n - s) / (2 * STENCIL);          // rise per metre toward north
  const slp = Math.atan(Math.hypot(dzdx, dzdy)) * 180 / Math.PI;
  // aspect = compass bearing of the downhill direction = the way the slope faces
  const asp = (Math.atan2(-dzdx, -dzdy) * 180 / Math.PI + 360) % 360;
  return { asp: Math.round(asp), slp: Math.round(Math.min(45, slp)) };
}

async function horizon(lat, lon, e0) {
  const hz = [];
  for (let a = 0; a < AZ_N; a++) {
    const az = a * 360 / AZ_N, rad = az * Math.PI / 180;
    let best = 0;
    for (const km of RAYS_KM) {
      const d = km * 1000;
      const e = await elevAt(lat + dLat(d * Math.cos(rad)), lon + dLon(d * Math.sin(rad), lat));
      if (e == null) continue;
      const drop = d * d / (2 * R_EFF);                       // curvature + refraction
      const ang = Math.atan2(e - e0 - drop, d) * 180 / Math.PI;
      if (ang > best) best = ang;
    }
    hz.push(Math.round(best * 10) / 10);
  }
  return hz;
}

/* sample N_PTS points evenly by distance along a base->summit track */
function samplePoints(track) {
  const cum = [0];
  for (let i = 1; i < track.length; i++) cum.push(cum[i - 1] + hav(track[i - 1][0], track[i - 1][1], track[i][0], track[i][1]));
  const tot = cum[cum.length - 1];
  if (!(tot > 0)) return [];
  const out = [];
  for (let k = 0; k < N_PTS; k++) {
    const target = tot * k / (N_PTS - 1);
    let i = 1; while (i < cum.length - 1 && cum[i] < target) i++;
    out.push(track[i]);
  }
  return out;
}

async function doVersante(v) {
  const tr = v.track;
  if (!Array.isArray(tr) || tr.length < 4) return null;
  const pts = samplePoints(tr);
  if (!pts.length) return null;
  const rows = [];
  for (const c of pts) {
    const e0 = await elevAt(c[0], c[1]);
    if (e0 == null) return null;
    const sa = await slopeAspect(c[0], c[1]);
    const hz = await horizon(c[0], c[1], e0);
    rows.push([+c[0].toFixed(5), +c[1].toFixed(5), hz, sa.asp, sa.slp]);
  }
  return rows;
}

/* ----- sources -------------------------------------------------------------- */
async function loadPasses() {
  const all = [];
  /* i passi OSM stanno in un file per regione (osm_passes_XX.json), elencati dal
     manifest osm_regions.json: leggerli tutti, non solo il vecchio file unico. */
  const files = [];
  try {
    const man = JSON.parse(await readFile(dataPath("osm_regions.json"), "utf8"));
    const list = Array.isArray(man) ? man : (man.regions || man.files || []);
    list.forEach((r) => {
      const n = typeof r === "string" ? r : (r.file || r.name || r.id);
      if (n) files.push(String(n).endsWith(".json") ? n : "osm_passes_" + n + ".json");
    });
  } catch (e) { console.warn("  ! osm_regions.json: " + e.message); }
  if (!files.length) files.push("osm_passes.json");        // fallback al file unico
  let nOsm = 0;
  for (const fn of files) {
    try {
      const osm = JSON.parse(await readFile(dataPath(fn), "utf8"));
      const arr = Array.isArray(osm) ? osm : (osm.passes || []);
      arr.forEach((p) => all.push(p)); nOsm += arr.length;
    } catch (e) { console.warn("  ! " + fn + ": " + e.message); }
  }
  console.log("  regioni OSM lette: " + files.length + " file, " + nOsm + " passi");
  try {
    const src = await readFile(dataPath("passes_data.js"), "utf8");
    const cur = new Function(src + "\nreturn typeof PASSES_DATA!=='undefined'?PASSES_DATA:[];")();
    cur.forEach((p) => all.push(p));
  } catch (e) { console.warn("  ! passes_data.js: " + e.message); }
  for (const f of ["manual_enriched.json", "manual_overrides.json"]) {
    try {
      const mo = JSON.parse(await readFile(dataPath(f), "utf8"));
      Object.keys(mo).forEach((id) => all.push(Object.assign({ id }, mo[id])));
      break;                                   // enriched wins; only read overrides if it is missing
    } catch (e) { /* optional */ }
  }
  const seen = new Set(), out = [];
  for (const p of all) {
    if (!p || !p.id || !Array.isArray(p.versanti) || !p.versanti.length) continue;
    const k = p.id + "|" + p.versanti.map((v) => v.side).join(",");
    if (seen.has(k)) continue;
    seen.add(k); out.push(p);
  }
  return out;
}

/* ----- main ----------------------------------------------------------------- */
async function main() {
  let store = { v: 1, z: DEM_Z, az: AZ_N, rays_km: RAYS_KM[RAYS_KM.length - 1], built: "", p: {} };
  if (!FORCE) {
    try { const old = JSON.parse(await readFile(OUT, "utf8")); if (old && old.p) store.p = old.p; } catch (e) { /* first run */ }
  }
  let passes = await loadPasses();
  if (ONLY) passes = passes.filter((p) => String(p.id).indexOf(ONLY) >= 0 || String(p.name || "").toLowerCase().indexOf(ONLY.toLowerCase()) >= 0);
  if (LIMIT) passes = passes.slice(0, LIMIT);
  console.log("sun horizon: " + passes.length + " passi, DEM z" + DEM_Z + ", " + N_PTS + " punti x " + AZ_N + " settori");
  const withTrack = passes.filter((p) => p.versanti.some((v) => Array.isArray(v.track) && v.track.length >= 4)).length;
  console.log("  con tracciato utilizzabile: " + withTrack + "/" + passes.length);
  if (!withTrack) { console.error("FATAL: nessun versante ha un track[] nei dati su disco: i tracciati sono costruiti lato browser, qui non c'e' niente da campionare."); process.exit(2); }

  const save = async () => {
    store.built = new Date().toISOString().slice(0, 10);
    await writeFile(OUT, JSON.stringify(store) + "\n", "utf8");
  };

  let done = 0, skipped = 0, failed = 0;
  for (let i = 0; i < passes.length; i++) {
    const p = passes[i];
    for (const v of p.versanti) {
      const key = p.id + "|" + (v.side || "");
      if (!FORCE && store.p[key]) { skipped++; continue; }
      try {
        const rows = await doVersante(v);
        if (rows) { store.p[key] = rows; done++; } else { failed++; }
      } catch (e) { failed++; console.warn("  ! " + key + ": " + e.message); }
    }
    if (i % SAVE_EVERY === SAVE_EVERY - 1) { await save(); console.log("  " + (i + 1) + "/" + passes.length + " passi (" + done + " versanti nuovi)"); }
  }
  await save();
  console.log("fatto: " + done + " calcolati, " + skipped + " gia' presenti, " + failed + " saltati -> " + OUT);
}
main().catch((e) => { console.error("FATAL: " + e.stack); process.exit(1); });
