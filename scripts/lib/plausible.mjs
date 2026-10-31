/*
 * plausible.mjs - is a side physically believable as a paved road climb?
 * Asphalt tops out around 30% over a few hundred metres and nobody paves 18%+ for kilometres
 * (Scanuppia, the steepest paved climb in Italy, averages ~17.7%). A side beyond that is either a DEM
 * artefact (tunnel, bridge, a straight gap across hairpins - fixed for rebuilt files by v4.8) or a
 * track/path that is not a road climb. Such climbs are flagged "q" in osm_index.json: v2 keeps them
 * on the map but out of "the hardest" lists, and says so on the climb page.
 * Same rule in v2/lib/climb.mjs (implausible) - test/plausible.test.mjs keeps the two equal.
 */
export const MAX_PCT = 30, AVG_PCT = 18, AVG_MIN_KM = 1.5;
export function implausibleSide(v) {
  return (+v.maxGradient || 0) >= MAX_PCT || ((+v.avgGradient || 0) >= AVG_PCT && (+v.distance_km || 0) >= AVG_MIN_KM);
}
export function implausibleClimb(p) { return (p.versanti || []).some(implausibleSide); }
