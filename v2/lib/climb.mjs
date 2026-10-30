/*
 * climb.mjs - pure helpers for a climb side (versante): numbers, profile, km-by-km road book,
 * gradient colours, GPX, position along the climb. No DOM, no network: covered by
 * test/v2-climb.test.mjs.
 *
 * A side is the record of data/osm_passes*.json / curated_overrides.json:
 *   { side, startLat, startLon, startElevation, endElevation, distance_km, avgGradient,
 *     maxGradient, exposure, elevationProfile: [m...] (evenly spaced over distance_km),
 *     track: [[lat, lon, ele?]...] }
 */

/* One gradient scale for the whole app, thresholds written next to the colours. */
export const GRADE_STOPS = [
  { max: 4, color: "#5B8DEF", label: "<4%" },
  { max: 7, color: "#F2C14E", label: "4–7" },
  { max: 10, color: "#F28C38", label: "7–10" },
  { max: 13, color: "#E5484D", label: "10–13" },
  { max: Infinity, color: "#C04BD6", label: "13+" }
];
export function gradeColor(g) {
  for (const s of GRADE_STOPS) if (g < s.max) return s.color;
  return GRADE_STOPS[GRADE_STOPS.length - 1].color;
}
/* difficulty 1..10 of the data -> the same five colours (1-3, 4-5, 6-7, 8-9, 10) */
export function difficultyColor(d) {
  d = +d || 0;
  return d >= 10 ? "#C04BD6" : d >= 8 ? "#E5484D" : d >= 6 ? "#F28C38" : d >= 4 ? "#F2C14E" : "#5B8DEF";
}

/* Italian number: 7.04 -> "7,0" */
export function num(x, d = 1) {
  if (x == null || !isFinite(x)) return "–";
  const r = (+x).toFixed(d);
  return (/^-0(\.0+)?$/.test(r) ? r.slice(1) : r).replace(".", globalThis.LR_DEC || ",");   // never "-0"; "." in English
}

