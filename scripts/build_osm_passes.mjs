#!/usr/bin/env node
/*
 * build_osm_passes.mjs
 * ---------------------------------------------------------------------------
 * Offline builder for locaClimb's OSM pass database (osm_passes.json).
 *
 * What it does (mirrors the in-browser logic in index.html so the output is
 * adopted as-is by adoptOsm() with no client-side rework):
 *   1. Query Overpass for mountain_pass nodes + the highways they sit on.
 *   2. Drop hiking-only passes (gravel-bike filter = classifyWay()).
 *   3. For each rideable pass, derive climb data (versanti): walk the road
 *      outward from the summit both ways, sample elevation (Open-Meteo),
 *      compute distance / gain / avg+max gradient / exposure / profile / track.
 *   4. Merge with any existing osm_passes.json (incremental, idempotent) and
 *      write the result back so it can be committed to the repo.
 *
 * Node 22+ (uses global fetch). No external dependencies. 100% ASCII.
 *
 * Usage:
 *   node scripts/build_osm_passes.mjs [--out PATH] [--max N] [--bbox S,W,N,E]
 *                                     [--reenrich] [--min-ele M]
 *
 *   --out PATH     output file (default: osm_passes.json)
 *   --max N        max passes to ENRICH this run (rate-limit guard; default 60)
 *   --bbox ...     Overpass bounding box (default 44.0,6.5,47.5,13.5 = Alps/N.Italy)
 *   --min-ele M    minimum summit elevation in meters (default 200)
 *   --reenrich     recompute versanti even for passes already enriched
 * ---------------------------------------------------------------------------
 */

import { readFile, writeFile } from "node:fs/promises";

