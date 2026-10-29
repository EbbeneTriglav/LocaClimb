#!/usr/bin/env node
/*
 * discover_next.mjs - which discover regions should run next (used by osm-discover-rotate.yml).
 *
 * No state file: the state is git history. For every region of lib/discover.mjs it asks the
 * GitHub API for the date of the last commit that touched data/discover_<region>.json.
 * Never run first (catalogue order), then the oldest. Prints "a,b" for osm-discover.yml.
 *
 *   GH_TOKEN=... GITHUB_REPOSITORY=owner/repo node scripts/discover_next.mjs [--n 2]
 */
import { DISCOVER_REGIONS } from "./lib/discover.mjs";

/* pure: regions in catalogue order + { region: epoch ms | 0 } -> the n to run next */
export function pickNext(regions, lastRun, n) {
  return regions
    .map((r, i) => ({ r, i, t: lastRun[r] || 0 }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .slice(0, n)
    .map((x) => x.r);
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
  const next = pickNext(regions, last, n);
  for (const r of regions) console.error(r.padEnd(30) + (last[r] ? new Date(last[r]).toISOString().slice(0, 10) : "mai") + (next.includes(r) ? "   <- prossima" : ""));
  console.log(next.join(","));
}
