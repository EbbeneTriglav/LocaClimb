#!/usr/bin/env node
/*
 * build_osm_passes.mjs  (v3 - Geofabrik PBF + Terrarium DEM, fully offline)
 * ---------------------------------------------------------------------------
 * No Overpass, no Open-Meteo: deterministic build, no rate limits.
 *  1. Download Geofabrik PBF extracts (cached between runs if kept).
 *  2. osmium tags-filter -> mountain passes + rideable highways.
 *  3. osmium export -> geojsonseq, streamed in Node (low memory).
 *  4. Keep ways near passes (grid index), vertex graph by coords.
 *  5. Snap pass to road, walk outward, elevations from Terrarium terrain
 *     tiles (AWS Open Data, decoded locally via pngjs), trim climb base,
 *     build versanti + category + traffic. Also regenerates curated passes.
 * Requirements (CI): osmium-tool (apt), pngjs (npm). Node 22+. 100% ASCII.
 * Usage: node scripts/build_osm_passes.mjs [--out F] [--min-ele M] [--max N]
 *        [--skip-download] [--no-curated] [--reenrich]
 */
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { createInterface } from "node:readline";
import { execFileSync } from "node:child_process";
import { Readable } from "node:stream";
import vm from "node:vm";
import { createRequire } from "node:module";
const { PNG } = createRequire(import.meta.url)("pngjs");

const PBF_URLS = [
  "https://download.geofabrik.de/europe/italy/nord-ovest-latest.osm.pbf",
  "https://download.geofabrik.de/europe/italy/nord-est-latest.osm.pbf",
  "https://download.geofabrik.de/europe/italy/centro-latest.osm.pbf"
];
const DEM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";
const DEM_Z = 12;
const HW_KEEP = ["primary","primary_link","secondary","secondary_link","tertiary","tertiary_link","unclassified","unclassified_link"];

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const OUT = arg("--out", "osm_passes.json");
const MIN_ELE = parseInt(arg("--min-ele", "200"), 10);
const MAX_ENRICH = parseInt(arg("--max", "100000"), 10);
const SKIP_DL = process.argv.includes("--skip-download");
const NO_CURATED = process.argv.includes("--no-curated");
const REENRICH = process.argv.includes("--reenrich");
// Bump this whenever the climb-building algorithm changes: every cached OSM pass whose
// rec.algo != ALGO_VERSION is regenerated exactly once, then stamped and skipped on later
// runs. This propagates algorithm fixes (e.g. valley-trim) without a manual --reenrich,
// and without re-doing the heavy work every month. (Curated + extra climbs always rebuild.)
const ALGO_VERSION = "v3.1-valleytrim";
const WORK = "build_tmp";

