#!/usr/bin/env node
/*
 * build_poi.mjs - water and food points, baked into small static tiles.
 *
 * Why: drinking water, springs, bars, bakeries... were asked LIVE to the public Overpass
 * servers on every map move. When those servers are overloaded (October 2026: overpass-api.de
 * and private.coffee not answering, mail.ru 504) the water and food layers simply died.
 * Now the same points come from the OSM extracts the workflows already download, are cut into
 * 0.25 deg tiles and served by Cloudflare with the site. js/poilocal.js answers the app's
 * Overpass queries from these tiles and only falls back to Overpass outside their coverage.
 *
 *   node scripts/build_poi.mjs --in a.geojsonseq[,b.geojsonseq...] [--out data/poi]
 *
 * Input: osmium export (geojsonseq, -a type,id) of
 *   osmium tags-filter X.osm.pbf n/amenity=drinking_water,fountain,cafe,bar,pub,restaurant,fast_food,ice_cream
 *          n/man_made=water_tap n/natural=spring n/shop=bakery,convenience,supermarket,greengrocer,pastry
 * Output: <out>/c/<la>_<lo>.json  { "n": [[id, lat, lon, {tags}]] }   la = floor(lat*4), lo = floor(lon*4)
 *         <out>/index.json         { cell: 0.25, built, cells: [...] }  (a tile listed here is authoritative)
 */
import { createReadStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";
import { DATA_DIR } from "./lib/paths.mjs";

export const POI_KEEP = ["amenity", "man_made", "natural", "drinking_water", "shop", "name", "opening_hours", "operator"];
export const POI_WATER = { amenity: ["drinking_water", "fountain"], man_made: ["water_tap"], natural: ["spring"] };
export const POI_FOOD = { amenity: ["cafe", "bar", "pub", "restaurant", "fast_food", "ice_cream"], shop: ["bakery", "convenience", "supermarket", "greengrocer", "pastry"] };

export function poiWanted(t) {
  if (!t) return false;
  for (const set of [POI_WATER, POI_FOOD]) for (const k in set) if (set[k].includes(t[k])) return true;
  return false;
}
export function poiTags(p) {
  const t = {};
  for (const k of POI_KEEP) if (p[k] != null && p[k] !== "") t[k] = String(p[k]).slice(0, 120);
  return t;
}
export function cellKey(lat, lon) { return Math.floor(lat * 4) + "_" + Math.floor(lon * 4); }

async function main() {
  const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
  const inputs = arg("--in", "").split(",").map((s) => s.trim()).filter(Boolean);
  const outDir = arg("--out", "") ? path.resolve(arg("--out")) : path.join(DATA_DIR, "poi");
  if (!inputs.length) { console.error("uso: node scripts/build_poi.mjs --in a.geojsonseq[,b...] [--out data/poi]"); process.exit(1); }
  const cells = new Map(), seen = new Set();
  let n = 0;
  for (const file of inputs) {
    const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
    for await (let ln of rl) {
      ln = ln.trim(); if (!ln) continue;
      if (ln.charCodeAt(0) === 0x1e) ln = ln.slice(1);
      let f; try { f = JSON.parse(ln); } catch { continue; }
      if (!f.geometry || f.geometry.type !== "Point" || !f.properties) continue;
      if (!poiWanted(f.properties)) continue;
      const id = Number(String(f.properties["@id"] || "").replace(/\D/g, ""));
      if (!id || seen.has(id)) continue;                      // border extracts overlap
      seen.add(id);
      const lon = Math.round(f.geometry.coordinates[0] * 1e5) / 1e5, lat = Math.round(f.geometry.coordinates[1] * 1e5) / 1e5;
      const k = cellKey(lat, lon);
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push([id, lat, lon, poiTags(f.properties)]);
      n++;
    }
  }
  await rm(outDir, { recursive: true, force: true });
  await mkdir(path.join(outDir, "c"), { recursive: true });
  let bytes = 0;
  for (const [k, list] of cells) {
    list.sort((a, b) => a[0] - b[0]);                           // stable output -> small git diffs
    const js = JSON.stringify({ n: list });
    bytes += js.length;
    await writeFile(path.join(outDir, "c", k + ".json"), js + "\n", "utf8");
  }
  const keys = [...cells.keys()].sort();
  await writeFile(path.join(outDir, "index.json"), JSON.stringify({ cell: 0.25, built: new Date().toISOString().slice(0, 10), cells: keys }) + "\n", "utf8");
  console.log("punti: " + n + " in " + keys.length + " riquadri, " + (bytes / 1048576).toFixed(1) + " MB");
}
if (process.argv[1] && process.argv[1].endsWith("build_poi.mjs")) main().catch((e) => { console.error(e); process.exit(1); });
