#!/usr/bin/env node
/*
 * bake_routes.mjs
 * Pre-fetch OSRM bike geometry for every curated versante and write
 * routes_baked.json, keyed EXACTLY like the app's runtime routeCache so the
 * 25 curated passes never hit OSRM in the browser.
 *
 *   key   = startLat + "," + startLon + ">" + summitLat + "," + summitLon
 *   value = [[lat,lon], ...]   (Leaflet order, ready to draw)
 *
 * Node 22+, no deps. 100% ASCII. Run from repo root:
 *   node scripts/bake_routes.mjs [--out routes_baked.json] [--data passes_data.js]
 */
import { readFile, writeFile } from "node:fs/promises";
import vm from "node:vm";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const OUT = arg("--out", "routes_baked.json");
const DATA = arg("--data", "passes_data.js");
const OSRM = "https://router.project-osrm.org/route/v1/bike/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadPasses() {
  const code = await readFile(DATA, "utf8");
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx.PASSES_DATA || [];
}
async function osrm(v, p, tries = 4) {
  const url = OSRM + v.startLon + "," + v.startLat + ";" + p.lon + "," + p.lat + "?overview=full&geometries=geojson";
  for (let a = 1; a <= tries; a++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "locaClimb-baker/1.0" } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const d = await r.json();
      if (!d.routes || !d.routes.length) throw new Error("no route");
      return d.routes[0].geometry.coordinates.map((c) => [c[1], c[0]]);
    } catch (e) {
      if (a === tries) { console.warn("  ! skip " + p.name + "/" + v.side + ": " + e.message); return null; }
      await sleep(2000 * a);
    }
  }
}
async function main() {
  const passes = await loadPasses();
  let existing = {};
  try { existing = JSON.parse(await readFile(OUT, "utf8")); } catch { existing = {}; }
  const out = { ...existing };
  let done = 0, total = 0;
  for (const p of passes) for (const v of (p.versanti || [])) {
    total++;
    const key = v.startLat + "," + v.startLon + ">" + p.lat + "," + p.lon;
    if (out[key]) continue; // already baked
    process.stdout.write("  " + p.name + " <- " + v.side + " ... ");
    const coords = await osrm(v, p);
    if (coords) { out[key] = coords; done++; console.log(coords.length + " pts"); }
    else console.log("FAIL");
    await sleep(1100); // OSRM demo: <= 1 req/s
  }
  await writeFile(OUT, JSON.stringify(out) + "\n", "utf8");
  console.log("DONE: " + Object.keys(out).length + "/" + total + " versanti baked (" + done + " new). wrote " + OUT);
}
main().catch((e) => { console.error("FATAL: " + e.stack); process.exit(1); });
