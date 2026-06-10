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
const HW_KEEP = ["primary","primary_link","secondary","secondary_link","tertiary","tertiary_link","unclassified","residential","living_street","service","track","cycleway"];

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const OUT = arg("--out", "osm_passes.json");
const MIN_ELE = parseInt(arg("--min-ele", "200"), 10);
const MAX_ENRICH = parseInt(arg("--max", "100000"), 10);
const SKIP_DL = process.argv.includes("--skip-download");
const NO_CURATED = process.argv.includes("--no-curated");
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
function same(a, b) {
  const ta = a.tags || {}, tb = b.tags || {};
  if (ta.ref && ta.ref === tb.ref) return 2;
  if (ta.name && ta.name === tb.name) return 2;
  if (ta.highway === tb.highway) return 1;
  return 0;
}
function walk(startWay, startIdx, dir, vertexMap, capKm) {
  const pts = [[startWay.geom[startIdx][0], startWay.geom[startIdx][1]]];
  const visited = new Set([startWay.uid]);
  let w = startWay, i = startIdx, d = dir, dist = 0, prev = pts[0];
  for (let guard = 0; guard < 900; guard++) {
    const ni = i + d;
    if (ni < 0 || ni >= w.geom.length) {
      const cand = (vertexMap.get(vkey(w.geom[i][0], w.geom[i][1])) || []).filter((c) => !visited.has(c.w.uid) && c.w.geom.length > 1);
      if (!cand.length) break;
      cand.sort((x, y) => same(w, y.w) - same(w, x.w));
      const nx = cand[0];
      visited.add(nx.w.uid);
      w = nx.w; i = nx.idx; d = (i === 0) ? 1 : -1;
      continue;
    }
    const g = w.geom[ni];
    dist += hav(prev[0], prev[1], g[0], g[1]);
    pts.push([g[0], g[1]]);
    prev = [g[0], g[1]]; i = ni;
    if (dist >= capKm) break;
  }
  if (pts.length > 110) { const o = [], n = 110; for (let k = 0; k < n; k++) o.push(pts[Math.round(k * (pts.length - 1) / (n - 1))]); return o; }
  return pts;
}
function smooth3(a){const o=a.slice();for(let i=1;i<a.length-1;i++)o[i]=(a[i-1]+a[i]+a[i+1])/3;return o;}
function buildSide(ptsOut, elevsOut, topLat, topLon) {
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
  let base = 0;
  for (let thr = 4.5; thr >= 3 && base === 0; thr -= 0.75) for (let i = 0; i < end; i++) if (avgFrom(i) >= thr && minWin(i) >= 1.5) { base = i; break; }
  if (base === 0 && avgFrom(0) < 3) { // gentle climbs (Apennines): start at the lowest point instead
    let bi = 0; for (let i = 1; i <= end; i++) if (el[i] < el[bi]) bi = i;
    if (bi < end - 2) base = bi;
  }
  const segPts = pts.slice(base), segEl = el.slice(base), segCum = cum.slice(base).map((c) => c - cum[base]);
  const dist = segCum[segCum.length - 1];
  if (dist < 1.5) return null;
  const gain = segEl[segEl.length - 1] - segEl[0];
  if (gain < 200) return null;
  const avg = gain / (dist * 1000) * 100;
  if (avg < 3) return null;
  let maxg = 0; // windowed (>=300m) to kill DEM noise
  for (let i = 0; i < segPts.length - 1; i++) {
    let j = i; while (j < segPts.length - 1 && segCum[j] - segCum[i] < 0.3) j++;
    const dd = (segCum[j] - segCum[i]) * 1000;
    if (dd >= 250) { const g = (segEl[j] - segEl[i]) / dd * 100; if (g > maxg) maxg = g; }
  }
  if (maxg < avg) maxg = avg;
  const dir = compass(segPts[0][0], segPts[0][1], topLat, topLon);
  const n = Math.min(segEl.length, 24), prof = [];
  for (let i = 0; i < n; i++) prof.push(Math.round(segEl[Math.round(i * (segEl.length - 1) / (n - 1))]));
  return { side: "Versante " + dir, startLat: segPts[0][0], startLon: segPts[0][1], startElevation: Math.round(segEl[0]), endElevation: Math.round(segEl[segEl.length - 1]), distance_km: Math.round(dist * 10) / 10, avgGradient: Math.round(avg * 10) / 10, maxGradient: Math.round(maxg * 10) / 10, traffic: "n/d", exposure: dir, elevationProfile: prof, cat: climbCat(Math.round(dist * 10) / 10, gain, segEl[segEl.length - 1]), track: segPts.map((s) => [s[0], s[1]]) };
}