/* ----- config / args ----------------------------------------------------- */
const OVERPASS = "https://overpass-api.de/api/interpreter";
const ELEV_API = "https://api.open-meteo.com/v1/elevation";

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const OUT = arg("--out", "osm_passes.json");
const MAX_ENRICH = parseInt(arg("--max", "60"), 10);
const MIN_ELE = parseInt(arg("--min-ele", "200"), 10);
const BBOX = arg("--bbox", "44.0,6.5,47.5,13.5");
const REENRICH = process.argv.includes("--reenrich");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ----- geo helpers (ported verbatim from index.html) --------------------- */
function hav(la1, lo1, la2, lo2) {
  const R = 6371, p = Math.PI / 180;
  const dLa = (la2 - la1) * p, dLo = (lo2 - lo1) * p;
  const x = Math.sin(dLa / 2) ** 2 +
    Math.cos(la1 * p) * Math.cos(la2 * p) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function compass(la1, lo1, la2, lo2) {
  const p = Math.PI / 180;
  const y = Math.sin((lo2 - lo1) * p) * Math.cos(la2 * p);
  const x = Math.cos(la1 * p) * Math.sin(la2 * p) -
    Math.sin(la1 * p) * Math.cos(la2 * p) * Math.cos((lo2 - lo1) * p);
  const br = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  const d = ["Nord", "Nord-Est", "Est", "Sud-Est", "Sud", "Sud-Ovest", "Ovest", "Nord-Ovest"];
  return d[Math.round(br / 45) % 8];
}
function estDiff(distKm, gain, top) {
  if (!distKm || distKm <= 0) return 1;
  const avg = gain / (distKm * 10);
  let d = avg * 0.85;
  d += Math.min(distKm / 6, 2.5);
  if (avg >= 12) d += 2; else if (avg >= 9) d += 1;
  if (top >= 2000) d += 1;
  return Math.max(1, Math.min(10, Math.round(d)));
}

/* ----- gravel-bike filter (ported verbatim) ------------------------------ */
function classifyWay(t) {
  if (!t) return null;
  const hw = t.highway;
  const bad = { path: 1, footway: 1, steps: 1, pedestrian: 1, bridleway: 1, corridor: 1, construction: 1, proposed: 1, raceway: 1, via_ferrata: 1 };
  if (!hw || bad[hw]) return null;
  if (t.bicycle === "no" || t.bicycle === "dismount") return null;
  if (t.access === "private" || t.access === "no") return null;
  if (t["mtb:scale"]) return null;
  const bs = { sand: 1, mud: 1, rock: 1, pebblestone: 1, grass: 1 };
  if (t.surface && bs[t.surface]) return null;
  return { hw, surface: t.surface || "", tags: t };
}
/* OSM road class -> traffic scores (feriale/weekend 1-10) + truck likelihood */
const TRAF_BASE = { cycleway: 1, track: 1, path: 1, service: 2, residential: 2, living_street: 2, unclassified: 3, tertiary: 3, tertiary_link: 3, secondary: 4, secondary_link: 4, primary: 6, primary_link: 6, trunk: 8, trunk_link: 8 };
function computeTraffic(t, elev) {
  const hw = (t && t.highway) || "tertiary";
  const base = TRAF_BASE[hw] != null ? TRAF_BASE[hw] : 3;
  // tourist/weekend spike on real climbs and bigger roads
  const tour = (elev >= 1500 || base >= 4) ? 2 : 1;
  const wkd = Math.min(10, base + tour);
  // trucks from restrictions / road class
  let trucks = "rari";
  const mw = parseFloat(t && (t.maxweight || t.maxweightrating)) || 0;
  if ((t && (t.hgv === "no" || t.hgv === "destination")) || (mw > 0 && mw < 7.5) || hw === "track" || hw === "cycleway") trucks = "no";
  else if (hw === "primary" || hw === "trunk") trucks = (t && t.hgv === "yes") ? "si" : "possibili";
  else if (hw === "secondary") trucks = "possibili";
  return { fer: base, wkd, trucks };
}
function surfaceLabelFromWay(t) {
  if (!t) return "";
  const s = t.surface || "", hw = t.highway || "";
  if (s === "asphalt" || s === "paved" || s === "concrete") return "&#x1F6E3;&#xFE0F; Asfalto";
  if (s === "compacted" || s === "fine_gravel" || s === "gravel" || hw === "track") return "&#x1FAA8; Sterrato/gravel";
  if (s) return "Fondo: " + s;
  return "";
}

/* ----- climb-derivation pipeline (ported verbatim) ----------------------- */
function closestIdx(geom, lat, lon) {
  let bi = -1, bd = 1e9;
  for (let i = 0; i < geom.length; i++) {
    const d = hav(lat, lon, geom[i].lat, geom[i].lon);
    if (d < bd) { bd = d; bi = i; }
  }
  return bd < 0.4 ? bi : -1;
}
function collectSide(geom, idx, dir) {
  const pts = [];
  let dist = 0, prev = geom[idx];
  pts.push({ lat: geom[idx].lat, lon: geom[idx].lon });
  for (let i = idx + dir; i >= 0 && i < geom.length; i += dir) {
    const g = geom[i];
    dist += hav(prev.lat, prev.lon, g.lat, g.lon);
    pts.push({ lat: g.lat, lon: g.lon });
    prev = g;
    if (dist >= 16) break;
  }
  if (pts.length > 80) {
    const out = [], n = 80;
    for (let k = 0; k < n; k++) out.push(pts[Math.round(k * (pts.length - 1) / (n - 1))]);
    return out;
  }
  return pts;
}
function buildVersante(pts, elevs, topLat, topLon) {
  if (!elevs || elevs.length !== pts.length) return null;
  let bi = 0;
  for (let i = 1; i < elevs.length; i++) if (elevs[i] < elevs[bi]) bi = i;
  if (bi < 2) return null;
  const seg = pts.slice(0, bi + 1).reverse();
  const se = elevs.slice(0, bi + 1).reverse();
  let dist = 0;
  for (let i = 1; i < seg.length; i++) dist += hav(seg[i - 1].lat, seg[i - 1].lon, seg[i].lat, seg[i].lon);
  if (dist < 1.5) return null;
  const gain = se[se.length - 1] - se[0];
  if (gain < 200) return null;
  let maxg = 0;
  for (let i = 1; i < seg.length; i++) {
    const dd = hav(seg[i - 1].lat, seg[i - 1].lon, seg[i].lat, seg[i].lon) * 1000;
    if (dd > 80) { const g = (se[i] - se[i - 1]) / dd * 100; if (g > maxg) maxg = g; }
  }
  const dir = compass(seg[0].lat, seg[0].lon, topLat, topLon);
  const prof = [], n = Math.min(se.length, 18);
  for (let i = 0; i < n; i++) prof.push(Math.round(se[Math.round(i * (se.length - 1) / (n - 1))]));
  return {
    side: "Versante " + dir,
    startLat: seg[0].lat, startLon: seg[0].lon,
    startElevation: Math.round(se[0]),
    endElevation: Math.round(se[se.length - 1]),
    distance_km: Math.round(dist * 10) / 10,
    avgGradient: Math.round(gain / (dist * 1000) * 1000) / 10,
    maxGradient: Math.round(maxg * 10) / 10,
    traffic: "n/d",
    exposure: dir,
    elevationProfile: prof,
    track: seg.map((s) => [s.lat, s.lon])
  };
}

/* ----- network with retry/backoff ---------------------------------------- */
async function getJSON(url, label, tries = 4) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "locaClimb-builder/1.0 (github action)" } });
      if (r.status === 429 || r.status === 504 || r.status === 502) throw new Error("HTTP " + r.status);
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) {
      const wait = Math.min(30000, 2000 * 2 ** (attempt - 1));
      console.warn("  ! " + label + " attempt " + attempt + " failed (" + e.message + "), retry in " + (wait / 1000) + "s");
      if (attempt === tries) throw e;
      await sleep(wait);
    }
  }
}
function postOverpass(query) {
  return fetch(OVERPASS, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "locaClimb-builder/1.0" },
    body: "data=" + encodeURIComponent(query)
  }).then((r) => { if (!r.ok) throw new Error("Overpass HTTP " + r.status); return r.json(); });
}

