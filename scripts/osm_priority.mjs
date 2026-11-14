/*
 * osm_priority.mjs - the priority queue of osm-rotate.yml (02/11/2026).
 * data/osm_priority.json = { "since": "YYYY-MM-DD", "note": "...", "targets": ["spain-nord", ...] }.
 * A target is still pending while the newest build of it (osm_regions_meta.json builtAt) is older
 * than "since". osm-rotate takes the pending targets first, in order (1 tick in 4 rotates among them,
 * so a failing zone cannot block the queue), then goes back
 * to its normal round of every zone. No state file: each osm-expand run writes builtAt itself.
 * CLI: node scripts/osm_priority.mjs  -> prints the pending targets, space separated.
 *      TARGETS="..." IDX=n FAILED="..." node scripts/osm_priority.mjs --next  -> the zone osm-rotate builds now.
 */
import { readFileSync } from "node:fs";
import { dataPath } from "./lib/paths.mjs";

export function pendingTargets(queue, meta, known = null) {
  if (!queue || !Array.isArray(queue.targets) || !/^\d{4}-\d{2}-\d{2}$/.test(queue.since || "")) return [];
  const built = {};
  for (const v of Object.values(meta || {})) if (v && v.target && (!built[v.target] || v.builtAt > built[v.target])) built[v.target] = v.builtAt;
  return queue.targets.filter((t, i, a) => a.indexOf(t) === i && (!known || known.includes(t)) && !(built[t] && built[t] >= queue.since));
}

/* The zone osm-rotate builds next (14/11/2026, Rick: "non li vedo girare"). GitHub fires the scheduled runs only
   2-3 times a day of the 9 asked for, so a time-based round never reached half the menu (23 zones never built).
   Order: the priority queue, then the zones never built (in menu order), then the stalest build. One tick in 4
   (idx % 4 === 3) takes another one of the same group, so a zone that keeps failing cannot block the others.
   failed: the zones whose last osm-expand run failed (osm-rotate reads the last 3 days of runs). They go to the end
   of their group: mexico ran out of memory on every tick it got (14/11/2026) and held the head of "never built". */
export function nextTarget(targets, queue, meta, idx = 0, failed = []) {
  if (!targets || !targets.length) return null;
  const bad = new Set(failed || []);
  const pick = (all, spread) => {
    const list = [...all.filter((t) => !bad.has(t)), ...all.filter((t) => bad.has(t))];
    return idx % 4 === 3 && list.length > 1 ? list[1 + (idx % Math.min(spread, list.length - 1))] : list[0];
  };
  const pending = pendingTargets(queue, meta, targets);
  if (pending.length) return pick(pending, pending.length);
  const built = {};
  for (const v of Object.values(meta || {})) if (v && v.target && (!built[v.target] || v.builtAt > built[v.target])) built[v.target] = v.builtAt;
  const never = targets.filter((t) => !built[t]);
  if (never.length) return pick(never, never.length);
  const stale = [...targets].sort((a, b) => (built[a] < built[b] ? -1 : built[a] > built[b] ? 1 : targets.indexOf(a) - targets.indexOf(b)));
  return pick(stale, 8);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const read = (f, d) => { try { return JSON.parse(readFileSync(dataPath(f), "utf8")); } catch { return d; } };
  const known = process.env.TARGETS ? process.env.TARGETS.split(/\s+/).filter(Boolean) : null;
  const failed = (process.env.FAILED || "").split(/\s+/).filter(Boolean);
  if (process.argv.includes("--next")) process.stdout.write(nextTarget(known || [], read("osm_priority.json", null), read("osm_regions_meta.json", {}), +(process.env.IDX || 0), failed) || "");
  else process.stdout.write(pendingTargets(read("osm_priority.json", null), read("osm_regions_meta.json", {}), known).join(" "));
}
