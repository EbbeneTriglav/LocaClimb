/*
 * zones.mjs - the single catalogue of build zones (scripts/lib/zones.json).
 *
 * One entry per Geofabrik zone: { id, label?, pbf: [url], bbox?, out, terrain, discover,
 * discoverBbox?, discoverNote? }. Used by:
 *   - osm-expand.yml   target -> pbf / bbox / out (its menu must list the same ids: see test)
 *   - osm-rotate.yml   rotates over that menu
 *   - lib/discover.mjs every zone with discover:true is a discover region (terrain picks the
 *                      ALPS or HILLS thresholds; "flat" and "border" zones are skipped)
 * terrain: alps | hills | flat | border. Add a zone here, then its id to the osm-expand menu.
 */
import { readFileSync } from "node:fs";

export const ZONES = JSON.parse(readFileSync(new URL("./zones.json", import.meta.url), "utf8"));
export function zoneById(id) { return ZONES.find((z) => z.id === id) || null; }
