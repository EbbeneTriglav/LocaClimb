#!/usr/bin/env node
/*
 * build_osm_passes.mjs  (v2 - tiled, offline enrichment)
 * ---------------------------------------------------------------------------
 * Builds osm_passes.json for locaClimb. Output is adopted as-is by adoptOsm().
 *
 * Pipeline:
 *   1. Tile the bbox into small cells. For EACH tile, ONE Overpass query that
 *      returns pass nodes + connected highways WITH geometry+tags+node-ids.
 *      (Small queries avoid the 504/429 that killed the single huge query.)
 *   2. Assemble a road graph in memory. NO per-pass Overpass calls.
 *   3. Per rideable pass: snap summit to the road, follow the road outward
 *      across connected ways, sample terrain elevation (Open-Meteo DEM),
 *      trim to the real climb base (where gradient flattens), build versanti.
 *
 * Node 22+, no deps, 100% ASCII.
 *   node scripts/build_osm_passes.mjs [--out PATH] [--max N] [--bbox S,W,N,E]
 *                                     [--tile DEG] [--min-ele M] [--reenrich]
 */
import { readFile, writeFile } from "node:fs/promises";
import vm from "node:vm";

const OVERPASS_EPS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter"
];
const ELEV_API = "https://api.open-meteo.com/v1/elevation";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const OUT = arg("--out", "osm_passes.json");
const MAX_ENRICH = parseInt(arg("--max", "80"), 10);
const MIN_ELE = parseInt(arg("--min-ele", "200"), 10);
const TILE = parseFloat(arg("--tile", "0.6"));
const BBOX = arg("--bbox", "44.0,6.5,47.5,13.5").split(",").map(Number);
const REENRICH = process.argv.includes("--reenrich");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ----- geo helpers -------------------------------------------------------- */
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
  return ["Nord", "Nord-Est", "Est", "Sud-Est", "Sud", "Sud-Ovest", "Ovest", "Nord-Ovest"][Math.round(br / 45) % 8];
}
function estDiff(distKm, gain, top) {
  if (!distKm || distKm <= 0) return 1;
  const avg = gain / (distKm * 10);
  let d = avg * 0.85 + Math.min(distKm / 6, 2.5);
  if (avg >= 12) d += 2; else if (avg >= 9) d += 1;
  if (top >= 2000) d += 1;
  return Math.max(1, Math.min(10, Math.round(d)));
}
// Tour-style climb category via FIETS index
function catRank(c){return {HC:5,"1":4,"2":3,"3":2,"4":1}[c]||0;}
function climbCat(distKm, gain, top) {
  if (gain < 150 || distKm < 1) return null;
  const f = (gain * gain) / (distKm * 1000 * 10) + Math.max(0, top - 1000) / 1000;
  if (f >= 8) return "HC";
  if (f >= 5.5) return "1";
  if (f >= 3.5) return "2";
  if (f >= 2) return "3";
  return "4";
}

