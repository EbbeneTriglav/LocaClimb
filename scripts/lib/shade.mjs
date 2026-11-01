/*
 * shade.mjs - helpers of the shade index pipeline (scripts/build_shade.mjs, scripts/merge_shade.mjs).
 */
/* passes from a file: an array, {passes: [...]}, or a map {id: {versanti}} (curated_overrides.json) */
export function passList(j) {
  if (Array.isArray(j)) return j;
  if (j && Array.isArray(j.passes)) return j.passes;
  return Object.keys(j || {}).filter((k) => !k.startsWith("_")).map((id) => Object.assign({ id }, j[id]));
}
/* where a pass is: its summit, or the end of its first track (the curated overrides carry no lat/lon) */
export function summitOf(p) {
  if (Number.isFinite(p.lat) && Number.isFinite(p.lon)) return [p.lat, p.lon];
  const t = p.versanti && p.versanti[0] && p.versanti[0].track;
  return t && t.length ? t[t.length - 1] : null;
}
/* --also passes only inside the box of the region (+0.1 deg): the forest of this run covers that area,
   and a pass computed without its forest would be stored "in full sun" and then skipped forever */
export function insideArea(main, extra, pad = 0.1) {
  let a = 90, b = -90, c = 180, d = -180;
  for (const p of main) { const s = summitOf(p); if (!s) continue; a = Math.min(a, s[0]); b = Math.max(b, s[0]); c = Math.min(c, s[1]); d = Math.max(d, s[1]); }
  if (a > b) return [];
  return extra.filter((p) => { const s = summitOf(p); return s && s[0] >= a - pad && s[0] <= b + pad && s[1] >= c - pad && s[1] <= d + pad; });
}


/* osm-expand computes the shade of one region, then resets to the remote main before committing:
   the new keys are carried over and merged into the current file (new values win, nothing lost). */
export function mergeShade(base, add) {
  const out = { v: (base && base.v) || (add && add.v) || 1, built: "", m: { ...((base && base.m) || {}) } };
  let n = 0;
  for (const [k, v] of Object.entries((add && add.m) || {})) { if (out.m[k] !== v) n++; out.m[k] = v; }
  out.built = [base && base.built, add && add.built].filter(Boolean).sort().pop() || "";
  return { store: out, changed: n };
}