export function havKm(la1, lo1, la2, lo2) {
  const r = Math.PI / 180, a = Math.sin((la2 - la1) * r / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin((lo2 - lo1) * r / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/* Distance (km) of each elevationProfile sample along the side - same rule as the classic app
   (js/panel.js profileDist): pipeline profiles take sample j at TRACK INDEX round(j*(M-1)/(n-1)),
   and the track is dense on hairpins and sparse on straights, so reading them as evenly spaced
   squeezes and stretches the climb. Profiles built at even distance (elevSource set: GPX, user
   proposals) or with a track shorter than the profile keep the even spacing. */
export function profileDist(v) {
  const pr = v.elevationProfile || [], n = pr.length, T = v.track || [], M = T.length, dist = +v.distance_km || 0;
  if (n < 2) return [0];
  const even = () => Array.from({ length: n }, (_, j) => j / (n - 1) * (dist || 10));
  if (v.elevSource || M < n) return even();
  const cum = [0];
  for (let i = 1; i < M; i++) cum.push(cum[i - 1] + havKm(T[i - 1][0], T[i - 1][1], T[i][0], T[i][1]));
  const L = cum[M - 1];
  if (!(L > 0)) return even();
  const k = (dist || L) / L;
  return Array.from({ length: n }, (_, i) => cum[Math.round(i * (M - 1) / (n - 1))] * k);
}
const PD = new WeakMap();
function pdOf(v) { let d = PD.get(v); if (!d) { d = profileDist(v); PD.set(v, d); } return d; }

/* elevation at distance d (km) along the side, interpolated on the profile at its true distances */
export function eleAt(v, d) {
  const p = v.elevationProfile || [];
  if (!p.length) return null;
  if (p.length === 1) return p[0];
  const pd = pdOf(v), L = pd[pd.length - 1];
  const x = Math.max(0, Math.min(L, d));
  let i = 0;
  while (i < pd.length - 2 && pd[i + 1] < x) i++;
  const span = pd[i + 1] - pd[i];
  return span > 0 ? p[i] + (p[i + 1] - p[i]) * (x - pd[i]) / span : p[i + 1];
}

/* road book: one row per km (the last one may be partial) { k: end km, len, g: %, e: m at end } */
export function kmTable(v) {
  const L = +v.distance_km || 0, rows = [];
  if (!(L > 0) || !(v.elevationProfile || []).length) return rows;
  for (let a = 0; a < L - 1e-9; a += 1) {
    const b = Math.min(L, a + 1), len = b - a;
    const e0 = eleAt(v, a), e1 = eleAt(v, b);
    rows.push({ k: +b.toFixed(1), len: +len.toFixed(2), g: +((e1 - e0) / (len * 10)).toFixed(1), e: Math.round(e1) });
  }
  return rows;
}
/* index of the steepest full km (the yellow row of the road book), -1 if none */
export function hardestKm(rows) {
  let best = -1;
  rows.forEach((r, i) => { if (r.len >= 0.5 && (best < 0 || r.g > rows[best].g)) best = i; });
  return best;
}

/* profile as SVG pieces for a w x h box: filled segments coloured by gradient + the outline */
export function profileShapes(v, w, h, pad = 8) {
  const p = v.elevationProfile || [], n = p.length;
  if (n < 2) return { segs: [], line: "" };
  const pd = pdOf(v), L = pd[n - 1] || 1;
  const lo = Math.min(...p), hi = Math.max(...p), span = hi - lo || 1;
  const X = (i) => +(pd[i] / L * w).toFixed(1), Y = (e) => +(h - pad - (e - lo) / span * (h - 2 * pad)).toFixed(1);
  const segs = [];
  for (let i = 1; i < n; i++) {
    const dm = (pd[i] - pd[i - 1]) * 1000;
    if (!(dm > 0)) continue;
    const g = (p[i] - p[i - 1]) / dm * 100;
    segs.push({ d: `M${X(i - 1)} ${Y(p[i - 1])} L${X(i)} ${Y(p[i])} L${X(i)} ${h} L${X(i - 1)} ${h} Z`, color: gradeColor(g), g: +g.toFixed(1) });
  }
  const line = p.map((e, i) => (i ? "L" : "M") + X(i) + " " + Y(e)).join(" ");
  return { segs, line, lo: Math.round(lo), hi: Math.round(hi) };
}

/* the track with an elevation on every point (tracks of the discover files are lat/lon only) */
export function trackWithEle(v) {
  const t = v.track || [];
  if (t.length < 2) return t.map((q) => [q[0], q[1], q[2] ?? null]);
  const cum = [0];
  for (let i = 1; i < t.length; i++) cum.push(cum[i - 1] + havKm(t[i - 1][0], t[i - 1][1], t[i][0], t[i][1]));
  const tot = cum[cum.length - 1] || 1, L = +v.distance_km || tot;
  return t.map((q, i) => [q[0], q[1], q[2] != null ? q[2] : Math.round(eleAt(v, cum[i] / tot * L))]);
}

const xmlEsc = (s) => String(s == null ? "" : s).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]));
export function gpx(name, pts) {
  const body = pts.map((q) => `<trkpt lat="${q[0]}" lon="${q[1]}">${q[2] != null ? `<ele>${q[2]}</ele>` : ""}</trkpt>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="LocaRide" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${xmlEsc(name)}</name></metadata><trk><name>${xmlEsc(name)}</name><trkseg>${body}</trkseg></trk></gpx>\n`;
}

/* Where am I on the climb? Nearest track point -> km done, km and metres to the top, and the
   gradient of the km ahead. offKm = distance from the road (far = not on this climb). */
export function positionOnClimb(v, lat, lon) {
  const t = v.track || [];
  if (t.length < 2) return null;
  const cum = [0];
  for (let i = 1; i < t.length; i++) cum.push(cum[i - 1] + havKm(t[i - 1][0], t[i - 1][1], t[i][0], t[i][1]));
  const tot = cum[cum.length - 1] || 1, L = +v.distance_km || tot;
  let bi = 0, bd = Infinity;
  for (let i = 0; i < t.length; i++) { const d = havKm(lat, lon, t[i][0], t[i][1]); if (d < bd) { bd = d; bi = i; } }
  const done = cum[bi] / tot * L, e = eleAt(v, done), top = eleAt(v, L);
  const ahead = Math.min(L, done + 1), gAhead = ahead > done ? (eleAt(v, ahead) - e) / ((ahead - done) * 10) : 0;
  return { km: +done.toFixed(2), toGoKm: +(L - done).toFixed(2), toGoM: Math.max(0, Math.round(top - e)), gAhead: +gAhead.toFixed(1), offKm: +bd.toFixed(3) };
}

/* summary numbers of a side */
export function sideStats(v) {
  const gain = (v.endElevation ?? 0) - (v.startElevation ?? 0);
  return { km: +v.distance_km || 0, avg: +v.avgGradient || 0, max: +v.maxGradient || 0, gain: Math.round(gain), top: v.endElevation, start: v.startElevation };
}

/* ------------------------------------------------ hairpins and climbing times
   Same models as the classic app (js/panelplus.js): a hairpin is a turn of >= 150 degrees in
   the same direction within 150 m of road; time = the profile ridden segment by segment with
   the weather model's speed (js/rideweather.js rwSpeed), VAM from W/kg (Ferrari). */
function bearing(a, b, c, d) {
  const r = Math.PI / 180, y = Math.sin((d - b) * r) * Math.cos(c * r), x = Math.cos(a * r) * Math.sin(c * r) - Math.sin(a * r) * Math.cos(c * r) * Math.cos((d - b) * r);
  return Math.atan2(y, x) / r;
}
export function hairpins(track) {
  if (!track || track.length < 3) return 0;
  const pts = [track[0]];
  for (let i = 1; i < track.length; i++) if (havKm(pts[pts.length - 1][0], pts[pts.length - 1][1], track[i][0], track[i][1]) > 0.008) pts.push(track[i]);
  if (pts.length < 3) return 0;
  const seg = [], turn = [];
  for (let i = 1; i < pts.length; i++) seg.push(havKm(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
  for (let i = 1; i < pts.length - 1; i++) {
    let t = bearing(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) - bearing(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    while (t > 180) t -= 360; while (t < -180) t += 360;
    turn.push(t);
  }
  let n = 0, k = 0;
  while (k < turn.length) {
    let sum = 0, dist = 0, hit = -1;
    for (let j = k; j < turn.length; j++) {
      if (j > k) dist += seg[j];
      if (dist > 0.15) break;
      sum += turn[j];
      if (Math.abs(sum) >= 150) { hit = j; break; }
    }
    if (hit >= 0) { n++; k = hit + 1; } else k++;
  }
  return n;
}
export function speedKmh(g, flatKmh) {
  const vam = flatKmh * 34;
  if (g > 0.015) return Math.max(5, Math.min(flatKmh, vam / (g * 1000)));
  if (g < -0.015) return Math.min(55, flatKmh * (1 + 12 * Math.abs(g)));
  return flatKmh;
}
export function vamFor(wkg, avgPct) { return wkg * (200 + 10 * Math.max(0, avgPct || 0)); }
/* minutes to ride the side at this W/kg */
export function climbMinutes(v, wkg) {
  const p = v.elevationProfile || [], vam = vamFor(wkg, v.avgGradient);
  if (p.length < 2 || !(v.distance_km > 0) || !(vam > 0)) return null;
  const pd = pdOf(v), flat = vam / 34;
  let h = 0;
  for (let i = 1; i < p.length; i++) {
    const d = pd[i] - pd[i - 1];
    if (d > 0) h += d / speedKmh((p[i] - p[i - 1]) / (d * 1000), flat);
  }
  return h * 60;
}
export function clock(min) {
  if (min == null || !isFinite(min)) return "–";
  const m = Math.round(min);
  return m < 60 ? m + "'" : Math.floor(m / 60) + "h" + String(m % 60).padStart(2, "0");
}

/* traffic 1..10 (weekdays / weekend) and trucks, as the classic app (js/utils.js versTraffic) */
const TRAF_MAP = { basso: 2, medio: 5, alto: 8 };
const TOURIST_REG = { "Trentino-Alto Adige": 1, "Veneto": 1, "Veneto/Trentino": 1, "Lombardia/Trentino": 1 };
export function traffic(v, p) {
  if (typeof v.trafFeriale === "number") return { fer: v.trafFeriale, wkd: v.trafWeekend, trucks: v.trucks || "rari" };
  if (p && typeof p.trafFeriale === "number") return { fer: p.trafFeriale, wkd: p.trafWeekend, trucks: p.trucks || "rari" };
  if (!TRAF_MAP[v.traffic]) return null;                    // "n/d": no model, say nothing
  const base = TRAF_MAP[v.traffic], tour = p && TOURIST_REG[p.region] ? 2 : 1;
  return { fer: base, wkd: Math.min(10, base + tour), trucks: p && p.elevation >= 1900 ? "rari" : (v.traffic === "alto" ? "possibili" : "rari") };
}
export const TRUCKS = { no: "Niente camion", rari: "Camion rari", possibili: "Possibili camion", si: "Camion frequenti" };

/* points (water...) within maxM metres of the side's track -> [{ km, m, p }] sorted by km */
export function alongTrack(v, points, maxM = 100) {
  const t = v.track || [];
  if (t.length < 2) return [];
  const cum = [0];
  for (let i = 1; i < t.length; i++) cum.push(cum[i - 1] + havKm(t[i - 1][0], t[i - 1][1], t[i][0], t[i][1]));
  const tot = cum[cum.length - 1] || 1, L = +v.distance_km || tot, out = [];
  let la0 = 90, la1 = -90, lo0 = 180, lo1 = -180;
  for (const q of t) { la0 = Math.min(la0, q[0]); la1 = Math.max(la1, q[0]); lo0 = Math.min(lo0, q[1]); lo1 = Math.max(lo1, q[1]); }
  const pad = 0.002;
  for (const p of points) {
    if (p.lat < la0 - pad || p.lat > la1 + pad || p.lon < lo0 - pad || p.lon > lo1 + pad) continue;
    let bd = Infinity, bi = 0;
    for (let i = 0; i < t.length; i++) { const d = havKm(p.lat, p.lon, t[i][0], t[i][1]); if (d < bd) { bd = d; bi = i; } }
    if (bd * 1000 <= maxM) out.push({ km: +(cum[bi] / tot * L).toFixed(1), m: Math.round(bd * 1000), p });
  }
  return out.sort((a, b) => a.km - b.km);
}

/* ------------------------------------------------ merging sides (as the classic app, js/data.js) */
/* two sides start at the same place (~2 km) */
export function sameOrigin(a, b) {
  if (!a || !b) return false;
  return Math.abs((a.startLat || 0) - (b.startLat || 0)) + Math.abs((a.startLon || 0) - (b.startLon || 0)) < 0.02;
}
function sideBearing(p, v) { const r = Math.PI / 180, dy = v.startLat - p.lat, dx = (v.startLon - p.lon) * Math.cos(p.lat * r); return (Math.atan2(dx, dy) / r + 360) % 360; }
/* sides of an OSM twin that a curated pass is missing: start > 3 km from every curated start AND
   summit->start bearing >= 60 deg from every curated side, with a real track (js/data.js newSidesFor) */
export function newSidesFor(p, twinSides) {
  const cv = (p && p.versanti) || [], out = [];
  if (!twinSides || !twinSides.length) return out;
  if (cv.some((w) => !isFinite(w.startLat) || !isFinite(w.startLon))) return out;
  for (const v of twinSides) {
    if (!v || !isFinite(v.startLat) || !isFinite(v.startLon) || !(v.track && v.track.length > 1)) continue;
    const b = sideBearing(p, v);
    const clash = cv.concat(out).some((w) => { let d = Math.abs(sideBearing(p, w) - b); d = Math.min(d, 360 - d); return d < 60 || havKm(v.startLat, v.startLon, w.startLat, w.startLon) < 3; });
    if (!clash) out.push(v);
  }
  return out;
}
