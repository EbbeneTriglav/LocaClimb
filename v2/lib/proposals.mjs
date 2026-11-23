/*
 * proposals.mjs - the climbs proposed by riders and APPROVED by an admin, as map climbs (23/11/2026).
 *
 * Rick approved "Piani di Bobbio da Valtorta" and it never showed up: v2 only drew
 * data/osm_passes_user.json, written by scripts/import_proposals.mjs - and that script can no longer
 * read Firestore (App Check is mandatory since 11/2026: a request without the app's token gets 403).
 * 6 of the 9 approved climbs were missing. Now the app reads the approved proposals itself, as the
 * classic app did (js/contribute.js lrcLoadApproved): an approved climb is on the map at the next load.
 * Pure functions, same rules as js/contribute.js (lrcToPass, lrcMergePasses). Tested in test/v2-proposals.test.mjs.
 */
const R = 6371, rad = Math.PI / 180;
const hav = (a, b, c, d) => { const x = Math.sin((c - a) * rad / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin((d - b) * rad / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

/* elevations at an even step along the track (tight hairpins must not weigh like straights) */
export function evenProfile(tr, n = 100) {
  if (!tr || tr.length < 2) return [];
  const cum = [0];
  for (let i = 1; i < tr.length; i++) cum.push(cum[i - 1] + hav(tr[i - 1][0], tr[i - 1][1], tr[i][0], tr[i][1]));
  const tot = cum[cum.length - 1];
  if (!(tot > 0)) return [];
  const out = [];
  for (let i = 0, j = 1; i < n; i++) {
    const d = tot * i / (n - 1);
    while (j < cum.length - 1 && cum[j] < d) j++;
    const a = cum[j - 1], b = cum[j], f = b > a ? (d - a) / (b - a) : 0;
    const ea = tr[j - 1][2] ?? 0, eb = tr[j][2] ?? 0;
    out.push(Math.round(ea + (eb - ea) * f));
  }
  return out;
}

/* steepest ~100 m stretch of the track (as js/contribute.js: one GPS point gives absurd peaks), for proposals sent before maxGradient was stored */
export function maxGradientOf(tr) {
  let best = 0;
  for (let i = 0, j = 0, d = 0; i < tr.length; i++) {
    while (j < tr.length - 1 && d < 0.1) { d += hav(tr[j][0], tr[j][1], tr[j + 1][0], tr[j + 1][1]); j++; }
    if (d >= 0.05 && tr[i][2] != null && tr[j][2] != null) best = Math.max(best, (tr[j][2] - tr[i][2]) / (d * 10));
    if (i < j) d -= hav(tr[i][0], tr[i][1], tr[i + 1][0], tr[i + 1][1]);
  }
  return Math.round(best);
}

const DIRS = ["Nord", "Nord-Est", "Est", "Sud-Est", "Sud", "Sud-Ovest", "Ovest", "Nord-Ovest"];
function bearing(a, b, c, d) {
  const y = Math.sin((d - b) * rad) * Math.cos(c * rad), x = Math.cos(a * rad) * Math.sin(c * rad) - Math.sin(a * rad) * Math.cos(c * rad) * Math.cos((d - b) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

/* one approved Firestore document -> a climb with one side */
export function toClimb(r, id) {
  const flat = Array.isArray(r.flat) ? r.flat : [], track = [];
  for (let i = 0; i + 2 < flat.length; i += 3) track.push([flat[i], flat[i + 1], flat[i + 2]]);
  let expo = r.exposure || null;
  if (!expo && track.length > 1) { const a = track[0], b = track[track.length - 1]; expo = DIRS[Math.round(bearing(b[0], b[1], a[0], a[1]) / 45) % 8]; }
  return {
    id: "usr-" + id, name: String(r.name || "Salita"), lat: +r.lat, lon: +r.lon, elevation: r.elevation,
    userSubmitted: true, author: r.author || null,
    versanti: [{
      side: r.side || "", startLat: r.startLat, startLon: r.startLon, startElevation: r.startElevation, endElevation: r.endElevation,
      distance_km: r.km, avgGradient: r.avgGradient, maxGradient: r.maxGradient != null ? r.maxGradient : maxGradientOf(track),
      exposure: expo, elevationProfile: evenProfile(track, 100), track, elevSource: "user"
    }]
  };
}

const norm = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
/* same name, one inside the other, or a shared word of 4+ letters ("nerone") */
export function nameMatch(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const ty = new Set(y.split(" ").filter((t) => t.length >= 4));
  return x.split(" ").some((t) => t.length >= 4 && ty.has(t));
}
export const MERGE_KM = 2;
/* two proposals on the same mountain are two SIDES of one climb: the summit decides, the name confirms */
export function mergeClimbs(list) {
  const out = [];
  for (const p of list) {
    const q = out.find((o) => hav(p.lat, p.lon, o.lat, o.lon) <= MERGE_KM && nameMatch(p.name, o.name));
    if (!q) { out.push({ ...p, versanti: p.versanti.slice() }); continue; }
    q.versanti = q.versanti.concat(p.versanti);
    if (p.name.length < q.name.length) q.name = p.name;           // the short one is usually the clean name
    if ((p.elevation || 0) > (q.elevation || 0)) Object.assign(q, { elevation: p.elevation, lat: p.lat, lon: p.lon });
  }
  return out;
}

/* approved documents [{ id, ...data }] -> climbs; a broken document is skipped, never the whole list */
export function approvedClimbs(docs) {
  const raw = [];
  for (const d of docs || []) {
    try { const c = toClimb(d, d.id); if (isFinite(c.lat) && isFinite(c.lon) && c.versanti[0].track.length > 1) raw.push(c); } catch { /* skip */ }
  }
  return mergeClimbs(raw);
}