/* ----- gravel-bike filter (now excludes motorways) ----------------------- */
const BAD_HW = { motorway: 1, motorway_link: 1, trunk_link: 0, path: 1, footway: 1, steps: 1, pedestrian: 1, bridleway: 1, corridor: 1, construction: 1, proposed: 1, raceway: 1, via_ferrata: 1 };
function rideable(t) {
  if (!t) return false;
  const hw = t.highway;
  if (!hw || BAD_HW[hw]) return false;
  if (t.motorroad === "yes") return false;
  if (t.bicycle === "no" || t.bicycle === "dismount") return false;
  if (t.access === "private" || t.access === "no") return false;
  if (t["mtb:scale"]) return false;
  const bs = { sand: 1, mud: 1, rock: 1, pebblestone: 1, grass: 1, woodchips: 1, salt: 1 };
  if (t.surface && bs[t.surface]) return false;
  if (t.tracktype === "grade4" || t.tracktype === "grade5") return false;
  const bsm = { very_bad: 1, horrible: 1, very_horrible: 1, impassable: 1 };
  if (t.smoothness && bsm[t.smoothness]) return false;
  return true;
}
function surfaceLabel(t) {
  if (!t) return "";
  const s = t.surface || "", hw = t.highway || "";
  if (s === "asphalt" || s === "paved" || s === "concrete") return "&#x1F6E3;&#xFE0F; Asfalto";
  if (s === "compacted" || s === "fine_gravel" || s === "gravel" || hw === "track") return "&#x1FAA8; Sterrato/gravel";
  if (s) return "Fondo: " + s;
  return "";
}
const TRAF_BASE = { cycleway: 1, track: 1, service: 2, residential: 2, living_street: 2, unclassified: 3, tertiary: 3, tertiary_link: 3, secondary: 4, secondary_link: 4, primary: 6, primary_link: 6, trunk: 8 };
function computeTraffic(t, elev) {
  const hw = (t && t.highway) || "tertiary";
  const base = TRAF_BASE[hw] != null ? TRAF_BASE[hw] : 3;
  const tour = (elev >= 1500 || base >= 4) ? 2 : 1;
  let trucks = "rari";
  const mw = parseFloat(t && (t.maxweight || t.maxweightrating)) || 0;
  if ((t && (t.hgv === "no" || t.hgv === "destination")) || (mw > 0 && mw < 7.5) || hw === "track" || hw === "cycleway") trucks = "no";
  else if (hw === "primary" || hw === "trunk") trucks = (t && t.hgv === "yes") ? "si" : "possibili";
  else if (hw === "secondary") trucks = "possibili";
  return { fer: base, wkd: Math.min(10, base + tour), trucks };
}

/* ----- network ----------------------------------------------------------- */
async function overpass(query, label) {
  for (let a = 0; a < OVERPASS_EPS.length * 2; a++) {
    const ep = OVERPASS_EPS[a % OVERPASS_EPS.length];
    try {
      const r = await fetch(ep, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "locaClimb-builder/2.0" }, body: "data=" + encodeURIComponent(query) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) {
      console.warn("  ! overpass " + label + " via " + ep.split("/")[2] + " failed (" + e.message + ")");
      await sleep(3000 + 2000 * a);
    }
  }
  throw new Error("overpass exhausted: " + label);
}
async function elevations(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i += 100) {
    const c = pts.slice(i, i + 100);
    const la = c.map((p) => p[0].toFixed(5)).join(","), lo = c.map((p) => p[1].toFixed(5)).join(",");
    let ok = null;
    for (let a = 0; a < 4 && !ok; a++) {
      try { const d = await (await fetch(ELEV_API + "?latitude=" + la + "&longitude=" + lo)).json(); ok = d.elevation; }
      catch { await sleep(2000 * (a + 1)); }
    }
    if (!ok) return null;
    out.push(...ok);
    await sleep(400);
  }
  return out;
}

