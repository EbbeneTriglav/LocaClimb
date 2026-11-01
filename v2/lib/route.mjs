/*
 * route.mjs - the v2 route builder ("Il tuo giro"): pure helpers, tested in test/v2-route.test.mjs.
 * Routing is BRouter (same server and profiles as the classic app, js/routebuilder.js), with
 * OSRM as a geometry-only fallback. Nothing here touches the DOM or the map.
 */
import { havKm, speedKmh, vamFor, gradeColor } from "./climb.mjs?v=30";

export const BROUTER = "https://brouter.de/brouter";
export const PROFILES = [["fastbike", "Solo asfalto"], ["trekking", "Anche sterrato"], ["shortest", "Più corto"]];
export const MAX_STOPS = 30;

export function brouterUrl(stops, profile = "fastbike") {
  const ll = stops.map((s) => (+s.lon).toFixed(5) + "," + (+s.lat).toFixed(5)).join("|");
  return `${BROUTER}?lonlats=${ll}&profile=${encodeURIComponent(profile)}&alternativeidx=0&format=geojson`;
}
export function osrmUrl(stops) {
  return "https://router.project-osrm.org/route/v1/bike/" + stops.map((s) => (+s.lon).toFixed(5) + "," + (+s.lat).toFixed(5)).join(";") + "?overview=full&geometries=geojson";
}

/* OSM way tags -> surface class (as the classic app's surfCat) */
export function surfCat(wt) {
  const s = (/surface=([a-z_]+)/.exec(wt) || [])[1] || "", hw = (/highway=([a-z_]+)/.exec(wt) || [])[1] || "";
  if (["asphalt", "paved", "concrete", "paving_stones"].includes(s)) return "asfalto";
  if (["compacted", "fine_gravel", "gravel", "unpaved"].includes(s) || hw === "track") return "sterrato";
  if (["ground", "dirt", "grass", "sand", "mud"].includes(s)) return "naturale";
  if (s) return "altro";
  if (hw === "path" || hw === "footway") return "naturale";
  return "asfalto";
}

/* BRouter geojson -> { track: [[lat, lon, ele]], km, gain, surf: { asfalto: m, ... } | null, segs: [{ from, to, cat }] (m) } */
export function parseBrouter(j) {
  const f = j && j.features && j.features[0];
  if (!f || !f.geometry || !(f.geometry.coordinates || []).length) return null;
  const track = f.geometry.coordinates.map((c) => [c[1], c[0], c[2] != null ? Math.round(c[2]) : null]);
  const pr = f.properties || {};
  const km = pr["track-length"] ? +pr["track-length"] / 1000 : trackKm(track);
  const gain = pr["filtered ascend"] != null ? Math.round(+pr["filtered ascend"]) : ascent(track);
  const segs = [], surf = {};
  const msgs = pr.messages;
  if (Array.isArray(msgs) && msgs.length > 1) {
    const di = msgs[0].indexOf("Distance"), wi = msgs[0].indexOf("WayTags");
    let cum = 0;
    if (di >= 0 && wi >= 0) for (const row of msgs.slice(1)) {
      const d = parseFloat(row[di]) || 0, cat = surfCat(row[wi] || "");
      surf[cat] = (surf[cat] || 0) + d; segs.push({ from: cum, to: cum + d, cat }); cum += d;
    }
  }
  return { track, km, gain, surf: segs.length ? surf : null, segs };
}

export function trackKm(t) { let d = 0; for (let i = 1; i < t.length; i++) d += havKm(t[i - 1][0], t[i - 1][1], t[i][0], t[i][1]); return d; }
/* ascent with a 3 m hysteresis, so DEM noise on the flat does not add up */
export function ascent(t) {
  let a = 0, ref = null;
  for (const q of t) {
    if (q[2] == null) continue;
    if (ref == null) { ref = q[2]; continue; }
    if (q[2] > ref + 3) { a += q[2] - ref; ref = q[2]; } else if (q[2] < ref - 3) ref = q[2];
  }
  return Math.round(a);
}
export function cumKm(t) { const c = [0]; for (let i = 1; i < t.length; i++) c.push(c[i - 1] + havKm(t[i - 1][0], t[i - 1][1], t[i][0], t[i][1])); return c; }

/* the route as a "side" with an even-distance profile (n samples), so the climb helpers
   (profileShapes, kmTable...) draw it: elevSource marks it as evenly spaced */