async function fetchElevs(pts) {
  // Open-Meteo elevation accepts up to 100 coords per call.
  const out = [];
  for (let i = 0; i < pts.length; i += 100) {
    const chunk = pts.slice(i, i + 100);
    const la = chunk.map((p) => p.lat.toFixed(5)).join(",");
    const lo = chunk.map((p) => p.lon.toFixed(5)).join(",");
    const d = await getJSON(ELEV_API + "?latitude=" + la + "&longitude=" + lo, "elevation");
    if (!d || !d.elevation) return null;
    out.push(...d.elevation);
    await sleep(400);
  }
  return out;
}

/* ----- enrich one pass (Overpass geom -> elevation -> versanti) ---------- */
async function enrichPass(op) {
  const nid = ("" + op.id).replace(/^osm-/, "");
  if (!/^\d+$/.test(nid)) return false;
  const q = "[out:json][timeout:25];node(" + nid + ")->.n;way(bn.n)[\"highway\"];out geom tags;";
  const data = await postOverpass(q);
  await sleep(1100); // be polite to Overpass between enrich calls
  const ways = (data.elements || []).filter((e) => e.type === "way" && e.geometry && e.geometry.length > 2);
  if (!ways.length) return false;
  let best = null, bestLen = 0;
  for (const w of ways) {
    const idx = closestIdx(w.geometry, op.lat, op.lon);
    if (idx < 0) continue;
    if (w.geometry.length > bestLen) { bestLen = w.geometry.length; best = { w, idx }; }
  }
  if (!best) return false;
  const w = best.w, idx = best.idx;
  const surfLabel = surfaceLabelFromWay(w.tags);
  const sidePts = [collectSide(w.geometry, idx, -1), collectSide(w.geometry, idx, 1)]
    .filter((s) => s && s.length >= 4);
  if (!sidePts.length) return false;
  const vs = [];
  for (const pts of sidePts) {
    const ev = await fetchElevs(pts);
    if (!ev) continue;
    const v = buildVersante(pts, ev, op.lat, op.lon);
    if (v) vs.push(v);
  }
  if (!vs.length) return false;
  vs.sort((a, b) => b.distance_km - a.distance_km);
  const top2 = vs.slice(0, 2);
  op.versanti = top2;
  op.difficulty = Math.max(...top2.map((v) => estDiff(v.distance_km, v.endElevation - v.startElevation, v.endElevation)));
  op.surfaceLabel = surfLabel || op.surfaceLabel || "";
  return true;
}

