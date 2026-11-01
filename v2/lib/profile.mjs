/*
 * profile.mjs - the interactive elevation profile (climb page and Giro): a light elevation axis and
 * the cursor that follows the mouse or the finger on the profile and, on the map, along the road.
 * Pure: x/km/elevation/position maths. The SVG and the events live in app.mjs.
 */
import { profileDist, eleAt, havKm } from "./climb.mjs?v=26";

export const AXIS_W = 46;   // px of the viewBox kept on the left for the elevation labels

const NICE = [10, 20, 25, 50, 100, 200, 250, 500, 1000];

/* elevation labels: where you start, where you arrive, and 1-3 round values between,
   never closer than minGap px to each other (start and finish win) */
export function yTicks(start, end, lo, hi, h, pad, minGap = 18) {
  if (![start, end, lo, hi].every((x) => Number.isFinite(x))) return [];
  const span = hi - lo || 1, Y = (e) => +(h - pad - (e - lo) / span * (h - 2 * pad)).toFixed(1);
  const out = [{ e: Math.round(start), y: Y(start), kind: "start" }];
  if (Math.abs(Y(end) - Y(start)) >= minGap) out.push({ e: Math.round(end), y: Y(end), kind: "end" });
  else if (Math.round(end) !== Math.round(start)) out[0].kind = "start end";
  const step = NICE.find((s) => span / s <= 4) || 1000;
  for (let e = Math.ceil(lo / step) * step; e <= hi; e += step) {
    const y = Y(e);
    if (out.every((t) => Math.abs(t.y - y) >= minGap)) out.push({ e, y, kind: "mid" });
  }
  return out.sort((a, b) => a.e - b.e);
}

/* cumulative km along the track, scaled to the profile's own length (what the x axis shows) */
const CUM = new WeakMap();
function trackKm(v) {
  let c = CUM.get(v);
  if (c) return c;
  const t = v.track || [], pd = profileDist(v), L = pd[pd.length - 1] || +v.distance_km || 0;
  const raw = [0];
  for (let i = 1; i < t.length; i++) raw.push(raw[i - 1] + havKm(t[i - 1][0], t[i - 1][1], t[i][0], t[i][1]));
  const tot = raw[raw.length - 1] || 1;
  c = { km: raw.map((x) => x / tot * L), L };
  CUM.set(v, c);
  return c;
}
export function profileLength(v) { const pd = profileDist(v); return pd[pd.length - 1] || +v.distance_km || 0; }

/* x (0..w) on the profile -> km */
export function kmAtX(v, x, w) { return Math.max(0, Math.min(1, x / (w || 1))) * profileLength(v); }

/* what the cursor shows at km: elevation, gradient over ~±150 m, and where it is on the map */
export function pointAt(v, km) {
  const L = profileLength(v), k = Math.max(0, Math.min(L, km));
  const a = Math.max(0, k - 0.15), b = Math.min(L, k + 0.15);
  const ele = eleAt(v, k), ea = eleAt(v, a), eb = eleAt(v, b);
  const grade = b > a && ea != null && eb != null ? (eb - ea) / ((b - a) * 1000) * 100 : 0;
  let lat = null, lon = null;
  const t = v.track || [];
  if (t.length > 1) {
    const { km: c } = trackKm(v);
    let i = 1; while (i < c.length - 1 && c[i] < k) i++;
    const span = c[i] - c[i - 1], f = span > 0 ? (k - c[i - 1]) / span : 0;
    lat = t[i - 1][0] + (t[i][0] - t[i - 1][0]) * f; lon = t[i - 1][1] + (t[i][1] - t[i - 1][1]) * f;
  }
  return { km: k, ele: ele == null ? null : Math.round(ele), grade, lat, lon };
}

/* the other way round: a point on the map near the road -> km along it (nearest vertex) */
export function kmNear(v, lat, lon) {
  const t = v.track || [];
  if (t.length < 2) return null;
  const { km: c } = trackKm(v), k = Math.cos(lat * Math.PI / 180);
  let bi = 0, bd = Infinity;
  for (let i = 0; i < t.length; i++) { const d = (t[i][0] - lat) ** 2 + ((t[i][1] - lon) * k) ** 2; if (d < bd) { bd = d; bi = i; } }
  return c[bi];
}
