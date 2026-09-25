#!/usr/bin/env node
/*
 * golden_snapshot.mjs - write/refresh the golden baseline (test/golden/golden.json)
 * from the CURRENT data, for the passes listed in test/golden/golden_list.json.
 *
 * THIS IS THE HUMAN APPROVAL STEP. Running it declares "the current data for these
 * passes is correct". Review the printed table (versanti, km, gain) against what you
 * know of each climb BEFORE committing the result. AI agents must never run it.
 *
 *   node scripts/golden_snapshot.mjs --dry            # print the review table only, write nothing
 *   node scripts/golden_snapshot.mjs                  # (re)write the whole baseline
 *   node scripts/golden_snapshot.mjs --only stelvio   # refresh one pass, keep the rest untouched
 *
 * golden_list.json entries: { "name": "Passo dello Spluga" } or { "id": "osm-123456" },
 * optional "note". An ambiguous or missing name is reported, not guessed - pin it with an id.
 * Node 22+, no deps. Run from repo root.
 */
import { readFile, writeFile } from "node:fs/promises";
import { loadEffective, resolveEntry, snapshotPass, datasetStats, GOLDEN_FILE, GOLDEN_LIST } from "./lib/golden.mjs";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const oi = args.indexOf("--only");
const ONLY = oi >= 0 ? args[oi + 1] : null;

const list = JSON.parse(await readFile(GOLDEN_LIST, "utf8"));
const data = await loadEffective();
console.log(`dataset: ${data.curated.length} curated + ${data.osm.length} OSM (files: ${data.files.join(", ")})\n`);

let prev = { passes: [] };
try { prev = JSON.parse(await readFile(GOLDEN_FILE, "utf8")); } catch {}

const out = [], problems = [];
for (const entry of list) {
  const r = resolveEntry(entry, data);
  if (r.error) { problems.push(r.error); continue; }
  const snap = snapshotPass(r.pass, entry.note);
  if (ONLY && snap.id !== ONLY) {
    const keep = prev.passes.find((p) => p.id === snap.id);
    if (keep) { out.push(keep); continue; }
  }
  out.push(snap);
  printPass(snap, ONLY && snap.id === ONLY);
}

if (problems.length) {
  console.log("\n⚠ Da sistemare in golden_list.json:");
  problems.forEach((p) => console.log("  - " + p));
}
if (ONLY && !out.some((p) => p.id === ONLY)) { console.error(`\n--only ${ONLY}: id not in the list`); process.exit(1); }

if (DRY) { console.log("\n(--dry: nothing written)"); process.exit(problems.length ? 1 : 0); }
const stats = ONLY && prev.stats ? prev.stats : datasetStats(data);
console.log(`\ndataset stats: ${JSON.stringify(stats)}`);
const doc = {
  _comment: "Golden baseline - human-approved. Regenerate ONLY via scripts/golden_snapshot.mjs after reviewing its output. Agents: never edit.",
  approvedAt: new Date().toISOString().slice(0, 10),
  stats,
  passes: out
};
await writeFile(GOLDEN_FILE, JSON.stringify(doc, null, 1) + "\n", "utf8");
console.log(`\nwrote ${GOLDEN_FILE} (${out.length} passes). Review the git diff, then commit.`);

function printPass(s, mark) {
  console.log(`${mark ? "» " : ""}${s.name}  [${s.id}, ${s.src}]  ${s.summit.elevation} m  - ${s.versanti.length} versanti`);
  if (!s.versanti.length) console.log("     ⚠ 0 versanti: e' davvero corretto? Un baseline vuoto non protegge nulla");
  s.versanti.forEach((v) => console.log(`     · ${String(v.side).padEnd(28)} ${String(v.distance_km).padStart(5)} km  +${v.gain} m  ${v.avgGradient}%`));
}
