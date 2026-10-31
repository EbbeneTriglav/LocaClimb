/*
 * notclimbs.mjs - data/not_climbs.json: OSM passes that are not road-bike climbs (a glacier col,
 * a ski piste, a hiking saddle) and must never reach the app. Keyed by OSM id, like name_fixes.json.
 * build_osm_passes.mjs drops them when it writes a region file; build_osm_index.mjs drops them from
 * the index, which is what both frontends draw from (v1 hydration never adds a pass the index lacks).
 */
import { readFile } from "node:fs/promises";
import { dataPath } from "./paths.mjs";

export function notClimbIds(obj) {
  return new Set(Object.keys(obj || {}).filter((k) => !k.startsWith("_")));
}

export async function loadNotClimbs(file = dataPath("not_climbs.json")) {
  try { return notClimbIds(JSON.parse(await readFile(file, "utf8"))); }
  catch (e) { if (e.code === "ENOENT") return new Set(); throw e; }   // a broken file must fail the build, not silently re-admit them
}
