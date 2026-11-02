/* What counts as a climb when a versante is built (buildSide in build_osm_passes.mjs).
   mode: false = OSM passes and keyword candidates (the global floor), true = curated paths
   (climbs_extra, pinned base towns: 1.2 km / 140 m, so the floor can never rewrite Stelvio & co.),
   "short" = curated climbs_extra entries flagged {"short": true}: the walls of the Northern
   Classics and the short côtes of the grand tours (Paterberg is 400 m long and ~50 m high).
   flat = the Belgium / Netherlands files, where the OSM passes are short walls too. */
export function climbFloor(mode, flat, minDistKm, minGainM) {
  if (mode === "short") return { distKm: 0.3, gainM: 30, avgPct: 3 };
  if (mode) return { distKm: 1.2, gainM: 140, avgPct: 2 };
  if (flat) return { distKm: 0.3, gainM: 50, avgPct: 2.5 };
  return { distKm: minDistKm, gainM: minGainM, avgPct: 2.5 };
}
