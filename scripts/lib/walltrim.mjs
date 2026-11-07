/* Valley trim of a versante (buildSide in build_osm_passes.mjs): advance the base upward while the
   forward window stays below floorPct, stopping at the first ramp that holds floorPct over BOTH
   windows, and never keep less than keepKm. cum = cumulative km from the base, el = elevations (m),
   both indexed base -> top (end = last index). Pure, tested in test/walltrim.test.mjs.
   default: the valley run below Stelvio, Gavia, Radici (0.6 + 1.4 km windows, keep >= 3 km).
   short:   the walls of the Northern Classics (climbs_extra "short": true). With the 3 km keep a
            wall shorter than 3 km was never trimmed: Taaienberg came out 1.7 km at 3% from Nukerke
            (the real wall is ~0.5 km at ~6.5%) and the flat approach pushed others under the
            "short" floor ("no climb"). Windows 0.2 + 0.4 km, keep >= 0.3 km (climbfloor.mjs). */
export const TRIM = {
  default: { floorPct: 4.0, win1: 0.6, win2: 1.4, keepKm: 3.0 },
  short: { floorPct: 4.0, win1: 0.2, win2: 0.4, keepKm: 0.3 }
};
export function trimParams(relax) { return relax === "short" ? TRIM.short : TRIM.default; }

/* grade (%) from index i over the next winKm (or up to the top) */
export function fwdGrade(cum, el, end, i, winKm) {
  let j = i; while (j < end && cum[j] - cum[i] < winKm) j++;
  const dd = cum[j] - cum[i];
  return dd > 0 ? (el[j] - el[i]) / (dd * 1000) * 100 : 0;
}

export function trimValley(cum, el, base, end, p = TRIM.default) {
  while (base < end - 1 && (cum[end] - cum[base]) > p.keepKm) {
    if (fwdGrade(cum, el, end, base, p.win1) >= p.floorPct && fwdGrade(cum, el, end, base, p.win2) >= p.floorPct) break;
    base++;
  }
  return base;
}
