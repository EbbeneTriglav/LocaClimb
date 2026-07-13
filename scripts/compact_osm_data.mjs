#!/usr/bin/env node
/*
 * compact_osm_data.mjs  (one-shot, idempotent - safe to re-run)
 * ---------------------------------------------------------------------------
 * Brings the already-built osm_passes*.json in line with the builder's new output:
 *   1. names stored RAW (older builds wrote "Passo Ucc&#39;Aidu" into the JSON, which the
 *      frontend then escaped again -> the entity showed up on the label);
 *   2. compact JSON + coords rounded to 5 decimals (~1.1 m): 42 MB -> 18 MB, same data.
 * Without this the fixes only land at the next full PBF rebuild (hours). Run:
 *   node scripts/compact_osm_data.mjs && node scripts/build_osm_index.mjs
 */
import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { dataPath, DATA_DIR } from "./lib/paths.mjs";

const J5 = (k, v) => (typeof v === "number" && !Number.isInteger(v)) ? Math.round(v * 1e5) / 1e5 : v;
const decode = (s) => String(s == null ? "" : s)
  .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return m; } })
  .replace(/&#(\d+);/g, (m, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch { return m; } })
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

const files = (await readdir(DATA_DIR)).filter((f) => /^osm_passes.*\.json$/.test(f));
for (const f of files) {
  const before = (await stat(dataPath(f))).size;
  const arr = JSON.parse(await readFile(dataPath(f), "utf8"));
  let fixed = 0;
  for (const p of arr) { const n = decode(p.name); if (n !== p.name) { p.name = n; fixed++; } }
  await writeFile(dataPath(f), JSON.stringify(arr, J5) + "\n", "utf8");
  const after = (await stat(dataPath(f))).size;
  console.log(f + ": nomi corretti " + fixed + ", " + (before / 1048576).toFixed(1) + " MB -> " + (after / 1048576).toFixed(1) + " MB");
}
console.log("fatto - ora: node scripts/build_osm_index.mjs");
