/*
 * osm_dirty.mjs - which zones must be rebuilt because a human-curated file changed after their last build
 * (18/11/2026, Rick: "non devo far partire cose in manuale").
 *
 * data/climbs_extra.json and data/not_climbs.json only reach the app when the region file that holds the
 * place is rebuilt. Until now that meant someone launching osm-expand by hand for each zone (gpm-fr-cols:
 * 4 zones; bonette-restore: confine-it-fr). osm-rotate.yml now asks this script first:
 *   1. the commits of the last DAYS days touching those two files (GitHub API, no history needed);
 *   2. the entries each commit added, changed or removed (file at the commit vs its parent);
 *   3. the region files that hold each place: an x- climb's own file, any file with a pass within 5 km of a
 *      climbs_extra point, the file that still holds a not_climbs id;
 *   4. a file is dirty when the entry at its last build commit (the file's last commit on main) differs from
 *      the entry now. Content, not dates: a PR committed before a rebuild and merged after it is still caught.
 *      osm_passes.json (Italy) is rebuilt by osm-refresh.yml, not osm-expand: it comes out as "@refresh".
 * Zones that would bring back a pass of winter_closures.json missing from every file come first (repairFirst).
 * CLI: GH_TOKEN=... GITHUB_REPOSITORY=owner/repo node scripts/osm_dirty.mjs  -> "zone zone @refresh" (or nothing)
 * Any API failure prints nothing (osm-rotate then falls back to its normal choice).
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { dataPath } from "./lib/paths.mjs";

export const NEAR_KM = 5;
const hav = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };

/* entries of climbs_extra (array, by id) or not_climbs (object, by key) that differ between two versions */
export function changedEntries(prev, cur, kind) {
  const out = [];
  if (kind === "extra") {
    const m = (a) => new Map((Array.isArray(a) ? a : []).filter((x) => x && x.id).map((x) => [x.id, x]));
    const p = m(prev), c = m(cur);
    for (const id of new Set([...p.keys(), ...c.keys()])) {
      const a = p.get(id), b = c.get(id);
      if (JSON.stringify(a) === JSON.stringify(b)) continue;
      for (const x of [a, b]) if (x && Number.isFinite(x.lat) && Number.isFinite(x.lon)) out.push({ kind, key: id, id: "x-" + id, lat: x.lat, lon: x.lon });
    }
  } else {
    const keys = (o) => Object.keys(o || {}).filter((k) => !k.startsWith("_"));
    const p = prev || {}, c = cur || {};
    for (const k of new Set([...keys(p), ...keys(c)])) if (JSON.stringify(p[k]) !== JSON.stringify(c[k])) out.push({ kind, key: k, id: k });
  }
  return out;
}

/* region files that hold a changed entry. files: { "osm_passes_xb_fr.json": [{id, lat, lon}, ...], ... } */
export function filesFor(entry, files, nearKm = NEAR_KM) {
  const hit = new Set();
  for (const [f, recs] of Object.entries(files)) {
    for (const r of recs) {
      if (!r) continue;
      if (r.id === entry.id) { hit.add(f); break; }
      if (entry.lat != null && Number.isFinite(r.lat) && hav(entry.lat, entry.lon, r.lat, r.lon) <= nearKm) { hit.add(f); break; }
    }
  }
  return [...hit];
}

/* the entry as a string in one version of the two files ({ extra: [...], not: {...} }) */
export function entryValue(version, e) {
  if (!version) return undefined;
  if (e.kind === "extra") return JSON.stringify((Array.isArray(version.extra) ? version.extra : []).find((x) => x && x.id === e.key));
  return JSON.stringify((version.not || {})[e.key]);
}

/* entries: changed entries (changedEntries over the recent commits); current: the two files now;
   builtWith(file) -> the two files at the file's last build commit (null = never built);
   zones: scripts/lib/zones.json. Returns the targets to rebuild, no duplicates. */
export function dirtyTargets(entries, files, current, builtWith, zones) {
  const byOut = new Map(zones.map((z) => [z.out, z.id]));
  const res = [];
  for (const e of entries) {
    for (const f of filesFor(e, files)) {
      const t = f === "osm_passes.json" ? "@refresh" : byOut.get(f);
      if (!t || res.includes(t)) continue;
      const v = builtWith(f);
      if (!v || entryValue(v, e) !== entryValue(current, e)) res.push(t);
    }
  }
  return res;
}

