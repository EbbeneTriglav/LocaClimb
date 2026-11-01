/*
 * crossdedup.mjs - which of two adjacent pass summits on the SAME road keeps the shared versanti
 * (used by the cross-pass overlap dedup in build_osm_passes.mjs).
 *
 * Old rule: the higher OSM node wins. That handed famous road passes to stray nodes snapped onto
 * the same road: a hiking col or a nameless "Passo" a few hundred metres away and HIGHER than the
 * road (Col d'Izoard 2361 m lost to "Col Perdu" 2490 m, Col de l'Iseran 2764 m to "Col des
 * Lessieres" 2964 m, Col de Peyresourde to "Passo" 1643 m, Vrsic 1611 m to "Vratca" 1800 m).
 * New rule: the node whose own height IS the top of its road wins; only when both fit the road
 * equally well (within FIT_TOL) does the old rule decide (higher, then more versanti).
 */
export const FIT_TOL = 40; // m

export function roadTop(r) {
  let t = -Infinity;
  for (const v of r.versanti || []) if (Number.isFinite(v.endElevation) && v.endElevation > t) t = v.endElevation;
  return t;
}
/* how far the node's height is from the top of the road its versanti climb (Infinity = unknown) */
export function misfit(r) {
  const t = roadTop(r);
  return Number.isFinite(t) && Number.isFinite(r.elevation) ? Math.abs(r.elevation - t) : Infinity;
}
export function weakerOf(r, o) {
  const mr = misfit(r), mo = misfit(o);
  if (Number.isFinite(mr) && Number.isFinite(mo) && Math.abs(mr - mo) > FIT_TOL) return mr > mo ? r : o;
  if ((r.elevation || 0) !== (o.elevation || 0)) return (r.elevation || 0) < (o.elevation || 0) ? r : o;
  return (r.versanti.length <= o.versanti.length) ? r : o;
}