export function asSide(track, n = 300) {
  const c = cumKm(track), L = c[c.length - 1] || 0;
  if (track.length < 2 || !(L > 0)) return null;
  const prof = [], pts = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1) * L;
    while (j < c.length - 2 && c[j + 1] < x) j++;
    const span = c[j + 1] - c[j], k = span > 0 ? (x - c[j]) / span : 0;
    const a = track[j], b = track[j + 1];
    const e = a[2] != null && b[2] != null ? a[2] + (b[2] - a[2]) * k : (a[2] ?? b[2]);
    prof.push(e != null ? Math.round(e) : null);
    pts.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
  }
  fillNulls(prof);
  return { track: pts, elevationProfile: prof, distance_km: L, elevSource: "route" };
}
function fillNulls(a) {
  let last = null;
  for (let i = 0; i < a.length; i++) if (a[i] == null) a[i] = last; else last = a[i];
  let next = null;
  for (let i = a.length - 1; i >= 0; i--) if (a[i] == null) a[i] = next; else next = a[i];
  for (let i = 0; i < a.length; i++) if (a[i] == null) a[i] = 0;
}

/* minutes from the start to each sample of an asSide() route, at this W/kg (same speed model as
   the climb times: VAM on the way up, capped descents, flat speed from the rider's VAM) */
export function etaMinutes(side, wkg = 3) {
  const p = side.elevationProfile, n = p.length, step = side.distance_km / (n - 1);
  // gradient over ~500 m around each step: point heights from the router come in 1 m steps and
  // in small stairs, and a sample-to-sample gradient would turn them into fake walls and flats
  const flat = vamFor(wkg, 7) / 34, k = Math.max(1, Math.round(0.25 / step)), out = [0];
  for (let i = 1; i < n; i++) {
    const a = Math.max(0, i - 1 - k + 1), b = Math.min(n - 1, i + k - 1), g = (p[b] - p[a]) / ((b - a) * step * 1000);
    out.push(out[i - 1] + step / speedKmh(g, flat) * 60);
  }
  return out;
}

/* climbs whose summit is within maxKm of the route -> [{ c, km, m }] in riding order */
export function climbsOnRoute(track, climbs, maxKm = 0.25) {
  if (track.length < 2) return [];
  const c = cumKm(track);
  let la0 = 90, la1 = -90, lo0 = 180, lo1 = -180;
  for (const q of track) { la0 = Math.min(la0, q[0]); la1 = Math.max(la1, q[0]); lo0 = Math.min(lo0, q[1]); lo1 = Math.max(lo1, q[1]); }
  const pad = 0.01, out = [];
  for (const p of climbs) {
    if (!(p.lat >= la0 - pad && p.lat <= la1 + pad && p.lon >= lo0 - pad && p.lon <= lo1 + pad)) continue;
    let bd = Infinity, bi = 0;
    for (let i = 0; i < track.length; i++) { const d = havKm(p.lat, p.lon, track[i][0], track[i][1]); if (d < bd) { bd = d; bi = i; } }
    if (bd <= maxKm) out.push({ c: p, km: c[bi], m: Math.round(bd * 1000) });
  }
  return out.sort((a, b) => a.km - b.km);
}

/* colored line: one feature per run of samples in the same gradient color */
export function routeFeatures(side) {
  const t = side.track, p = side.elevationProfile, step = side.distance_km / (p.length - 1), out = [];
  let cur = null;
  for (let i = 1; i < t.length; i++) {
    const g = (p[i] - p[i - 1]) / (step * 10), col = gradeColor(g);
    if (!cur || cur.properties.c !== col) {
      cur = { type: "Feature", properties: { c: col }, geometry: { type: "LineString", coordinates: [[t[i - 1][1], t[i - 1][0]]] } };
      out.push(cur);
    }
    cur.geometry.coordinates.push([t[i][1], t[i][0]]);
  }
  return out;
}
/* the stretches that are not tarmac, as lines (for a dashed overlay) */
export function surfaceFeatures(track, segs) {
  if (!segs || !segs.length) return [];
  const c = cumKm(track).map((x) => x * 1000), out = [];
  for (const s of segs) {
    if (s.cat === "asfalto") continue;
    const coords = [];
    for (let i = 0; i < track.length; i++) if (c[i] >= s.from && c[i] <= s.to) coords.push([track[i][1], track[i][0]]);
    if (coords.length > 1) out.push({ type: "Feature", properties: { cat: s.cat }, geometry: { type: "LineString", coordinates: coords } });
  }
  return out;
}
/* surface shares in % (rounded, the largest first) */
export function surfaceShares(surf) {
  if (!surf) return [];
  const tot = Object.values(surf).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(surf).map(([k, m]) => ({ k, pct: Math.round(m / tot * 100) })).filter((x) => x.pct > 0).sort((a, b) => b.pct - a.pct);
}

