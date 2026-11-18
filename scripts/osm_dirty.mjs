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
 *   4. a file is dirty when its last commit is older than the change. osm_passes.json (Italy) is rebuilt by
 *      osm-refresh.yml, not osm-expand: it comes out as "@refresh".
 * CLI: GH_TOKEN=... GITHUB_REPOSITORY=owner/repo node scripts/osm_dirty.mjs  -> "zone zone @refresh" (or nothing)
 * Any API failure prints nothing (osm-rotate then falls back to its normal choice).
 */
import { readFileSync, readdirSync } from "node:fs";
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
      for (const x of [a, b]) if (x && Number.isFinite(x.lat) && Number.isFinite(x.lon)) out.push({ kind, id: "x-" + id, lat: x.lat, lon: x.lon });
    }
  } else {
    const keys = (o) => Object.keys(o || {}).filter((k) => !k.startsWith("_"));
    const p = prev || {}, c = cur || {};
    for (const k of new Set([...keys(p), ...keys(c)])) if (JSON.stringify(p[k]) !== JSON.stringify(c[k])) out.push({ kind, id: k });
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

/* changes: [{ time: ISO, entries: [...] }]; lastBuilt(file) -> ISO of the file's last commit (null = never);
   zones: scripts/lib/zones.json. Returns the targets to rebuild, oldest change first, no duplicates. */
export function dirtyTargets(changes, files, lastBuilt, zones) {
  const byOut = new Map(zones.map((z) => [z.out, z.id]));
  const res = [];
  for (const ch of [...changes].sort((a, b) => (a.time < b.time ? -1 : 1))) {
    for (const e of ch.entries) {
      for (const f of filesFor(e, files)) {
        const t = f === "osm_passes.json" ? "@refresh" : byOut.get(f);
        if (!t || res.includes(t)) continue;
        const built = lastBuilt(f);
        if (!built || Date.parse(built) < Date.parse(ch.time)) res.push(t);
      }
    }
  }
  return res;
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY, token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const days = +(process.env.DAYS || 21);
  const H = { "User-Agent": "locaride-osm-dirty", Accept: "application/vnd.github+json", ...(token ? { Authorization: "Bearer " + token } : {}) };
  const api = async (p) => { const r = await fetch("https://api.github.com/repos/" + repo + p, { headers: H }); if (!r.ok) throw new Error(r.status + " " + p); return r.json(); };
  const raw = async (sha, path) => {
    const r = await fetch(`https://raw.githubusercontent.com/${repo}/${sha}/${path}`, { headers: { "User-Agent": H["User-Agent"] } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(r.status + " raw " + path);
    return r.json();
  };
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const changes = [];
  for (const [path, kind] of [["data/climbs_extra.json", "extra"], ["data/not_climbs.json", "not"]]) {
    const commits = await api(`/commits?path=${path}&since=${since}&per_page=50`);
    for (const c of commits) {
      const parent = c.parents && c.parents[0] && c.parents[0].sha;
      const entries = changedEntries(parent ? await raw(parent, path) : null, await raw(c.sha, path), kind);
      if (entries.length) changes.push({ time: c.commit.committer.date, entries });
    }
  }
  if (!changes.length) return;
  const files = {};
  for (const f of readdirSync(dataPath("")).filter((x) => /^osm_passes.*\.json$/.test(x))) {
    try { files[f] = JSON.parse(readFileSync(dataPath(f), "utf8")).map((r) => ({ id: r.id, lat: r.lat, lon: r.lon })); } catch { /* skip */ }
  }
  const zones = JSON.parse(readFileSync(new URL("./lib/zones.json", import.meta.url), "utf8"));
  const cache = new Map();
  for (const ch of changes) for (const e of ch.entries) for (const f of filesFor(e, files)) {
    if (!cache.has(f)) { const c = await api(`/commits?path=data/${f}&per_page=1`); cache.set(f, c[0] ? c[0].commit.committer.date : null); }
  }
  process.stdout.write(dirtyTargets(changes, files, (f) => cache.get(f), zones).join(" "));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error("osm_dirty: " + e.message); });   // never block osm-rotate
}