/* ----- IO ------------------------------------------------------------------- */
async function download(url, dest) {
  try { await access(dest); console.log("  cached " + dest); return; } catch {}
  console.log("  downloading " + url);
  const r = await fetch(url);
  if (!r.ok) throw new Error("download HTTP " + r.status + " " + url);
  await new Promise((res, rej) => {
    Readable.fromWeb(r.body).pipe(createWriteStream(dest)).on("finish", res).on("error", rej);
  });
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
    osmium(["tags-filter", WORK + "/merged.osm.pbf", "n/mountain_pass=yes", ...HW_KEEP.map((h) => "w/highway=" + h), "-o", WORK + "/filtered.osm.pbf", "--overwrite"]);
    console.log("  osmium export ...");
    osmium(["export", WORK + "/filtered.osm.pbf", "-f", "geojsonseq", "-a", "type,id", "-o", seqFile, "--overwrite"]);
  }

  console.log("  stream 1/2: pass nodes ...");
  const passes = [];
  await streamSeq(seqFile, (f) => {
    if (f.geometry && f.geometry.type === "Point" && f.properties && f.properties.mountain_pass === "yes") {
      passes.push({ oid: String(f.properties["@id"] || "").replace(/\D/g, ""), lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], ele: parseInt(f.properties.ele, 10) || 0, tags: f.properties });
    }
  });
  console.log("  passes found: " + passes.length);
  const cellOf = (lat, lon) => Math.floor(lat / 0.05) + ":" + Math.floor(lon / 0.05);
  const pgrid = new Set(passes.map((p) => cellOf(p.lat, p.lon)));
  function nearPass(lat, lon) {
    const ci = Math.floor(lat / 0.05), cj = Math.floor(lon / 0.05);
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) if (pgrid.has((ci + a) + ":" + (cj + b))) return true;
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
    ways.push({ uid: uid++, tags: f.properties, geom: c.map((q) => [q[1], q[0]]) });
  });
  console.log("  ways kept: " + ways.length);

  const vertexMap = new Map();
  for (const w of ways) [0, w.geom.length - 1].forEach((idx) => {
    const k = vkey(w.geom[idx][0], w.geom[idx][1]);
    if (!vertexMap.has(k)) vertexMap.set(k, []);
    vertexMap.get(k).push({ w, idx });
  });
  const wgrid = new Map();
  for (const w of ways) for (let i = 0; i < w.geom.length; i++) {
    const k = cellOf(w.geom[i][0], w.geom[i][1]);
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
        const dd = hav(lat, lon, c.w.geom[c.idx][0], c.w.geom[c.idx][1]);
        if (dd >= maxKm) continue;
        const cl = CLS[c.w.tags.highway] != null ? CLS[c.w.tags.highway] : 3;
        const score = cl * 10 - dd * 20; // class first, then proximity
        if (score > bs) { bs = score; best = c; }
      }
    }
    return best;
  }

  let existing = [];
  try { existing = JSON.parse(await readFile(OUT, "utf8")); } catch {}
  const byId = new Map(existing.map((p) => [p.id, p]));

  let kept = 0, skipped = 0, ok = 0, fail = 0, done = 0;
  for (const el of passes) {
    if (done >= MAX_ENRICH) break;
    if (!el.ele || el.ele < MIN_ELE) { skipped++; continue; }
    const ch = snap(el.lat, el.lon, 0.13);
    if (!ch) { skipped++; continue; }
    kept++;
    const id = "osm-" + el.oid;
    const name = (el.tags.name || "Passo").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const slat = ch.w.geom[ch.idx][0], slon = ch.w.geom[ch.idx][1];
    const rec = byId.get(id) || { id };
    rec.name = name; rec.lat = slat; rec.lon = slon; rec.elevation = el.ele; rec.snapped = true; rec.nodeId = el.oid;
    rec.surfaceLabel = surfaceLabel(ch.w.tags);
    const tr = computeTraffic(ch.w.tags, el.ele);
    rec.trafFeriale = tr.fer; rec.trafWeekend = tr.wkd; rec.trucks = tr.trucks;
    if (!(rec.versanti && rec.versanti.length) || process.argv.includes("--reenrich")) {
      done++;
      try {
        const sides = [walk(ch.w, ch.idx, -1, vertexMap, 16), walk(ch.w, ch.idx, 1, vertexMap, 16)].filter((s) => s && s.length >= 4);
        const vs = [];
        for (const pts of sides) { const ev = await elevations(pts); if (!ev) continue; const v = buildSide(pts, ev, slat, slon); if (v) vs.push(v); }
        if (vs.length) {
          vs.sort((a, b) => b.distance_km - a.distance_km);
          rec.versanti = vs.slice(0, 2);
          rec.difficulty = Math.max(...rec.versanti.map((v) => estDiff(v.distance_km, v.endElevation - v.startElevation, v.endElevation)));
          rec.cat = rec.versanti.map((v) => v.cat).filter(Boolean).sort((a, b) => catRank(b) - catRank(a))[0] || null;
          ok++;
        } else fail++;
      } catch (e) { fail++; }
      if (done % 250 === 0) console.log("  ... " + done + " (ok " + ok + ", no-climb " + fail + ", dem " + demCache.size + ")");
    }
    byId.set(id, rec);
  }
  console.log("  kept " + kept + ", skipped " + skipped + "; enriched ok " + ok + ", no-climb " + fail);

  const result = [...byId.values()].sort((a, b) => (b.elevation || 0) - (a.elevation || 0));
  await writeFile(OUT, JSON.stringify(result, null, 1) + "\n", "utf8");
  console.log("  wrote " + OUT + " (" + result.length + ")");

  if (!NO_CURATED) {
    try {
      const code = await readFile("passes_data.js", "utf8");
      const ctx = {}; vm.createContext(ctx); vm.runInContext(code, ctx);
      const overrides = {};
      for (const p of (ctx.PASSES_DATA || [])) {
        const ch = snap(p.lat, p.lon, 1.2);
        if (!ch) { console.log("    - " + p.name + ": no road"); continue; }
        const slat = ch.w.geom[ch.idx][0], slon = ch.w.geom[ch.idx][1];
        try {
          const sides = [walk(ch.w, ch.idx, -1, vertexMap, 20), walk(ch.w, ch.idx, 1, vertexMap, 20)].filter((s) => s && s.length >= 4);
          const vs = [];
          for (const pts of sides) { const ev = await elevations(pts); if (!ev) continue; const v = buildSide(pts, ev, slat, slon); if (v) vs.push(v); }
          if (!vs.length) { console.log("    - " + p.name + ": no climb"); continue; }
          vs.sort((a, b) => b.distance_km - a.distance_km);
          const top = vs.slice(0, 2);
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