/* stops <-> "lat,lon,name;..." for the shareable #/giro?p=... link */
export function encodeStops(stops) {
  return stops.map((s) => (+s.lat).toFixed(5) + "," + (+s.lon).toFixed(5) + (s.id ? "," + encodeURIComponent(s.id) : "")).join(";");
}
export function decodeStops(str) {
  const out = [];
  for (const part of String(str || "").split(";").slice(0, MAX_STOPS)) {
    const [la, lo, id] = part.split(",");
    const lat = +la, lon = +lo;
    if (isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && la !== "" && lo !== "") out.push({ lat, lon, id: id ? decodeURIComponent(id) : null });
  }
  return out;
}

const xmlEsc = (s) => String(s == null ? "" : s).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]));
/* GPX with waypoints (summits, water...) before the track, as Garmin/Wahoo expect */
export function routeGpx(name, track, wpts = []) {
  const w = wpts.map((p) => `<wpt lat="${(+p.lat).toFixed(6)}" lon="${(+p.lon).toFixed(6)}">${p.ele != null ? `<ele>${Math.round(p.ele)}</ele>` : ""}<name>${xmlEsc(p.name)}</name>${p.sym ? `<sym>${xmlEsc(p.sym)}</sym>` : ""}</wpt>`).join("\n");
  const body = track.map((q) => `<trkpt lat="${(+q[0]).toFixed(6)}" lon="${(+q[1]).toFixed(6)}">${q[2] != null ? `<ele>${Math.round(q[2])}</ele>` : ""}</trkpt>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="LocaRide" xmlns="http://www.topografix.com/GPX/1/1">\n<metadata><name>${xmlEsc(name)}</name></metadata>\n${w}${w ? "\n" : ""}<trk><name>${xmlEsc(name)}</name><trkseg>\n${body}\n</trkseg></trk>\n</gpx>\n`;
}

/* index of the highest sample */
export function highestIdx(p) { let b = 0; for (let i = 1; i < p.length; i++) if (p[i] > p[b]) b = i; return b; }

/* ---------------------------------------------------------------- saved rides
   Same storage as the classic app (js/myrides.js), so a ride saved in one shows in the other:
   users/{uid}/routes/{auto} = { name, stops, track: "lat,lon,ele;...", pts, distKm, ascent, savedAt } */
export const MAX_TRACK_PTS = 6000;
export function fitTrack(t, max) {
  if (t.length <= max) return t.slice();
  const out = [], step = (t.length - 1) / (max - 1);
  for (let i = 0; i < max - 1; i++) out.push(t[Math.round(i * step)]);
  out.push(t[t.length - 1]);
  return out;
}
export function encodeTrack(t) { return t.map((q) => (+q[0]).toFixed(5) + "," + (+q[1]).toFixed(5) + "," + (q[2] == null ? "" : Math.round(q[2]))).join(";"); }
export function decodeTrack(s) {
  if (!s) return [];
  return String(s).split(";").map((p) => { const a = p.split(","); return [parseFloat(a[0]), parseFloat(a[1]), a[2] === "" || a[2] == null ? null : parseFloat(a[2])]; })
    .filter((q) => isFinite(q[0]) && isFinite(q[1]));
}
/* the document to store for the current ride (track resampled like the classic app) */
export function rideDoc(name, stops, track, km, gain, now = Date.now()) {
  let t = fitTrack(track, MAX_TRACK_PTS), enc = encodeTrack(t);
  if (enc.length > 900000) { t = fitTrack(track, 3000); enc = encodeTrack(t); }
  return {
    name: String(name || "Il mio giro").trim().slice(0, 80) || "Il mio giro",
    stops: stops.map((s) => ({ type: s.id ? "pass" : "point", name: String(s.name || "").slice(0, 80), lat: +s.lat, lon: +s.lon, elevation: s.elevation ?? null })),
    track: enc, pts: t.length, distKm: +(+km).toFixed(2), ascent: gain == null ? 0 : Math.round(gain), savedAt: now
  };
}