/* ----- main -------------------------------------------------------------- */
async function main() {
  console.log("locaClimb OSM builder");
  console.log("  bbox=" + BBOX + " minEle=" + MIN_ELE + " maxEnrich=" + MAX_ENRICH + " reenrich=" + REENRICH);

  // 1. load existing db (incremental)
  let existing = [];
  try { existing = JSON.parse(await readFile(OUT, "utf8")); } catch { existing = []; }
  const byId = new Map(existing.map((p) => [p.id, p]));
  console.log("  loaded " + existing.length + " existing passes from " + OUT);

  // 2. Overpass: pass nodes + connected highways
  const q = '[out:json][timeout:120];(node["mountain_pass"="yes"](' + BBOX + ');)->.p;way(bn.p)["highway"];(.p;._;);out body;';
  console.log("  querying Overpass for pass nodes + ways ...");
  const data = await postOverpass(q);
  const nodes = [], ways = [];
  for (const el of (data.elements || [])) {
    if (el.type === "node" && el.tags && el.tags.mountain_pass) nodes.push(el);
    else if (el.type === "way") ways.push(el);
  }
  const wayByNode = {};
  for (const w of ways) if (w.nodes) for (const nid of w.nodes) (wayByNode[nid] = wayByNode[nid] || []).push(w);
  console.log("  got " + nodes.length + " pass nodes, " + ways.length + " ways");

  // 3. filter -> rideable passes, build/refresh base records
  let skippedHiking = 0, kept = 0;
  const order = [];
  for (const el of nodes) {
    const elev = el.tags.ele ? parseInt(el.tags.ele, 10) : 0;
    if (isNaN(elev) || elev < MIN_ELE) continue;
    const cw = wayByNode[el.id] || [];
    let ride = null;
    for (const c of cw) { const r = classifyWay(c.tags); if (r) { ride = r; break; } }
    if (cw.length > 0 && !ride) { skippedHiking++; continue; }
    const id = "osm-" + el.id;
    const name = (el.tags.name || "Passo").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const surfLabel = ride
      ? surfaceLabelFromWay(ride.hw === "track" ? { highway: "track", surface: ride.surface } : { surface: ride.surface || "asphalt" })
      : "";
    const prev = byId.get(id);
    const rec = prev || { id, name, lat: el.lat, lon: el.lon, elevation: elev };
    // refresh base fields (name/coords/elevation may have changed in OSM)
    rec.name = name; rec.lat = el.lat; rec.lon = el.lon; rec.elevation = elev;
    if (!rec.surfaceLabel) rec.surfaceLabel = surfLabel;
    // traffic + trucks from the rideable way's tags
    if (ride) {
      const tr = computeTraffic(ride.tags, elev);
      rec.trafFeriale = tr.fer; rec.trafWeekend = tr.wkd; rec.trucks = tr.trucks;
    } else if (rec.trafFeriale == null) {
      rec.trafFeriale = 3; rec.trafWeekend = elev >= 1500 ? 5 : 4; rec.trucks = "rari";
    }
    byId.set(id, rec);
    order.push(id);
    kept++;
  }
  console.log("  kept " + kept + " rideable passes, skipped " + skippedHiking + " hiking-only");

  // 4. enrich (only those missing versanti, unless --reenrich), capped by --max
  const toEnrich = order.filter((id) => REENRICH || !(byId.get(id).versanti && byId.get(id).versanti.length));
  const batch = toEnrich.slice(0, MAX_ENRICH);
  console.log("  enriching " + batch.length + " passes (" + (toEnrich.length - batch.length) + " deferred to next run)");
  let ok = 0, fail = 0;
  for (let i = 0; i < batch.length; i++) {
    const op = byId.get(batch[i]);
    process.stdout.write("  [" + (i + 1) + "/" + batch.length + "] " + op.name + " (" + op.elevation + "m) ... ");
    try {
      const done = await enrichPass(op);
      if (done) { ok++; console.log("ok (" + op.versanti.length + " versanti, diff " + op.difficulty + ")"); }
      else { fail++; op.enrichFailed = true; console.log("no climb data"); }
    } catch (e) {
      fail++; console.log("error: " + e.message);
    }
  }

  // 5. write back, sorted by elevation desc for stable diffs
  const result = [...byId.values()].sort((a, b) => (b.elevation || 0) - (a.elevation || 0));
  await writeFile(OUT, JSON.stringify(result, null, 1) + "\n", "utf8");
  const enriched = result.filter((p) => p.versanti && p.versanti.length).length;
  console.log("DONE: " + result.length + " passes total, " + enriched + " enriched. enriched-now=" + ok + " failed-now=" + fail);
  console.log("  wrote " + OUT);
}

main().catch((e) => { console.error("FATAL: " + e.stack); process.exit(1); });
