/*
 * structdem.mjs - heights along a climb inside tunnels and on bridges.
 * The DEM gives the MOUNTAIN above a tunnel and the VALLEY under a bridge: a resampled path that keeps
 * a vertex inside a gallery reads tens of metres off (Presolana from Angolo: 31% "max" in the Via Mala
 * galleries). The road there runs between its two portals/abutments, so the heights of the inner
 * vertices are interpolated by distance between the nearest outside vertices. Pure, tested
 * (test/structdem.test.mjs).
 */
function hav(la1, lo1, la2, lo2) {
  const r = Math.PI / 180, a = Math.sin((la2 - la1) * r / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin((lo2 - lo1) * r / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}
/* pts [[lat, lon], ...], ev heights (same length), isStruct(pt) -> bool. Returns a new array. */
export function fillStruct(pts, ev, isStruct) {
  const n = pts.length, out = ev.slice();
  if (n < 2) return out;
  const st = pts.map((p) => !!isStruct(p));
  if (!st.some(Boolean)) return out;
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + hav(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
  for (let i = 0; i < n; i++) {
    if (!st[i]) continue;
    let j = i; while (j < n && st[j]) j++;            // run i .. j-1
    const a = i - 1, b = j;                           // outside neighbours (may not exist)
    for (let k = i; k < j; k++) {
      if (a >= 0 && b < n) { const span = cum[b] - cum[a]; out[k] = span > 0 ? ev[a] + (ev[b] - ev[a]) * (cum[k] - cum[a]) / span : ev[a]; }
      else if (a >= 0) out[k] = ev[a];
      else if (b < n) out[k] = ev[b];
    }
    i = j;
  }
  return out;
}
