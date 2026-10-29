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
import { resolveReview, DEFAULT_REVIEW } from "./lib/discover_review.mjs";
import path from "node:path";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const REGION = arg("--region", "");
if (!/^[a-z_-]+$/.test(REGION)) { console.error("uso: node scripts/promote_discover.mjs --region er"); process.exit(1); }
const OUTF = "osm_passes_disc_" + REGION + ".json";
const J5 = (k, v) => (typeof v === "number" && !Number.isInteger(v)) ? Math.round(v * 1e5) / 1e5 : v;

const disc = JSON.parse(await readFile(dataPath("discover_" + REGION + ".json"), "utf8"));
// No review file yet (a region never reviewed by hand): publish with the default rule, the one
// verified on Emilia-Romagna (groups "nuova" + "doppione"), and create the file so that "no"
// decisions can be added to it later.
const REVIEW_F = "discover_" + REGION + "_review.json";
let reviewRaw = null, review;
try { reviewRaw = await readFile(dataPath(REVIEW_F), "utf8"); review = JSON.parse(reviewRaw); }
catch (e) {
  if (e.code !== "ENOENT") throw e;
  review = { _comment: "Creato in automatico da promote_discover.mjs: si pubblicano i gruppi in 'publish'. Per togliere una salita aggiungi il suo id in 'no'.", ...DEFAULT_REVIEW, ok: [], no: [] };
  console.log("  " + REVIEW_F + " assente: regola di default (" + review.publish.join(" + ") + ")");
}
// decisions follow their climb when a summit moved and its id changed (see lib/discover_review.mjs)
const rr = resolveReview(review, disc);
for (const m of rr.moved) console.log("  " + m.kind + ": " + m.from + " -> " + m.to + " (stessa cima, id cambiato)");
const ok = rr.ok, no = rr.no, publish = new Set(rr.review.publish || []);

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
// Regions overlap (Trentino / Veneto share the Dolomites): a top already PUBLISHED by another
// region file is the same climb, not a new one. Same 1.5 km rule the discovery itself uses.
const otherTops = known.filter((p) => p && p.lat != null);
const nearKnownTop = (p) => otherTops.some((k) => Math.abs(k.lat - p.lat) < 0.02 && Math.abs(k.lon - p.lon) < 0.03
  && Math.hypot((k.lat - p.lat) * 111, (k.lon - p.lon) * 111 * Math.cos(p.lat * Math.PI / 180)) < 1.5);

const out = [], stat = {};
for (const p of disc) {
  if (!p.versanti || !p.versanti.length) continue;
  let mn = 1;
  for (const v of p.versanti) mn = Math.min(mn, ctx.dvOverlap(v.track, grid));
  const g = ctx.dvGroup(p, mn);
  const dupTop = nearKnownTop(p);
  const pub = !no.has(p.id) && !dupTop && (ok.has(p.id) || publish.has(g));
  stat[g] = stat[g] || { tot: 0, pub: 0, dup: 0 }; stat[g].tot++; if (pub) stat[g].pub++; if (dupTop) stat[g].dup++;
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
// review file: written only when something changed (new file, ids moved, positions added)
const reviewNext = JSON.stringify(rr.review, null, 1) + "\n";
if (reviewNext !== reviewRaw) { await writeFile(dataPath(REVIEW_F), reviewNext, "utf8"); console.log("aggiornato data/" + REVIEW_F); }
for (const g of Object.keys(stat)) console.log("  " + g + ": " + stat[g].pub + " pubblicate su " + stat[g].tot + (stat[g].dup ? " (" + stat[g].dup + " gia' pubblicate da un'altra regione)" : ""));
console.log("scritto data/" + OUTF + " (" + out.length + " salite)");