/* ----- geo + scoring helpers ---------------------------------------------- */
function hav(la1, lo1, la2, lo2) {
  const R = 6371, p = Math.PI / 180;
  const dLa = (la2 - la1) * p, dLo = (lo2 - lo1) * p;
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * p) * Math.cos(la2 * p) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function compass(la1, lo1, la2, lo2) {
  const p = Math.PI / 180;
  const y = Math.sin((lo2 - lo1) * p) * Math.cos(la2 * p);
  const x = Math.cos(la1 * p) * Math.sin(la2 * p) - Math.sin(la1 * p) * Math.cos(la2 * p) * Math.cos((lo2 - lo1) * p);
  const br = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  return ["Nord","Nord-Est","Est","Sud-Est","Sud","Sud-Ovest","Ovest","Nord-Ovest"][Math.round(br / 45) % 8];
}
function estDiff(distKm, gain, top) {
  if (!distKm || distKm <= 0) return 1;
  const avg = gain / (distKm * 10);
  let d = avg * 0.85 + Math.min(distKm / 6, 2.5);
  if (avg >= 12) d += 2; else if (avg >= 9) d += 1;
  if (top >= 2000) d += 1;
  return Math.max(1, Math.min(10, Math.round(d)));
}
function nameTokens(n) {
  return (n || "").toLowerCase()
    .replace(/passo|colle|col|della|dello|del|di|monte|giogo|sella|forcella/g, " ")
    .split(/[^a-zaeiou']+/i).map((t) => t.trim()).filter((t) => t.length > 3);
}
function catRank(c) { return { HC: 5, "1": 4, "2": 3, "3": 2, "4": 1 }[c] || 0; }
function climbCat(distKm, gain, top) {
  if (gain < 150 || distKm < 1) return null;
  const f = (gain * gain) / (distKm * 1000 * 10) + Math.max(0, top - 1000) / 1000;
  if (f >= 8) return "HC"; if (f >= 5.5) return "1"; if (f >= 3.5) return "2"; if (f >= 2) return "3"; return "4";
}
const BAD_SURF = { sand:1, mud:1, rock:1, pebblestone:1, grass:1, woodchips:1, salt:1 };
function rideable(t) {
  if (!t || !t.highway) return false;
  if (t.motorroad === "yes") return false;
  if (t.bicycle === "no" || t.bicycle === "dismount") return false;
  if (t.access === "private" || t.access === "no") return false;
  if (t["mtb:scale"]) return false;
  if (t.surface && BAD_SURF[t.surface]) return false;
  if (t.tracktype === "grade4" || t.tracktype === "grade5") return false;
  if (t.smoothness && { very_bad:1, horrible:1, very_horrible:1, impassable:1 }[t.smoothness]) return false;
  return true;
}
function surfaceLabel(t) {
  const s = (t && t.surface) || "", hw = (t && t.highway) || "";
  if (s === "asphalt" || s === "paved" || s === "concrete") return "&#x1F6E3;&#xFE0F; Asfalto";
  if (s === "compacted" || s === "fine_gravel" || s === "gravel" || hw === "track") return "&#x1FAA8; Sterrato/gravel";
  if (s) return "Fondo: " + s;
  return "";
}
const TRAF_BASE = { cycleway:1, track:1, service:2, residential:2, living_street:2, unclassified:3, tertiary:3, tertiary_link:3, secondary:4, secondary_link:4, primary:6, primary_link:6 };
function computeTraffic(t, elev) {
  const hw = (t && t.highway) || "tertiary";
  const base = TRAF_BASE[hw] != null ? TRAF_BASE[hw] : 3;
  const tour = (elev >= 1500 || base >= 4) ? 2 : 1;
  let trucks = "rari";
  const mw = parseFloat(t && (t.maxweight || t.maxweightrating)) || 0;
  if ((t && (t.hgv === "no" || t.hgv === "destination")) || (mw > 0 && mw < 7.5) || hw === "track" || hw === "cycleway") trucks = "no";
  else if (hw === "primary") trucks = (t && t.hgv === "yes") ? "si" : "possibili";
  else if (hw === "secondary") trucks = "possibili";
  return { fer: base, wkd: Math.min(10, base + tour), trucks };
}

/* ----- Terrarium DEM (local decode, no rate limits) ------------------------ */
const demCache = new Map();
async function demTile(z, x, y) {
  const k = z + "/" + x + "/" + y;
  if (demCache.has(k)) return demCache.get(k);
  let png = null;
  for (let a = 0; a < 3 && !png; a++) {
    try {
      const r = await fetch(DEM_URL + "/" + k + ".png");
      if (!r.ok) throw new Error("HTTP " + r.status);
      png = PNG.sync.read(Buffer.from(await r.arrayBuffer()));
    } catch (e) { if (a === 2) console.warn("  ! dem " + k + ": " + e.message); else await new Promise((s) => setTimeout(s, 700 * (a + 1))); }
  }
  if (demCache.size > 1500) demCache.delete(demCache.keys().next().value);
  demCache.set(k, png);
  return png;
}
async function elevAt(lat, lon) {
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
async function elevations(pts) {
  const out = [];
  for (const p of pts) { const e = await elevAt(p[0], p[1]); if (e == null) return null; out.push(e); }
  return out;
}

/* ----- graph walking + climb building -------------------------------------- */
function vkey(lat, lon) { return lat.toFixed(6) + "," + lon.toFixed(6); }
function anchorBonus(w, anchor) {
  if (!anchor) return 0;
  const t = w.tags || {}, s = ((t.ref || "") + " " + (t.name || "") + " " + (t["name:it"] || "")).toLowerCase();
  for (const tok of anchor) if (tok.length > 3 && s.indexOf(tok) >= 0) return 40; // road named after the pass -> follow it
  return 0;
}
const HWRANK = { primary:6, primary_link:6, secondary:5, secondary_link:5, tertiary:4, tertiary_link:4, unclassified:3, residential:2, living_street:2, cycleway:2, track:1, service:0 };
function same(a, b) {
  const ta = a.tags || {}, tb = b.tags || {};
  let sc = 0;
  if (ta.ref && ta.ref === tb.ref) sc += 20;          // same road ref (SS38 stays SS38)
  if (ta.name && ta.name === tb.name) sc += 14;
  if (ta.highway === tb.highway) sc += 6;
  sc += (HWRANK[tb.highway] != null ? HWRANK[tb.highway] : 3); // prefer bigger roads
  return sc;
}
function gx(w,i){return w.g[i*2];}
function gy(w,i){return w.g[i*2+1];}
function glen(w){return w.g.length>>1;}
function walk(startWay, startIdx, dir, vertexMap, capKm, anchor) {
  const pts = [[gx(startWay,startIdx), gy(startWay,startIdx)]];
  const visited = new Set([startWay.uid]);
  let w = startWay, i = startIdx, d = dir, dist = 0, prev = pts[0];
  for (let guard = 0; guard < 2000; guard++) {
    const ni = i + d;
    if (ni < 0 || ni >= glen(w)) {
      const cand = (vertexMap.get(vkey(gx(w,i), gy(w,i))) || []).filter((c) => !visited.has(c.w.uid) && glen(c.w) > 1);
      if (!cand.length) break;
      cand.sort((x, y) => (same(w, y.w) + anchorBonus(y.w, anchor)) - (same(w, x.w) + anchorBonus(x.w, anchor)));
      const nx = cand[0];
      visited.add(nx.w.uid);
      w = nx.w; i = nx.idx; d = (i === 0) ? 1 : -1;
      continue;
    }
    const gla = gx(w,ni), glo = gy(w,ni);
    dist += hav(prev[0], prev[1], gla, glo);
    pts.push([gla, glo]);
    prev = [gla, glo]; i = ni;
    if (dist >= capKm) break;
  }
  if (pts.length > 110) { const o = [], n = 110; for (let k = 0; k < n; k++) o.push(pts[Math.round(k * (pts.length - 1) / (n - 1))]); return o; }
  return pts;
}
function walkTo(startWay, startIdx, tLat, tLon, vertexMap, capKm, anchor) {
  // greedy target-directed walk from a base vertex toward the summit (tLat,tLon)
  var pts = [[gx(startWay, startIdx), gy(startWay, startIdx)]];
  var visited = new Set([startWay.uid]);
  var w = startWay, i = startIdx, dist = 0, prev = pts[0];
  var dToT = hav(prev[0], prev[1], tLat, tLon);
  for (var guard = 0; guard < 4000; guard++) {
    var bestni = -1, bestd = Infinity;
    for (var dd = -1; dd <= 1; dd += 2) { var ni = i + dd; if (ni < 0 || ni >= glen(w)) continue; var nd = hav(gx(w, ni), gy(w, ni), tLat, tLon); if (nd < bestd) { bestd = nd; bestni = ni; } }
    if (bestni >= 0 && bestd < dToT + 0.03) {
      var gla = gx(w, bestni), glo = gy(w, bestni);
      dist += hav(prev[0], prev[1], gla, glo); pts.push([gla, glo]); prev = [gla, glo]; i = bestni; dToT = bestd;
      if (dToT < 0.25) break; if (dist > capKm) break; continue;
    }
    var here = vkey(gx(w, i), gy(w, i));
    var cand = (vertexMap.get(here) || []).filter(function (c) { return !visited.has(c.w.uid) && glen(c.w) > 1; });
    if (!cand.length) break;
    var pick = null, pickScore = 0.0001;
    cand.forEach(function (c) {
      [c.idx - 1, c.idx + 1].forEach(function (x) {
        if (x < 0 || x >= glen(c.w)) return;
        var nd = hav(gx(c.w, x), gy(c.w, x), tLat, tLon);
        var sc = (dToT - nd) * 100 + anchorBonus(c.w, anchor) + (HWRANK[c.w.tags.highway] || 0);
        if (sc > pickScore) { pickScore = sc; pick = { w: c.w, idx: c.idx }; }
      });
    });
    if (!pick) break;
    visited.add(pick.w.uid); w = pick.w; i = pick.idx;
  }
  if (dToT > 0.4 || pts.length < 4) return null;
  if (pts.length > 110) { var o = [], n = 110; for (var k = 0; k < n; k++) o.push(pts[Math.round(k * (pts.length - 1) / (n - 1))]); pts = o; }
  return pts; // base(town) -> summit
}
function smooth3(a){const o=a.slice();for(let i=1;i<a.length-1;i++)o[i]=(a[i-1]+a[i]+a[i+1])/3;return o;}
function buildSide(ptsOut, elevsOut, topLat, topLon, relax) {
  const pts = ptsOut.slice().reverse(), el = smooth3(elevsOut.slice().reverse());
  if (pts.length < 4) return null;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + hav(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
  const end = pts.length - 1;
  function avgFrom(i) { const dd = cum[end] - cum[i]; return dd > 0 ? (el[end] - el[i]) / (dd * 1000) * 100 : 0; }
  function minWin(from) {
    let worst = 99;
    for (let i = from; i < end; i++) {
      let j = i; while (j < end && cum[j] - cum[i] < 1) j++;
      const dd = cum[j] - cum[i]; if (dd <= 0) continue;
      const g = (el[j] - el[i]) / (dd * 1000) * 100;
      if (g < worst) worst = g;
    }
    return worst;
  }
  // Walk valley-ward from the summit using ~300m windows (DEM is noisy point-to-point).
  // Extend the climb across short flats/false-flats; stop only at a sustained DESCENT
  // or a long (> FLAT_MAX) plateau. base = farthest valid index toward the valley.
  const FLAT_MAX = relax ? 4 : 2.5;
  function fwdGrade(i) { // grade over ~300m starting at i, toward summit
    let j = i; while (j < end && cum[j] - cum[i] < 0.3) j++;
    const dd = cum[j] - cum[i];
    return dd > 0 ? (el[j] - el[i]) / (dd * 1000) * 100 : 0;
  }
  let base = end, flatRun = 0;
  for (let i = end - 1; i >= 0; i--) {
    const g = fwdGrade(i);
    if (g >= 1.5) { base = i; flatRun = 0; }                 // climbing -> extend down
    else if (g > -1.2) {                                      // flat / false-flat
      flatRun += cum[i + 1] - cum[i];
      if (flatRun > FLAT_MAX) break;
      base = i;
    } else break;                                            // real descent -> valley
  }
  // trim trailing near-flat we tentatively included
  while (base < end - 1) {
    let j = base; while (j < end && cum[j] - cum[base] < 0.4) j++;
    const g = (el[j] - el[base]) / ((cum[j] - cum[base]) * 1000) * 100;
    if (g < 0.4) base++; else break;
  }
  // Valley-start refinement: strip the contiguous low-gradient valley approach at the
  // bottom so the base sits where the real climb begins, NOT at a town further down the
  // valley (e.g. Cepina under Stelvio, or the long Serchio-valley run to Gallicano below
  // the Pieve Fosciana ramp on Passo Radici). Advance the base upward while the forward
  // ~600m window stays below VFLOOR%, stopping at the first sustained ramp (>= VFLOOR).
  // It can never cut mid-climb (a real climb is >= VFLOOR from its base up) and always
  // keeps >= VMIN_KEEP km. Generalizes the "2km / 4%" idea: Radici needs ~10km trimmed,
  // so the floor (not a fixed cap) decides where the valley ends.
  const VFLOOR = relax ? 3.0 : 4.0, VMIN_KEEP = 3.0, VWIN = 0.6;
  while (base < end - 1 && (cum[end] - cum[base]) > VMIN_KEEP) {
    let j = base; while (j < end && cum[j] - cum[base] < VWIN) j++;
    const dd = cum[j] - cum[base]; if (dd <= 0) break;
    const g = (el[j] - el[base]) / (dd * 1000) * 100;
    if (g < VFLOOR) base++; else break;
  }
  if (base >= end - 1) { let bi = 0; for (let i = 1; i <= end; i++) if (el[i] < el[bi]) bi = i; base = bi; }
  const segPts = pts.slice(base), segEl = el.slice(base), segCum = cum.slice(base).map((c) => c - cum[base]);
  const dist = segCum[segCum.length - 1];
  if (dist < (relax ? 1.2 : 1.5)) return null;
  const gain = segEl[segEl.length - 1] - segEl[0];
  if (gain < (relax ? 140 : 200)) return null;
  const avg = gain / (dist * 1000) * 100;
  if (avg < (relax ? 2 : 2.5)) return null;
  let maxg = 0; // windowed (>=300m) to kill DEM noise
  for (let i = 0; i < segPts.length - 1; i++) {
    let j = i; while (j < segPts.length - 1 && segCum[j] - segCum[i] < 0.3) j++;
    const dd = (segCum[j] - segCum[i]) * 1000;
    if (dd >= 250) { const g = (segEl[j] - segEl[i]) / dd * 100; if (g > maxg) maxg = g; }
  }
  if (maxg < avg) maxg = avg;
  const dir = compass(topLat, topLon, segPts[0][0], segPts[0][1]); // slope aspect: direction the versante faces
  const n = Math.min(segEl.length, 30), prof = [];
  for (let i = 0; i < n; i++) prof.push(Math.round(segEl[Math.round(i * (segEl.length - 1) / (n - 1))]));
  return { side: "Versante " + dir, startLat: segPts[0][0], startLon: segPts[0][1], startElevation: Math.round(segEl[0]), endElevation: Math.round(segEl[segEl.length - 1]), distance_km: Math.round(dist * 10) / 10, avgGradient: Math.round(avg * 10) / 10, maxGradient: Math.round(maxg * 10) / 10, traffic: "n/d", exposure: dir, elevationProfile: prof, cat: climbCat(Math.round(dist * 10) / 10, gain, segEl[segEl.length - 1]), track: segPts.map((s) => [s[0], s[1]]) };
}

/* ----- IO ------------------------------------------------------------------- */
async function download(url, dest) {
  try { await access(dest); console.log("  cached " + dest); return; } catch {}
  // region key e.g. "nord-ovest"
  const region = url.split("/").pop().replace("-latest.osm.pbf", "");
  const candidates = [
    "https://download.geofabrik.de/europe/italy/" + region + "-latest.osm.pbf",
    "https://download.openstreetmap.fr/extracts/europe/italy/" + region.replace(/-/g, "_") + ".osm.pbf",
    "https://download.openstreetmap.fr/extracts/europe/italy/" + region + ".osm.pbf"
  ];
  for (let attempt = 0; attempt < 10; attempt++) {
    const u = candidates[attempt % candidates.length];
    try {
      console.log("  downloading " + u + (attempt ? " (try " + (attempt + 1) + ")" : ""));
      const r = await fetch(u, { redirect: "follow" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      await new Promise((res, rej) => { Readable.fromWeb(r.body).pipe(createWriteStream(dest)).on("finish", res).on("error", rej); });
      return;
    } catch (e) {
      const wait = Math.min(120000, 8000 * 2 ** Math.floor(attempt / candidates.length));
      console.warn("  ! failed (" + e.message + "), retry in " + (wait / 1000) + "s");
      await new Promise((s) => setTimeout(s, wait));
    }
  }
  throw new Error("download exhausted: " + region);
}
function osmium(args) { execFileSync("osmium", args, { stdio: ["ignore", "inherit", "inherit"] }); }
function streamSeq(file, onF) {
  return new Promise((res, rej) => {
    const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
    rl.on("line", (ln) => {
      ln = ln.trim(); if (!ln) return;
      if (ln.charCodeAt(0) === 0x1e) ln = ln.slice(1);
      try { onF(JSON.parse(ln)); } catch {}
    });
    rl.on("close", res); rl.on("error", rej);
  });
}

/* ----- main ------------------------------------------------------------------ */
async function main() {
  console.log("locaClimb builder v3 (PBF + Terrarium DEM)");
  await mkdir(WORK, { recursive: true });
  const seqFile = WORK + "/filtered.geojsonseq";

  if (!SKIP_DL) {
    const parts = [];
    for (let i = 0; i < PBF_URLS.length; i++) { const f = WORK + "/part" + i + ".osm.pbf"; await download(PBF_URLS[i], f); parts.push(f); }
    console.log("  osmium merge+filter ...");
    osmium(["merge", ...parts, "-o", WORK + "/merged.osm.pbf", "--overwrite"]);
    osmium(["tags-filter", WORK + "/merged.osm.pbf", "n/mountain_pass=yes", "n/place=town", "n/place=village", ...HW_KEEP.map((h) => "w/highway=" + h), "-o", WORK + "/filtered.osm.pbf", "--overwrite"]);
    console.log("  osmium export ...");
    osmium(["export", WORK + "/filtered.osm.pbf", "-f", "geojsonseq", "-a", "type,id", "-o", seqFile, "--overwrite"]);
  }

  console.log("  stream 1/2: pass nodes ...");
  const passes = [], places = [];
  await streamSeq(seqFile, (f) => {
    if (!f.geometry || f.geometry.type !== "Point" || !f.properties) return;
    if (f.properties.mountain_pass === "yes") {
      passes.push({ oid: String(f.properties["@id"] || "").replace(/\D/g, ""), lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], ele: parseInt(f.properties.ele, 10) || 0, tags: f.properties });
    } else if ((f.properties.place === "town" || f.properties.place === "village") && f.properties.name) {
      places.push({ lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], name: f.properties.name });
    }
  });
  console.log("  places (towns/villages): " + places.length);
  const plgrid = new Map();
  for (const t of places) { const k = Math.floor(t.lat / 0.05) + ":" + Math.floor(t.lon / 0.05); if (!plgrid.has(k)) plgrid.set(k, []); plgrid.get(k).push(t); }
  global.nearestPlace = function (lat, lon) {
    const ci = Math.floor(lat / 0.05), cj = Math.floor(lon / 0.05);
    let best = null, bd = 4;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      for (const t of (plgrid.get((ci + a) + ":" + (cj + b)) || [])) { const dd = hav(lat, lon, t.lat, t.lon); if (dd < bd) { bd = dd; best = t; } }
    }
    return best;
  };
  console.log("  passes found: " + passes.length);
  let extraClimbs = [];
  try { extraClimbs = JSON.parse(await readFile("climbs_extra.json", "utf8")); } catch {}
  const cellOf = (lat, lon) => Math.floor(lat / 0.05) + ":" + Math.floor(lon / 0.05);
  const pgrid = new Set(passes.map((p) => cellOf(p.lat, p.lon)));
  for (const x of extraClimbs) pgrid.add(cellOf(x.lat, x.lon)); // keep roads near extra climbs too
  function nearPass(lat, lon) {
    const ci = Math.floor(lat / 0.05), cj = Math.floor(lon / 0.05);
    for (let a = -6; a <= 6; a++) for (let b = -6; b <= 6; b++) if (pgrid.has((ci + a) + ":" + (cj + b))) return true;
    return false;
  }

  console.log("  stream 2/2: rideable ways near passes ...");
  const ways = [];
  let uid = 0;
  await streamSeq(seqFile, (f) => {
    if (!f.geometry || f.geometry.type !== "LineString" || !f.properties || !f.properties.highway) return;
    const c = f.geometry.coordinates;
    if (!c || c.length < 2) return;
    const mid = c[Math.floor(c.length / 2)];
    if (!nearPass(mid[1], mid[0]) && !nearPass(c[0][1], c[0][0]) && !nearPass(c[c.length - 1][1], c[c.length - 1][0])) return;
    if (!rideable(f.properties)) return;
    const t = f.properties, tags = { highway: t.highway, name: t.name, ref: t.ref, surface: t.surface, tracktype: t.tracktype, smoothness: t.smoothness, hgv: t.hgv, maxweight: t.maxweight };
    const g = new Float32Array(c.length * 2);
    for (let k = 0; k < c.length; k++) { g[k * 2] = c[k][1]; g[k * 2 + 1] = c[k][0]; }
    ways.push({ uid: uid++, tags, g });
  });
  console.log("  ways kept: " + ways.length);

  // vertex graph: index EVERY vertex but only for ways close to a pass (full continuity, bounded memory)
  function wayNearPass(w) {
    for (let i = 0; i < glen(w); i += 5) if (nearPass(gx(w,i), gy(w,i))) return true;
    return nearPass(gx(w, glen(w)-1), gy(w, glen(w)-1));
  }
  const vertexMap = new Map();
  for (const w of ways) for (let idx = 0; idx < glen(w); idx++) {
    const k = vkey(gx(w, idx), gy(w, idx));
    let a = vertexMap.get(k); if (!a) { a = []; vertexMap.set(k, a); }
    a.push({ w, idx });
  }
  const wgrid = new Map();
  for (const w of ways) for (let i = 0; i < glen(w); i += 10) {
    const k = cellOf(gx(w,i), gy(w,i));
    if (!wgrid.has(k)) wgrid.set(k, []);
    wgrid.get(k).push({ w, idx: i });
  }
  const CLS = { primary:6, primary_link:6, secondary:5, secondary_link:5, tertiary:4, tertiary_link:4, unclassified:3, residential:2, living_street:2, cycleway:2, track:1, service:0 };
  function snap(lat, lon, maxKm) {
    const ci = Math.floor(lat / 0.05), cj = Math.floor(lon / 0.05);
    let best = null, bs = -1;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const lst = wgrid.get((ci + a) + ":" + (cj + b)) || [];
      for (const c of lst) {
        const dd = hav(lat, lon, gx(c.w,c.idx), gy(c.w,c.idx));
        if (dd >= maxKm) continue;
        const cl = CLS[c.w.tags.highway] != null ? CLS[c.w.tags.highway] : 3;
        const score = cl * 10 - dd * 20; // class first, then proximity
        if (score > bs) { bs = score; best = c; }
      }
    }
    return best;
  }
  function candWays(lat, lon, radKm, maxN) {
    const ci = Math.floor(lat / 0.05), cj = Math.floor(lon / 0.05);
    const bestBy = new Map(); // uid -> {w,idx,dd}
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const lst = wgrid.get((ci + a) + ":" + (cj + b)) || [];
      for (const c of lst) {
        const dd = hav(lat, lon, gx(c.w,c.idx), gy(c.w,c.idx));
        if (dd >= radKm) continue;
        const cur = bestBy.get(c.w.uid);
        if (!cur || dd < cur.dd) bestBy.set(c.w.uid, { w: c.w, idx: c.idx, dd });
      }
    }
    return [...bestBy.values()].sort((x, y) => x.dd - y.dd).slice(0, maxN);
  }
  function bearing(la1, lo1, la2, lo2) { var p = Math.PI / 180; var y = Math.sin((lo2 - lo1) * p) * Math.cos(la2 * p); var x = Math.cos(la1 * p) * Math.sin(la2 * p) - Math.sin(la1 * p) * Math.cos(la2 * p) * Math.cos((lo2 - lo1) * p); return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360; }
  function resampleByDist(pts, stepKm) {
    if (pts.length < 2) return pts;
    var out = [pts[0]], acc = 0;
    for (var i = 1; i < pts.length; i++) {
      acc += hav(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
      if (acc >= stepKm) { out.push(pts[i]); acc = 0; }
    }
    if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
    if (out.length > 400) { var o = [], n = 400; for (var z = 0; z < n; z++) o.push(out[Math.round(z * (out.length - 1) / (n - 1))]); out = o; }
    return out;
  }
  function neighbors(key) {
    var out = [], lst = vertexMap.get(key);
    if (!lst) return out;
    for (var e of lst) {
      var w = e.w, i = e.idx;
      [i - 1, i + 1].forEach(function (j) {
        if (j < 0 || j >= glen(w)) return;
        var k2 = vkey(gx(w, j), gy(w, j));
        out.push({ key: k2, seg: hav(gx(w, i), gy(w, i), gx(w, j), gy(w, j)) });
      });
    }
    return out;
  }
  // BFS shortest road-paths from the summit over the buffer network (no branch guessing)
  async function buildVersanti(lat, lon, capKm, relax, anchor) {
    var ch = snap(lat, lon, 0.8);
    if (!ch) return [];
    var startK = vkey(gx(ch.w, ch.idx), gy(ch.w, ch.idx));
    var startLat = gx(ch.w, ch.idx), startLon = gy(ch.w, ch.idx);
    var dist = new Map(), parent = new Map(), coord = new Map();
    dist.set(startK, 0); coord.set(startK, [startLat, startLon]);
    var q = [startK], qi = 0;
    while (qi < q.length) {
      var c = q[qi++]; var dc = dist.get(c);
      if (dc > capKm) continue;
      for (var nb of neighbors(c)) {
        var nd = dc + nb.seg;
        if (nd > capKm) continue;
        if (!dist.has(nb.key) || nd < dist.get(nb.key)) {
          dist.set(nb.key, nd); parent.set(nb.key, c);
          if (!coord.has(nb.key)) { var p2 = nb.key.split(","); coord.set(nb.key, [parseFloat(p2[0]), parseFloat(p2[1])]); }
          q.push(nb.key);
        }
      }
      if (q.length > 200000) break; // safety
    }
    // farthest reached vertex per bearing octant = candidate base
    var perOct = new Map();
    dist.forEach(function (d, k) {
      if (d < 1.5) return;
      var ll = coord.get(k); var oc = Math.floor(bearing(lat, lon, ll[0], ll[1]) / 45);
      var cur = perOct.get(oc);
      if (!cur || d > cur.d) perOct.set(oc, { k: k, d: d });
    });
    // reconstruct each path summit->base, sample DEM, trim
    var raw = [];
    for (var ent of perOct.values()) {
      var path = [], k = ent.k, guard = 0;
      while (k != null && guard++ < 5000) { path.push(coord.get(k)); k = parent.get(k); }
      path.reverse(); // summit -> base
      if (path.length < 4) continue;
      path = resampleByDist(path, 0.10); // ~1 point every 100m: tighter on hairpins, still light on long climbs
      var ev = await elevations(path); if (!ev) continue;
      var v = buildSide(path, ev, lat, lon, relax); // path is summit->base; buildSide reverses internally
      if (v) raw.push(v);
    }
    raw.sort(function (a, b) { return b.distance_km - a.distance_km; });
    function overlapFrac(a, b) { // fraction of a.track points that lie within 150m of any b.track point (sampled)
      if (!a.track || !b.track) return 0;
      var hit = 0, tot = 0;
      for (var i = 0; i < a.track.length; i += 3) {
        tot++; var pa = a.track[i], near = false;
        for (var j = 0; j < b.track.length; j += 3) { if (hav(pa[0], pa[1], b.track[j][0], b.track[j][1]) < 0.15) { near = true; break; } }
        if (near) hit++;
      }
      return tot ? hit / tot : 0;
    }
    var kept = [];
    for (var v2 of raw) {
      var dup = false;
      for (var u of kept) {
        var close = hav(v2.startLat, v2.startLon, u.startLat, u.startLon) < 2.0;
        var bv = bearing(lat, lon, v2.startLat, v2.startLon), bu = bearing(lat, lon, u.startLat, u.startLon);
        var db = Math.abs(bv - bu); if (db > 180) db = 360 - db;
        var ov = Math.max(overlapFrac(v2, u), overlapFrac(u, v2));
        if ((close && db < 45) || ov > 0.55) { dup = true; break; } // same base-direction OR mostly-shared road
      }
      if (!dup) kept.push(v2);
      if (kept.length >= 4) break;
    }
    for (var v3 of kept) { var t = global.nearestPlace ? global.nearestPlace(v3.startLat, v3.startLon) : null; v3._town = t ? t.name : null; if (t) v3.side = "Da " + t.name; }
    var byTown = new Map(), finalv = [];
    for (var v4 of kept) {
      if (v4._town && byTown.has(v4._town)) { var u4 = byTown.get(v4._town); if (v4.distance_km > u4.distance_km) { finalv[finalv.indexOf(u4)] = v4; byTown.set(v4._town, v4); } continue; }
      if (v4._town) byTown.set(v4._town, v4);
      finalv.push(v4);
    }
    finalv.forEach(function (v) { delete v._town; });
    return finalv;
  }

  let existing = [];
  try { existing = JSON.parse(await readFile(OUT, "utf8")); } catch {}
  const byId = new Map(existing.map((p) => [p.id, p]));

  let kept = 0, skipped = 0, ok = 0, fail = 0, done = 0;
  for (const el of passes) {
    if (done >= MAX_ENRICH) break;
    if (!el.ele || el.ele < MIN_ELE) { skipped++; continue; }
    const ch = snap(el.lat, el.lon, 0.3);
    if (!ch) { skipped++; continue; }
    kept++;
    const id = "osm-" + el.oid;
    const name = (el.tags.name || "Passo").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const slat = gx(ch.w,ch.idx), slon = gy(ch.w,ch.idx);
    const rec = byId.get(id) || { id };
    rec.name = name; rec.lat = slat; rec.lon = slon; rec.elevation = el.ele; rec.snapped = true; rec.nodeId = el.oid;
    rec.surfaceLabel = surfaceLabel(ch.w.tags);
    const tr = computeTraffic(ch.w.tags, el.ele);
    rec.trafFeriale = tr.fer; rec.trafWeekend = tr.wkd; rec.trucks = tr.trucks;
    if (!(rec.versanti && rec.versanti.length) || rec.algo !== ALGO_VERSION || REENRICH) {
      done++;
      if (REENRICH || rec.algo !== ALGO_VERSION) { rec.versanti = null; rec.cat = null; } // drop stale before rebuild
      try {
        const vs = await buildVersanti(slat, slon, 30, false, nameTokens(name));
        if (vs.length) {
          rec.versanti = vs;
          rec.difficulty = Math.max(...rec.versanti.map((v) => estDiff(v.distance_km, v.endElevation - v.startElevation, v.endElevation)));
          rec.cat = rec.versanti.map((v) => v.cat).filter(Boolean).sort((a, b) => catRank(b) - catRank(a))[0] || null;
          rec.algo = ALGO_VERSION; // stamp only on success; no-climb passes stay retryable
          ok++;
        } else fail++;
      } catch (e) { fail++; if (fail <= 8) console.log("    ! enrich error (" + rec.name + "): " + e.message); }
      if (done % 250 === 0) console.log("  ... " + done + " (ok " + ok + ", no-climb " + fail + ", dem " + demCache.size + ")");
    }
    byId.set(id, rec);
  }
  console.log("  kept " + kept + ", skipped " + skipped + "; enriched ok " + ok + ", no-climb " + fail);

  // extra curated climbs (no mountain_pass node): climbs_extra.json [{id,name,lat,lon,region?}]
  try {
    const extra = extraClimbs;
    console.log("  extra climbs: " + extra.length);
    for (const x of extra) {
      const ch = snap(x.lat, x.lon, 0.5);
      if (!ch) { console.log("    - " + x.name + ": no road"); continue; }
      const slat = gx(ch.w,ch.idx), slon = gy(ch.w,ch.idx);
      const vs = await buildVersanti(slat, slon, 12, true, nameTokens(x.name));
      if (!vs.length) { console.log("    - " + x.name + ": no climb"); continue; }
      const id = "x-" + x.id;
      const rec = byId.get(id) || { id };
      rec.name = x.name; rec.lat = slat; rec.lon = slon;
      rec.elevation = Math.max(...vs.map((v) => v.endElevation));
      rec.snapped = true; rec.surfaceLabel = surfaceLabel(ch.w.tags);
      const tr = computeTraffic(ch.w.tags, rec.elevation);
      rec.trafFeriale = tr.fer; rec.trafWeekend = tr.wkd; rec.trucks = tr.trucks;
      rec.versanti = vs;
      rec.difficulty = Math.max(...vs.map((v) => estDiff(v.distance_km, v.endElevation - v.startElevation, v.endElevation)));
      rec.cat = vs.map((v) => v.cat).filter(Boolean).sort((a, b) => catRank(b) - catRank(a))[0] || null;
      byId.set(id, rec);
      console.log("    + " + x.name + ": " + vs.length + " versanti, cat " + (rec.cat || "-"));
    }
  } catch (e) { /* no extra file, fine */ }

  const result = [...byId.values()].sort((a, b) => (b.elevation || 0) - (a.elevation || 0));
  await writeFile(OUT, JSON.stringify(result, null, 1) + "\n", "utf8");
  console.log("  wrote " + OUT + " (" + result.length + ")");

  if (!NO_CURATED) {
    try {
      const code = await readFile("passes_data.js", "utf8");
      const ctx = {}; vm.createContext(ctx); vm.runInContext(code, ctx);
      const overrides = {};
      const norm = (n) => (n || "").toLowerCase().replace(/passo |colle |col |della |dello |del |di |monte /g, "").trim();
      for (const p of (ctx.PASSES_DATA || [])) {
        let ch = snap(p.lat, p.lon, 1.2);
        if (!ch) { // fallback: locate by OSM pass node with matching name
          const key = norm(p.name);
          const hit = key && passes.find((el) => norm(el.tags.name).indexOf(key) >= 0);
          if (hit) ch = snap(hit.lat, hit.lon, 0.5);
        }
        if (!ch) { console.log("    - " + p.name + ": no road"); continue; }
        const slat = gx(ch.w,ch.idx), slon = gy(ch.w,ch.idx);
        try {
          const top = await buildVersanti(slat, slon, 32, true, nameTokens(p.name));
          if (!top.length) { console.log("    - " + p.name + ": no climb"); continue; }
          overrides[p.id] = { lat: slat, lon: slon, versanti: top, difficulty: Math.max(...top.map((v) => estDiff(v.distance_km, v.endElevation - v.startElevation, v.endElevation))), cat: top.map((v) => v.cat).filter(Boolean).sort((a, b) => catRank(b) - catRank(a))[0] || null };
          console.log("    + " + p.name + ": " + top.length + " versanti, cat " + (overrides[p.id].cat || "-"));
        } catch (e) { console.log("    - " + p.name + ": " + e.message); }
      }
      await writeFile("curated_overrides.json", JSON.stringify(overrides, null, 1) + "\n", "utf8");
      console.log("  wrote curated_overrides.json (" + Object.keys(overrides).length + ")");
    } catch (e) { console.warn("  ! curated skipped: " + e.message); }
  }
  console.log("DONE");
}
main().catch((e) => { console.error("FATAL: " + e.stack); process.exit(1); });
