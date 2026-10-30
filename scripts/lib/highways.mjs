/*
 * highways.mjs - which OSM highway classes enter the road graph of build_osm_passes.mjs.
 *
 * Residential / living_street / road were added on 2026-08-03 (9930fce) for the per-country and
 * discover builds, where short village streets close gaps to the climb's base. The full Italy
 * refresh (osm-refresh.yml: three Geofabrik PBFs at once, no LC_PBF) was never run again after
 * that, and with them its graph no longer fits the 6 GB heap: both runs on 29/10/2026 died in
 * "Build data" with exit code 134 (V8 out of memory) after ~8 minutes.
 * So the full refresh keeps the July set (the one the golden set was approved on).
 */
export const HW_BASE = ["primary", "primary_link", "secondary", "secondary_link", "tertiary", "tertiary_link",
  "unclassified", "unclassified_link", "trunk", "trunk_link"];
export const HW_LOCAL = ["residential", "living_street", "road"];

/* fullRefresh: the default multi-PBF Italy build (no --discover, no LC_PBF/--pbf).
   LC_HW_LOCAL=1 / =0 forces the local classes on / off. */
export function hwKeep({ fullRefresh, env = {} } = {}) {
  const force = String(env.LC_HW_LOCAL ?? "").trim();
  const local = force === "1" ? true : force === "0" ? false : !fullRefresh;
  return local ? HW_BASE.concat(HW_LOCAL) : HW_BASE.slice();
}
