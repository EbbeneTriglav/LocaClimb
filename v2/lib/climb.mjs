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
  return (+x).toFixed(d).replace(".", ",");
}

export function havKm(la1, lo1, la2, lo2) {
  const r = Math.PI / 180, a = Math.sin((la2 - la1) * r / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin((lo2 - lo1) * r / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/* elevation at distance d (km) along the side, from its evenly spaced profile */
export function eleAt(v, d) {
  const p = v.elevationProfile || [], L = +v.distance_km || 0;
  if (!p.length) return null;
  if (p.length === 1 || !(L > 0)) return p[0];
  const f = Math.max(0, Math.min(1, d / L)) * (p.length - 1), i = Math.min(p.length - 2, Math.floor(f));
  return p[i] + (p[i + 1] - p[i]) * (f - i);
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
  const p = v.elevationProfile || [], n = p.length, L = +v.distance_km || 0;
  if (n < 2 || !(L > 0)) return { segs: [], line: "" };
  const lo = Math.min(...p), hi = Math.max(...p), span = hi - lo || 1;
  const X = (i) => +(i / (n - 1) * w).toFixed(1), Y = (e) => +(h - pad - (e - lo) / span * (h - 2 * pad)).toFixed(1);
  const step = L / (n - 1) * 1000, segs = [];
  for (let i = 1; i < n; i++) {
    const g = (p[i] - p[i - 1]) / step * 100;
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
