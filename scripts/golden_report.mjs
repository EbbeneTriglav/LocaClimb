#!/usr/bin/env node
/*
 * golden_report.mjs - human-readable Markdown report of the golden comparison, meant for
 * the GitHub Actions run page: `node scripts/golden_report.mjs >> "$GITHUB_STEP_SUMMARY"`.
 * Never fails (exit 0): the pass/fail decision belongs to test/golden.test.mjs.
 */
import { readFile } from "node:fs/promises";
import { loadEffective, comparePass, datasetStats, compareStats, GOLDEN_FILE } from "./lib/golden.mjs";

let golden;
try { golden = JSON.parse(await readFile(GOLDEN_FILE, "utf8")); } catch {
  console.log("### Golden set\n\nNessun baseline (`test/golden/golden.json`) - esegui `node scripts/golden_snapshot.mjs`.");
  process.exit(0);
}
const data = await loadEffective();
const byId = new Map(data.all.map((p) => [String(p.id), p]));
const cur = datasetStats(data);
const st = compareStats(golden.stats, cur);

const rows = [], details = [];
let bad = st.errors.length;
for (const base of golden.passes) {
  const p = byId.get(base.id);
  const r = comparePass(base, p);
  if (r.errors.length) bad++;
  const icon = r.errors.length ? "❌" : r.warnings.length ? "⚠️" : "✅";
  rows.push(`| ${icon} | ${base.name} | ${base.versanti.length} → ${p ? (p.versanti || []).length : "—"} | ${base.summit.elevation} → ${p ? p.elevation : "—"} |`);
  r.errors.concat(r.warnings).forEach((m) => details.push("- " + m));
}
const lines = [
  `### Golden set — ${bad ? "❌ " + bad + " problemi" : "✅ tutto nei limiti"}`,
  `Baseline approvato: ${golden.approvedAt || "?"}`,
  "",
  "| Contatore | Baseline | Ora |", "|---|---|---|",
  ...Object.keys(cur).map((k) => `| ${k} | ${golden.stats ? golden.stats[k] : "—"} | ${cur[k]} |`),
  "",
  "| | Passo | Versanti | Quota vetta |", "|---|---|---|---|",
  ...rows
];
const all = st.errors.concat(st.warnings).map((m) => "- " + m).concat(details);
if (all.length) lines.push("", "<details><summary>Dettagli</summary>", "", ...all, "", "</details>");
console.log(lines.join("\n"));
