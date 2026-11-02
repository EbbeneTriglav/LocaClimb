/*
 * osm_priority.mjs - the priority queue of osm-rotate.yml (02/11/2026).
 * data/osm_priority.json = { "since": "YYYY-MM-DD", "note": "...", "targets": ["spain-nord", ...] }.
 * A target is still pending while the newest build of it (osm_regions_meta.json builtAt) is older
 * than "since". osm-rotate takes the pending targets first, in order (1 tick in 4 rotates among them,
 * so a failing zone cannot block the queue), then goes back
 * to its normal round of every zone. No state file: each osm-expand run writes builtAt itself.
 * CLI: node scripts/osm_priority.mjs  -> prints the pending targets, space separated.
 */
import { readFileSync } from "node:fs";
import { dataPath } from "./lib/paths.mjs";

export function pendingTargets(queue, meta, known = null) {
  if (!queue || !Array.isArray(queue.targets) || !/^\d{4}-\d{2}-\d{2}$/.test(queue.since || "")) return [];
  const built = {};
  for (const v of Object.values(meta || {})) if (v && v.target && (!built[v.target] || v.builtAt > built[v.target])) built[v.target] = v.builtAt;
  return queue.targets.filter((t, i, a) => a.indexOf(t) === i && (!known || known.includes(t)) && !(built[t] && built[t] >= queue.since));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const read = (f, d) => { try { return JSON.parse(readFileSync(dataPath(f), "utf8")); } catch { return d; } };
  const known = process.env.TARGETS ? process.env.TARGETS.split(/\s+/).filter(Boolean) : null;
  process.stdout.write(pendingTargets(read("osm_priority.json", null), read("osm_regions_meta.json", {}), known).join(" "));
}