/* repair first (20/11/2026): a pass of winter_closures.json with no climb within 1 km in any region file is a
   validate error on main (Bonette, 18/11: red for days while osm-rotate rebuilt the dirty zones in commit
   order, confine-it-fr last). The dirty targets whose file holds a place within NEAR_KM of such a pass come
   first, in their order; the others keep theirs. Only reorders: it never adds a zone. */
export function repairFirst(targets, closures, files, zones) {
  const byOut = new Map(zones.map((z) => [z.out, z.id])), r = Math.PI / 180, fix = new Set();
  const all = Object.values(files).flat().filter((c) => c && Number.isFinite(c.lat) && Number.isFinite(c.lon));
  for (const p of (closures && Array.isArray(closures.passes) ? closures.passes : [])) {
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    if (all.some((c) => 6371 * Math.hypot((c.lat - p.lat) * r, (c.lon - p.lon) * r * Math.cos(p.lat * r)) <= 1.0)) continue;
    for (const f of filesFor({ id: null, lat: p.lat, lon: p.lon }, files)) fix.add(f === "osm_passes.json" ? "@refresh" : byOut.get(f));
  }
  return [...targets.filter((t) => fix.has(t)), ...targets.filter((t) => !fix.has(t))];
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY, token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const days = +(process.env.DAYS || 21);
  const H = { "User-Agent": "locaride-osm-dirty", Accept: "application/vnd.github+json", ...(token ? { Authorization: "Bearer " + token } : {}) };
  const api = async (p) => { const r = await fetch("https://api.github.com/repos/" + repo + p, { headers: H }); if (!r.ok) throw new Error(r.status + " " + p); return r.json(); };
  const raw = async (sha, p) => {
    const r = await fetch(`https://raw.githubusercontent.com/${repo}/${sha}/${p}`, { headers: { "User-Agent": H["User-Agent"] } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(r.status + " raw " + p);
    return r.json();
  };
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const entries = [];
  for (const [p, kind] of [["data/climbs_extra.json", "extra"], ["data/not_climbs.json", "not"]]) {
    const commits = await api(`/commits?path=${p}&since=${since}&per_page=50`);
    for (const c of commits) {
      const parent = c.parents && c.parents[0] && c.parents[0].sha;
      for (const e of changedEntries(parent ? await raw(parent, p) : null, await raw(c.sha, p), kind)) {
        if (!entries.some((x) => x.kind === e.kind && x.key === e.key && x.lat === e.lat)) entries.push(e);
      }
    }
  }
  if (!entries.length) return;
  const zones = JSON.parse(readFileSync(new URL("./lib/zones.json", import.meta.url), "utf8"));
  const buildable = new Set(["osm_passes.json", ...zones.map((z) => z.out)]);   // discover files etc.: not ours to rebuild
  const files = {};
  for (const f of readdirSync(path.dirname(dataPath("osm_regions.json"))).filter((x) => buildable.has(x))) {
    try { files[f] = JSON.parse(readFileSync(dataPath(f), "utf8")).map((r) => ({ id: r.id, lat: r.lat, lon: r.lon })); } catch { /* skip */ }
  }
  const current = { extra: JSON.parse(readFileSync(dataPath("climbs_extra.json"), "utf8")), not: JSON.parse(readFileSync(dataPath("not_climbs.json"), "utf8")) };
  const built = new Map();
  for (const e of entries) for (const f of filesFor(e, files)) {
    if (built.has(f)) continue;
    const c = await api(`/commits?path=data/${f}&per_page=1`);
    const sha = c[0] && c[0].sha;
    built.set(f, sha ? { extra: await raw(sha, "data/climbs_extra.json"), not: await raw(sha, "data/not_climbs.json") } : null);
  }
  let closures = null;
  try { closures = JSON.parse(readFileSync(dataPath("winter_closures.json"), "utf8")); } catch { /* no reorder */ }
  process.stdout.write(repairFirst(dirtyTargets(entries, files, current, (f) => built.get(f), zones), closures, files, zones).join(" "));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error("osm_dirty: " + e.message); });   // never block osm-rotate
}
