#!/usr/bin/env node
/*
 * promote_discover.mjs - publishes the reviewed part of data/discover_<region>.json.
 *
 *   node scripts/promote_discover.mjs --region er
 *
 * Input:  data/discover_<region>.json          (workflow "OSM discover", never loaded by the app)
 *         data/discover_<region>_review.json   ({ publish: [groups], ok: [ids], no: [ids] } - Rick's review)
 * Output: data/osm_passes_disc_<region>.json   (a normal region file: the app loads it once it is in
 *                                               osm_regions.json, like every osm_passes*.json)
 * A climb is published when it is not in "no" AND (it is in "ok" OR its group is in "publish").
 * The group is computed EXACTLY as on the review page: the same functions of js/discoverview.js
 * (dvGrid / dvOverlap / dvGroup), run here in a vm, against the climbs already published.
 * Deterministic and re-runnable: a new discover run + the same review file -> same rule.
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import vm from "node:vm";
import { dataPath, DATA_DIR, ROOT } from "./lib/paths.mjs";
import path from "node:path";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const REGION = arg("--region", "");
if (!/^[a-z_]+$/.test(REGION)) { console.error("uso: node scripts/promote_discover.mjs --region er"); process.exit(1); }
const OUTF = "osm_passes_disc_" + REGION + ".json";
const J5 = (k, v) => (typeof v === "number" && !Number.isInteger(v)) ? Math.round(v * 1e5) / 1e5 : v;

const disc = JSON.parse(await readFile(dataPath("discover_" + REGION + ".json"), "utf8"));
const review = JSON.parse(await readFile(dataPath("discover_" + REGION + "_review.json"), "utf8"));
const ok = new Set(review.ok || []), no = new Set(review.no || []), publish = new Set(review.publish || []);

const ctx = {};
vm.createContext(ctx);
vm.runInContext(await readFile(path.join(ROOT, "js", "discoverview.js"), "utf8"), ctx);

// climbs already published in the area: every region file except our own output, + curated
let la0 = 90, la1 = -90, lo0 = 180, lo1 = -180;
for (const p of disc) { la0 = Math.min(la0, p.lat); la1 = Math.max(la1, p.lat); lo0 = Math.min(lo0, p.lon); lo1 = Math.max(lo1, p.lon); }
const inArea = (p) => p && p.lat > la0 - 0.3 && p.lat < la1 + 0.3 && p.lon > lo0 - 0.3 && p.lon < lo1 + 0.3;
const known = [];
for (const f of (await readdir(DATA_DIR)).filter((x) => /^osm_passes.*\.json$/.test(x) && x !== OUTF)) {
  try { for (const p of JSON.parse(await readFile(dataPath(f), "utf8"))) if (inArea(p)) known.push(p); } catch { /* unreadable file: skip */ }
}
try {
  const c = {}; vm.createContext(c); vm.runInContext(await readFile(dataPath("passes_data.js"), "utf8"), c);
  let ov = {}; try { ov = JSON.parse(await readFile(dataPath("curated_overrides.json"), "utf8")); } catch { /* none */ }
  for (const p of (c.PASSES_DATA || [])) { const o = ov[p.id]; known.push(o && o.versanti && o.versanti.length ? { lat: p.lat, lon: p.lon, versanti: o.versanti } : p); }
} catch { /* no curated file */ }
const grid = ctx.dvGrid(known);

const out = [], stat = {};
for (const p of disc) {
  if (!p.versanti || !p.versanti.length) continue;
  let mn = 1;
  for (const v of p.versanti) mn = Math.min(mn, ctx.dvOverlap(v.track, grid));
  const g = ctx.dvGroup(p, mn);
  const pub = !no.has(p.id) && (ok.has(p.id) || publish.has(g));
  stat[g] = stat[g] || { tot: 0, pub: 0 }; stat[g].tot++; if (pub) stat[g].pub++;
  if (!pub) continue;
  const r = JSON.parse(JSON.stringify(p));
  if (/^Cima senza nome$/.test(r.name)) {
    // placeholder name -> the town of the longest side ("Da Bobbio" -> "Salita da Bobbio")
    const best = r.versanti.slice().sort((a, b) => b.distance_km - a.distance_km)[0];
    if (best && /^Da /.test(best.side)) r.name = "Salita d" + best.side.slice(1);
  }
  delete r.prom;
  out.push(r);
}
out.sort((a, b) => (b.elevation || 0) - (a.elevation || 0));
await writeFile(dataPath(OUTF), JSON.stringify(out, J5) + "\n", "utf8");
for (const g of Object.keys(stat)) console.log("  " + g + ": " + stat[g].pub + " pubblicate su " + stat[g].tot);
console.log("scritto data/" + OUTF + " (" + out.length + " salite)");
