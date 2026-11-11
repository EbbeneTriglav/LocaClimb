/*
 * near.mjs - "Vicino a me" (Rick, 11/11/2026): from the blue dot to the nearest water, bar or climb.
 * Pure helpers for app.mjs: distance and bearing, the nearest few, the guide arrow, the distance label.
 * The light guide is an arrow + metres (no turn-by-turn: the bike computer does that with the GPX/route).
 */
const R = 6371, rad = Math.PI / 180;

export function distKm(lat1, lon1, lat2, lon2) {
  const a = Math.sin((lat2 - lat1) * rad / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin((lon2 - lon1) * rad / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* initial bearing from 1 to 2, degrees clockwise from north */
export function bearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin((lon2 - lon1) * rad) * Math.cos(lat2 * rad);
  const x = Math.cos(lat1 * rad) * Math.sin(lat2 * rad) - Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lon2 - lon1) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

/* the n nearest items (each with lat/lon) within maxKm, with km and bearing; same place twice (a bar
   mapped as node and as area) kept once */
export function nearest(me, items, n = 5, maxKm = 15) {
  const out = [];
  for (const it of items || []) {
    if (it == null || !isFinite(it.lat) || !isFinite(it.lon)) continue;
    const km = distKm(me.lat, me.lon, it.lat, it.lon);
    if (km <= maxKm) out.push({ ...it, km, brg: bearing(me.lat, me.lon, it.lat, it.lon) });
  }
  out.sort((a, b) => a.km - b.km);
  const kept = [];
  for (const x of out) { if (!kept.some((k) => (k.name || k.label) === (x.name || x.label) && distKm(k.lat, k.lon, x.lat, x.lon) < 0.05)) kept.push(x); if (kept.length >= n) break; }
  return kept;
}

/* where the guide arrow points on screen: relative to the way you face, or to north without a heading */
export function arrowDeg(brg, heading) { return heading == null ? brg : (brg - heading + 360) % 360; }

/* "350 m", "1,2 km", "12 km" */
export function fmtDist(km, lang = "it") {
  if (!(km >= 0)) return "–";
  if (km < 1) return Math.max(10, Math.round(km * 100) * 10) + " m";
  return (km < 10 ? km.toFixed(1) : String(Math.round(km))).replace(".", lang === "en" ? "." : ",") + " km";
}

/* closer than this: arrived */
export const ARRIVED_KM = 0.04;
