#!/usr/bin/env node
/*
 * discover_next.mjs - which discover regions should run next (used by osm-discover-rotate.yml).
 *
 * No state file: the state is git history. For every region of lib/discover.mjs it asks the
 * GitHub API for the date of the last commit that touched data/discover_<region>.json.
 * Never run first (catalogue order), then the oldest. Prints "a,b" for osm-discover.yml.
 *
 * 21/11/2026: usa-kentucky and usa-maine failed at every turn (download) and, never published,
 * stayed first in the queue: the whole world rotation was stuck on them for days. Now a region whose
 * last job of the past 3 days failed goes to the back, and a region already in a queued or running
 * osm-discover (its run title is "osm-discover a,b") is not picked again.
 *
 *   GH_TOKEN=... GITHUB_REPOSITORY=owner/repo node scripts/discover_next.mjs [--n 2]
 */
import { DISCOVER_REGIONS } from "./lib/discover.mjs";

/* pure: regions in catalogue order + { region: epoch ms | 0 } -> the n to run next */
export function pickNext(regions, lastRun, n, failed = new Set(), busy = new Set()) {
  return regions
    .filter((r) => !busy.has(r))
    .map((r, i) => ({ r, i, t: lastRun[r] || 0, f: failed.has(r) ? 1 : 0 }))
    .sort((a, b) => a.f - b.f || a.t - b.t || a.i - b.i)
    .slice(0, n)
    .map((x) => x.r);
}

export const FAIL_WINDOW_MS = 3 * 86400e3;

/* pure: jobs of recent osm-discover runs ({ name: "discover (x)", conclusion, completed_at }) -> the
   regions whose LAST job inside the window failed (a later success clears it) */
export function failedRecently(jobs, now, windowMs = FAIL_WINDOW_MS) {
  const last = {};
  for (const j of jobs) {
    const m = /^discover \((.+)\)$/.exec(j.name || ""), t = Date.parse(j.completed_at || "");
    if (!m || !(t > now - windowMs) || !j.conclusion || j.conclusion === "skipped" || j.conclusion === "cancelled") continue;
    if (!last[m[1]] || t > last[m[1]].t) last[m[1]] = { t, ok: j.conclusion === "success" };
  }
  return new Set(Object.keys(last).filter((r) => !last[r].ok));
}

/* pure: runs ({ status, display_title: "osm-discover a,b" }) -> regions of the queued / running ones */
export function busyRegions(runs) {
  const out = new Set();
  for (const r of runs) {
    if (r.status === "completed") continue;
    const m = /^osm-discover (.+)$/.exec(r.display_title || "");
    if (m) for (const x of m[1].split(",")) if (x.trim()) out.add(x.trim());
  }
  return out;
}

async function gh(token, u) {
  const r = await fetch("https://api.github.com/" + u, { headers: { authorization: "Bearer " + token, accept: "application/vnd.github+json" } });
  if (!r.ok) throw new Error("GitHub API " + r.status + " for " + u);
  return r.json();
}

async function lastCommit(repo, token, region) {
  const u = `https://api.github.com/repos/${repo}/commits?per_page=1&path=${encodeURIComponent("data/discover_" + region + ".json")}`;
  const r = await fetch(u, { headers: { authorization: "Bearer " + token, accept: "application/vnd.github+json" } });
  if (!r.ok) throw new Error("GitHub API " + r.status + " for " + region);
  const j = await r.json();
  return j.length ? Date.parse(j[0].commit.committer.date) : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf("--n"), n = i > 0 ? +process.argv[i + 1] : 2;
  const repo = process.env.GITHUB_REPOSITORY, token = process.env.GH_TOKEN;
  if (!repo || !token) { console.error("GITHUB_REPOSITORY e GH_TOKEN servono"); process.exit(1); }
  const regions = Object.keys(DISCOVER_REGIONS), last = {};
  for (const r of regions) last[r] = await lastCommit(repo, token, r);
  const runs = (await gh(token, `repos/${repo}/actions/workflows/osm-discover.yml/runs?per_page=30`)).workflow_runs || [];
  const now = Date.now(), jobs = [];
  for (const run of runs) {
    if (!(Date.parse(run.created_at) > now - FAIL_WINDOW_MS)) continue;
    jobs.push(...((await gh(token, `repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`)).jobs || []));
  }
  const failed = failedRecently(jobs, now), busy = busyRegions(runs);
  const next = pickNext(regions, last, n, failed, busy);
  for (const r of regions) console.error(r.padEnd(30) + (last[r] ? new Date(last[r]).toISOString().slice(0, 10) : "mai") +
    (failed.has(r) ? "   fallita di recente: in fondo" : "") + (busy.has(r) ? "   gia' in corso" : "") + (next.includes(r) ? "   <- prossima" : ""));
  console.log(next.join(","));
}