/* ----- road graph + walking ---------------------------------------------- */
// follow the road from a summit node outward across connected ways
function buildGraph(ways) {
  const nodeWays = new Map(); // nodeId -> [{w, idx}]
  for (const w of ways) {
    if (!w.nodes || !w.geometry || w.nodes.length !== w.geometry.length) continue;
    if (!rideable(w.tags)) continue;
    w.nodes.forEach((nid, idx) => {
      if (!nodeWays.has(nid)) nodeWays.set(nid, []);
      nodeWays.get(nid).push({ w, idx });
    });
  }
  return nodeWays;
}
function sameRoad(a, b) {
  const ta = a.tags || {}, tb = b.tags || {};
  if (ta.ref && ta.ref === tb.ref) return 2;
  if (ta.name && ta.name === tb.name) return 2;
  if (ta.highway === tb.highway) return 1;
  return 0;
}
function walk(startWay, startIdx, dir, nodeWays, capKm) {
  const pts = [[startWay.geometry[startIdx].lat, startWay.geometry[startIdx].lon]];
  const visited = new Set([startWay.id]);
  let w = startWay, i = startIdx, d = dir, dist = 0;
  let prev = pts[0];
  for (let guard = 0; guard < 400; guard++) {
    const ni = i + d;
    if (ni < 0 || ni >= w.geometry.length) {
      // at a way boundary -> try to continue onto a connected rideable way
      const endNode = w.nodes[i];
      const cand = (nodeWays.get(endNode) || []).filter((c) => !visited.has(c.w.id) && c.w.geometry.length > 1);
      if (!cand.length) break;
      cand.sort((x, y) => sameRoad(w, y.w) - sameRoad(w, x.w));
      const nx = cand[0];
      visited.add(nx.w.id);
      w = nx.w; i = nx.idx; d = (i === 0) ? 1 : -1;
      continue;
    }
    const g = w.geometry[ni];
    dist += hav(prev[0], prev[1], g.lat, g.lon);
    pts.push([g.lat, g.lon]);
    prev = [g.lat, g.lon];
    i = ni;
    if (dist >= capKm) break;
  }
  // downsample to <=110 pts
  if (pts.length > 110) {
    const o = [], n = 110;
    for (let k = 0; k < n; k++) o.push(pts[Math.round(k * (pts.length - 1) / (n - 1))]);
    return o;
  }
  return pts;
}
// trim a summit->valley point list to the real climb (valley->summit) using DEM
function buildSide(ptsOut, elevsOut, topLat, topLon) {
  // ptsOut/elevsOut go summit -> outward (descending hopefully). Reverse to valley->summit.
  const pts = ptsOut.slice().reverse(), el = elevsOut.slice().reverse();
  if (pts.length < 4) return null;
  // cumulative distance valley->summit
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + hav(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
  // find climb base: the tightest valley-side start such that base->summit stays a real climb
  // (avg grade >= 4.5% and no long flat stretch). Avoids dragging the start into the valley/town.
  function minWindowGrade(from) {
    let worst = 99;
    for (let i = from; i < pts.length - 1; i++) {
      let j = i;
      while (j < pts.length - 1 && cum[j] - cum[i] < 1) j++;
      const dd = cum[j] - cum[i];
      if (dd <= 0) continue;
      const g = (el[j] - el[i]) / (dd * 1000) * 100;
      if (g < worst) worst = g;
    }
    return worst;
  }
  const end = pts.length - 1;
  let base = 0;
  function avgFrom(i) { const dd = cum[end] - cum[i]; return dd > 0 ? (el[end] - el[i]) / (dd * 1000) * 100 : 0; }
  for (let thr = 4.5; thr >= 3 && base === 0; thr -= 0.75) {
    for (let i = 0; i < end; i++) {
      if (avgFrom(i) >= thr && minWindowGrade(i) >= 1.5) { base = i; break; }
    }
  }
  const segPts = pts.slice(base), segEl = el.slice(base), segCum = cum.slice(base).map((c) => c - cum[base]);
  const dist = segCum[segCum.length - 1];
  if (dist < 1.5) return null;
  const gain = segEl[segEl.length - 1] - segEl[0];
  if (gain < 200) return null;
  const avg = gain / (dist * 1000) * 100;
  if (avg < 3) return null;
  let maxg = 0;
  for (let i = 1; i < segPts.length; i++) {
    const dd = (segCum[i] - segCum[i - 1]) * 1000;
    if (dd > 80) { const g = (segEl[i] - segEl[i - 1]) / dd * 100; if (g > maxg) maxg = g; }
  }
  const dir = compass(segPts[0][0], segPts[0][1], topLat, topLon);
  const n = Math.min(segEl.length, 24);
  const prof = [];
  for (let i = 0; i < n; i++) prof.push(Math.round(segEl[Math.round(i * (segEl.length - 1) / (n - 1))]));
  return {
    side: "Versante " + dir,
    startLat: segPts[0][0], startLon: segPts[0][1],
    startElevation: Math.round(segEl[0]), endElevation: Math.round(segEl[segEl.length - 1]),
    distance_km: Math.round(dist * 10) / 10, avgGradient: Math.round(avg * 10) / 10, maxGradient: Math.round(maxg * 10) / 10,
    traffic: "n/d", exposure: dir, elevationProfile: prof, cat: climbCat(Math.round(dist*10)/10, gain, segEl[segEl.length-1]),
    track: segPts.map((s) => [s[0], s[1]])
  };
}

/* ----- main -------------------------------------------------------------- */
function tiles([s, w, n, e], step) {
  const out = [];
  for (let la = s; la < n; la += step) for (let lo = w; lo < e; lo += step)
    out.push([la, lo, Math.min(la + step, n), Math.min(lo + step, e)]);
  return out;
}
async function main() {
  console.log("locaClimb OSM builder v2  bbox=" + BBOX.join(",") + " tile=" + TILE + " maxEnrich=" + MAX_ENRICH);
  let existing = [];
  try { existing = JSON.parse(await readFile(OUT, "utf8")); } catch { existing = []; }
  const byId = new Map(existing.map((p) => [p.id, p]));
  console.log("  loaded " + existing.length + " existing");

  // 1. tiled fetch: nodes + connected highways with geometry
  const cells = tiles(BBOX, TILE);
  console.log("  fetching " + cells.length + " tiles ...");
  const nodes = new Map(); // id -> el
  const ways = new Map();  // id -> way
  for (let ti = 0; ti < cells.length; ti++) {
    const [a, b, c, d] = cells[ti];
    const HWRE = "motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|track|cycleway"; // rideable + motorway (needed to EXCLUDE passes only on motorways)
    const q = '[out:json][timeout:90];(node["mountain_pass"="yes"](' + a + ',' + b + ',' + c + ',' + d + ');)->.p;way(around.p:120)["highway"~"^(' + HWRE + ')$"];(.p;._;);out geom tags;';
    try {
      const data = await overpass(q, "tile " + (ti + 1) + "/" + cells.length);
      for (const el of (data.elements || [])) {
        if (el.type === "node" && el.tags && el.tags.mountain_pass) nodes.set(el.id, el);
        else if (el.type === "way") ways.set(el.id, el);
      }
      process.stdout.write("  tile " + (ti + 1) + "/" + cells.length + " ok (nodes=" + nodes.size + " ways=" + ways.size + ")\r");
    } catch (e) { console.warn("\n  ! tile " + (ti + 1) + " skipped: " + e.message); }
    await sleep(2500);
  }
  console.log("\n  total: " + nodes.size + " pass nodes, " + ways.size + " ways");
  const nodeWays = buildGraph([...ways.values()]);

  // 2. filter + base records (snap summit to road, attach traffic)
  let kept = 0, skippedHiking = 0;
  // precompute rideable ways once (snap search uses geographic gating for speed)
  const rways = [...ways.values()].filter((w) => w.geometry && w.geometry.length > 1 && rideable(w.tags));
  const CLASS = { primary: 6, secondary: 5, tertiary: 4, unclassified: 3, residential: 3, track: 2, cycleway: 4 };
  const order = [];
  for (const el of nodes.values()) {
    const elev = el.tags.ele ? parseInt(el.tags.ele, 10) : 0;
    if (isNaN(elev) || elev < MIN_ELE) continue;
    // snap pass to nearest rideable road vertex within ~130m; among near ties prefer higher road class
    let chosen = null, bd = 0.13;
    for (const w of rways) {
      // cheap bbox gate
      if (Math.abs(w.geometry[0].lat - el.lat) > 0.03 && Math.abs(w.geometry[w.geometry.length - 1].lat - el.lat) > 0.03) continue;
      for (let i = 0; i < w.geometry.length; i++) {
        const dd = hav(el.lat, el.lon, w.geometry[i].lat, w.geometry[i].lon);
        if (dd < bd - 0.02 || (dd < bd + 0.02 && chosen && (CLASS[w.tags.highway] || 0) > (CLASS[chosen.w.tags.highway] || 0))) { bd = dd; chosen = { w, idx: i }; }
      }
    }
    let lat = el.lat, lon = el.lon, snapped = false;
    if (!chosen) { skippedHiking++; continue; } // no rideable road near -> hiking/ferrata, drop
    lat = chosen.w.geometry[chosen.idx].lat; lon = chosen.w.geometry[chosen.idx].lon; snapped = true;
    const id = "osm-" + el.id;
    const name = (el.tags.name || "Passo").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const prev = byId.get(id);
    const rec = prev || { id, name, lat, lon, elevation: elev };
    rec.name = name; rec.lat = lat; rec.lon = lon; rec.elevation = elev; rec.snapped = snapped; rec.nodeId = el.id;
    rec.surfaceLabel = surfaceLabel(chosen.w.tags) || "";
    const tr = computeTraffic(chosen.w.tags, elev);
    rec.trafFeriale = tr.fer; rec.trafWeekend = tr.wkd; rec.trucks = tr.trucks;
    rec._chosen = chosen;
    byId.set(id, rec);
    order.push(id);
    kept++;
  }
  console.log("  kept " + kept + " rideable, skipped " + skippedHiking + " not-on-road");

  // 3. enrich offline (no Overpass): walk road graph + DEM elevation
  const todo = order.filter((id) => REENRICH || !(byId.get(id).versanti && byId.get(id).versanti.length));
  const batch = todo.slice(0, MAX_ENRICH);
  console.log("  enriching " + batch.length + " (" + (todo.length - batch.length) + " deferred)");
  let ok = 0, fail = 0;
  for (let i = 0; i < batch.length; i++) {
    const rec = byId.get(batch[i]);
    process.stdout.write("  [" + (i + 1) + "/" + batch.length + "] " + rec.name + " (" + rec.elevation + "m) ... ");
    const ch = rec._chosen;
    if (!ch) { fail++; console.log("no road"); continue; }
    try {
      const sideA = walk(ch.w, ch.idx, -1, nodeWays, 14);
      const sideB = walk(ch.w, ch.idx, 1, nodeWays, 14);
      const cands = [sideA, sideB].filter((s) => s && s.length >= 4);
      const vs = [];
      for (const pts of cands) {
        const ev = await elevations(pts);
        if (!ev) continue;
        const v = buildSide(pts, ev, rec.lat, rec.lon);
        if (v) vs.push(v);
      }
      if (!vs.length) { fail++; console.log("no climb data"); continue; }
      vs.sort((a, b) => b.distance_km - a.distance_km);
      rec.versanti = vs.slice(0, 2);
      rec.difficulty = Math.max(...rec.versanti.map((v) => estDiff(v.distance_km, v.endElevation - v.startElevation, v.endElevation)));
      rec.cat = rec.versanti.map((v)=>v.cat).filter(Boolean).sort((a,b)=>catRank(b)-catRank(a))[0]||null;
      ok++; console.log("ok (" + rec.versanti.length + " versanti, diff " + rec.difficulty + ")");
    } catch (e) { fail++; console.log("err: " + e.message); }
  }

  // 4. write (strip transient fields)
  const result = [...byId.values()].map((r) => { const o = { ...r }; delete o._chosen; return o; }).sort((a, b) => (b.elevation || 0) - (a.elevation || 0));
  await writeFile(OUT, JSON.stringify(result, null, 1) + "\n", "utf8");
  const enr = result.filter((p) => p.versanti && p.versanti.length).length;
  console.log("DONE: " + result.length + " passes, " + enr + " enriched (now +" + ok + ", fail " + fail + "). wrote " + OUT);

  // 5. regenerate curated passes from the same road graph (fix wrong points/profiles) -> overrides
  if (!process.argv.includes("--no-curated")) {
    try {
      const code = await readFile("passes_data.js", "utf8");
      const ctx = {}; vm.createContext(ctx); vm.runInContext(code, ctx);
      const curated = ctx.PASSES_DATA || [];
      const overrides = {};
      console.log("  curated override: processing " + curated.length + " passes ...");
      for (const p of curated) {
        let chosen = null, bd = 0.13;
        for (const w of rways) {
          if (Math.abs(w.geometry[0].lat - p.lat) > 0.04 && Math.abs(w.geometry[w.geometry.length - 1].lat - p.lat) > 0.04) continue;
          for (let i = 0; i < w.geometry.length; i++) { const dd = hav(p.lat, p.lon, w.geometry[i].lat, w.geometry[i].lon); if (dd < bd) { bd = dd; chosen = { w, idx: i }; } }
        }
        if (!chosen) { console.log("    - " + p.name + ": no road"); continue; }
        const slat = chosen.w.geometry[chosen.idx].lat, slon = chosen.w.geometry[chosen.idx].lon;
        try {
          const sides = [walk(chosen.w, chosen.idx, -1, nodeWays, 16), walk(chosen.w, chosen.idx, 1, nodeWays, 16)].filter((s) => s && s.length >= 4);
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
      console.log("  wrote curated_overrides.json (" + Object.keys(overrides).length + " passes)");
    } catch (e) { console.warn("  ! curated override skipped: " + e.message); }
  }
}
main().catch((e) => { console.error("FATAL: " + e.stack); process.exit(1); });
