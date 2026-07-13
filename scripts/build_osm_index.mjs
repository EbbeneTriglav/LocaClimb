#!/usr/bin/env node
/*
 * build_osm_index.mjs
 * ---------------------------------------------------------------------------
 * The map needs ~10 fields per pass to draw a marker; the full osm_passes*.json
 * carry the road tracks too (~40 MB across all regions). Downloading all of that
 * before the FIRST marker appears is why the map looked empty on load.
 *
 * This emits data/osm_index.json: every pass of every region file, marker fields
 * only (~0.5 MB, ~120 KB gzipped). The frontend draws from it immediately and
 * hydrates the tracks in the background.
 *
 * Run after any osm_passes*.json changes:  node scripts/build_osm_index.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { dataPath } from "./lib/paths.mjs";

const J5 = (k, v) => (typeof v === "number" && !Number.isInteger(v)) ? Math.round(v * 1e5) / 1e5 : v;

// Names were HTML-encoded by older builds ("Ucc&#39;Aidu"). Decode on the way into the index so
// stale region files still yield clean labels; the builder now writes them raw.
function decodeEntities(s) {
  return String(s == null ? "" : s)
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return m; } })
    .replace(/&#(\d+);/g, (m, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch { return m; } })
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

let regions;
try { regions = JSON.parse(await readFile(dataPath("osm_regions.json"), "utf8")); }
catch { regions = ["osm_passes.json"]; }

const out = [];
for (const f of regions) {
  let arr;
  try { arr = JSON.parse(await readFile(dataPath(f), "utf8")); }
  catch { console.log("  - " + f + ": missing, skipped"); continue; }   // xb_* not built yet: expected
  let n = 0;
  for (const p of arr) {
    if (!p || p.lat == null || p.lon == null) continue;
    const hasV = !!(p.versanti && p.versanti.length);
    if (!hasV && !p.snapped) continue;                                   // the frontend would not draw it anyway
    const r = { id: p.id, name: decodeEntities(p.name), lat: p.lat, lon: p.lon, elevation: p.elevation || 0 };
    if (p.difficulty) r.difficulty = p.difficulty;
    if (p.cat) r.cat = p.cat;
    if (p.surfaceLabel) r.surfaceLabel = p.surfaceLabel;
    if (p.snapped) r.snapped = 1;
    if (hasV) r.hasV = 1;                                                // "tracks exist, fetch them on demand"
    if (p.algo) r.algo = p.algo;
    if (p.updatedAt) r.updatedAt = p.updatedAt;
    out.push(r); n++;
  }
  console.log("  " + f + ": " + n);
}

const js = JSON.stringify(out, J5) + "\n";
await writeFile(dataPath("osm_index.json"), js, "utf8");
console.log("wrote osm_index.json (" + out.length + " passes, " + Math.round(js.length / 1024) + " KB)");
