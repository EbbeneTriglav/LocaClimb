#!/usr/bin/env node
/*
 * prune_candidates.mjs
 * ---------------------------------------------------------------------------
 * Applies the builder's candidate gate to ALREADY-BUILT osm_passes*.json, so a file
 * does not have to be rebuilt (hours of CI) just to re-tune the threshold.
 *
 * Only touches records carrying `src` ("saddle"/"peak") - i.e. climbs found by toponym,
 * not mountain_pass=yes nodes, which are real passes and are never pruned.
 * A candidate with no computed versante is always dropped; --min-gain additionally thins the minor ones
 * (every versante already clears the builder floor of >=200 m over >=1.5 km, so 0 keeps all real climbs).
 *
 *   node scripts/prune_candidates.mjs                    # default: only drops 0-versanti candidates
 *   node scripts/prune_candidates.mjs --min-gain 400     # also thins out the minor climbs
 *   node scripts/prune_candidates.mjs --dry-run          # just list what would go
 * Then:  node scripts/build_osm_index.mjs
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import { dataPath, DATA_DIR } from "./lib/paths.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const MIN_GAIN = parseInt(arg("--min-gain", "0"), 10);
const DRY = process.argv.includes("--dry-run");
const J5 = (k, v) => (typeof v === "number" && !Number.isInteger(v)) ? Math.round(v * 1e5) / 1e5 : v;

const bestGain = (p) => (p.versanti || []).reduce((m, v) => Math.max(m, (v.endElevation || 0) - (v.startElevation || 0)), 0);

for (const f of (await readdir(DATA_DIR)).filter((x) => /^osm_passes.*\.json$/.test(x))) {
  const arr = JSON.parse(await readFile(dataPath(f), "utf8"));
  const drop = arr.filter((p) => p.src && bestGain(p) < MIN_GAIN);
  if (!drop.length) { console.log(f + ": nulla da togliere"); continue; }
  console.log(f + ": " + arr.length + " -> " + (arr.length - drop.length) + " (tolti " + drop.length + ")");
  for (const p of drop.slice(0, 12)) console.log("    - " + p.name + " (" + p.elevation + " m, disl. " + bestGain(p) + " m)");
  if (drop.length > 12) console.log("    ... e altri " + (drop.length - 12));
  if (DRY) continue;
  const keep = arr.filter((p) => !(p.src && bestGain(p) < MIN_GAIN));
  await writeFile(dataPath(f), JSON.stringify(keep, J5) + "\n", "utf8");
}
console.log(DRY ? "\n(dry-run: nessun file scritto)" : "\nfatto - ora: node scripts/build_osm_index.mjs");
