/*
 * tour.mjs - a ride of several days: how long each day is and where it ends (24/11/2026, Rick).
 *
 * The rider says what bike they have (the load: bike + bags) and how fit they are; from that the app knows
 * the speed on every metre of the route (the same model as the Giro's ETA, lib/route.mjs etaMinutes, with the
 * load slowing the climbs and a little the flat) and how many hours a day they ride. Each day ends in the
 * village or town closest to that time (places from OpenStreetMap along the route), never in the middle of
 * nowhere; the last day takes the remainder unless it is too long. Pure functions, test/v2-tour.test.mjs.
 */
import { speedKmh, vamFor, havKm } from "./climb.mjs?v=73";

/* set-ups: bike + luggage (kg) */
export const SETUPS = [
  { k: "leggera", label: "Bici leggera", note: "borsello e poco altro", kg: 10 },
  { k: "bikepacking", label: "Bikepacking", note: "borse da telaio e sella", kg: 15 },
  { k: "borse", label: "Cicloturismo con borse", note: "portapacchi e borse laterali", kg: 28 },
  { k: "tenda", label: "Viaggio con tenda", note: "campeggio e cucina", kg: 42 }
];
/* fitness: power for the speed model and hours in the saddle per day (stops excluded) */
export const FITNESS = [
  { k: "tranquillo", label: "Tranquillo", note: "poche uscite, ritmo da gita", wkg: 2.0, h: 4 },
  { k: "allenato", label: "Allenato", note: "esco ogni settimana", wkg: 2.8, h: 5.5 },
  { k: "sportivo", label: "Sportivo", note: "gran fondo, salite lunghe", wkg: 3.6, h: 7 }
];
export const RIDER_KG = 72, BASE_KG = 8;   // the speed model is tuned on a road bike of ~8 kg
export const setupOf = (k) => SETUPS.find((s) => s.k === k) || SETUPS[1];
export const fitnessOf = (k) => FITNESS.find((f) => f.k === k) || FITNESS[1];

/* cumulative minutes along an evenly sampled side ({ elevationProfile, distance_km }) with this load and fitness.
   Climbing: same power on a heavier system (W/kg x (rider+8)/(rider+load)). Flat: bags cost a little (wider,
   heavier tyres), ~0.4% per kg over 8. Descents: a loaded bike is braked more (max 45 km/h with 40+ kg). */
export function tourMinutes(side, fit, kg) {
  const p = side.elevationProfile || [], n = p.length;
  if (n < 2 || !(side.distance_km > 0)) return [0];
  const step = side.distance_km / (n - 1), extra = Math.max(0, kg - BASE_KG);
  const wkgC = fit.wkg * (RIDER_KG + BASE_KG) / (RIDER_KG + Math.max(kg, BASE_KG));
  const flat = vamFor(fit.wkg, 7) / 34 * Math.max(0.75, 1 - 0.004 * extra), vmax = 55 - 0.25 * extra;
  const k = Math.max(1, Math.round(0.25 / step)), out = [0];
  for (let i = 1; i < n; i++) {
    const a = Math.max(0, i - k), b = Math.min(n - 1, i + k - 1), g = (p[b] - p[a]) / ((b - a) * step * 1000);
    let v = g > 0.015 ? speedKmh(g, vamFor(wkgC, 7) / 34) : speedKmh(g, flat);
    if (g > 0.015) v = Math.min(v, flat); else v = Math.min(v, vmax);
    out.push(out[i - 1] + step / v * 60);
  }
  return out;
}

/* Day ends. cum = minutes at each sample, budget = minutes per day, places = [{ i, name, rank }] (sample index,
   rank 2 = town, 1 = village). A day ends at the place whose time is nearest to the target, inside -15%..+10%
   of the budget (towns preferred by 10 minutes); no place there: at the target itself (name null). The last day
   takes the rest when it is under 125% of a day. Returns [{ i, name }] for every day but the last. */
export function cutDays(cum, budget, places = []) {
  const end = cum[cum.length - 1], cuts = [];
  if (!(budget > 0) || end <= budget * 1.25) return cuts;
  let t0 = 0;
  for (let guard = 0; guard < 60 && end - t0 > budget * 1.25; guard++) {
    const T = t0 + budget, lo = t0 + budget * 0.85, hi = t0 + budget * 1.1;
    let best = null;
    for (const pl of places) {
      const t = cum[pl.i]; if (!(t >= lo && t <= hi)) continue;
      const sc = Math.abs(t - T) - (pl.rank >= 2 ? 10 : 0);
      if (!best || sc < best.sc) best = { sc, i: pl.i, name: pl.name };
    }
    if (!best) { let i = 0; while (i < cum.length - 1 && cum[i] < T) i++; best = { i, name: null }; }
    if (best.i <= (cuts.length ? cuts[cuts.length - 1].i : 0)) break;
    cuts.push({ i: best.i, name: best.name });
    t0 = cum[best.i];
  }
  return cuts;
}

/* per-day figures from the sampled side: km, metres up, minutes, from/to names */
export function daySummary(side, cum, cuts, first = "Partenza", last = "Arrivo") {
  const p = side.elevationProfile, n = p.length, step = side.distance_km / (n - 1);
  const ends = cuts.map((c) => c.i).concat(n - 1), out = [];
  let a = 0, from = first;
  ends.forEach((b, d) => {
    let up = 0; for (let i = a + 1; i <= b; i++) if (p[i] > p[i - 1]) up += p[i] - p[i - 1];
    const to = d < cuts.length ? (cuts[d].name || "km " + Math.round(b * step)) : last;
    out.push({ day: d + 1, a, b, km: (b - a) * step, up: Math.round(up), min: cum[b] - cum[a], from, to });
    a = b; from = to;
  });
  return out;
}

/* places along the track (OpenStreetMap nodes) -> sample indexes of the side, within maxKm of the route */
export function placesOnSide(sideTrack, nodes, maxKm = 2) {
  const out = [];
  for (const nd of nodes || []) {
    const name = nd.tags && nd.tags.name; if (!name) continue;
    let bi = -1, bd = Infinity;
    for (let i = 0; i < sideTrack.length; i++) { const d = havKm(nd.lat, nd.lon, sideTrack[i][0], sideTrack[i][1]); if (d < bd) { bd = d; bi = i; } }
    if (bd <= maxKm) out.push({ i: bi, name, rank: nd.tags.place === "town" || nd.tags.place === "city" ? 2 : 1 });
  }
  return out;
}

/* Overpass query for the towns and villages within 2 km of a polyline ([[lat, lon]...], thinned to <= 120 points) */
export function placesQuery(track, max = 120) {
  const st = Math.max(1, Math.ceil(track.length / max)), pts = [];
  for (let i = 0; i < track.length; i += st) pts.push(track[i]);
  if (pts[pts.length - 1] !== track[track.length - 1]) pts.push(track[track.length - 1]);
  const poly = pts.map((t) => (+t[0]).toFixed(4) + "," + (+t[1]).toFixed(4)).join(",");
  return `[out:json][timeout:25];node["place"~"^(city|town|village)$"](around:2000,${poly});out tags center 400;`;
}
