/*
 * gears.mjs - "Rapporti consigliati" (Rick 14/11/2026): the easiest gear a rider of a given W/kg needs on a side.
 *
 * The physics of climbing (gravity + rolling resistance + a little air) gives the speed a rider holds on a
 * gradient for as long as that stretch lasts (power-duration: a short ramp can be ridden above FTP, a long
 * climb below it). A cadence floor turns that speed into a development: the metres the bike travels for each
 * turn of the pedals (chainring / cog x wheel circumference). Three checks on every side, the smallest wins:
 *   - ramp: the max gradient over its length (maxGradient is the steepest 300 m in the pipeline's data),
 *           at 50 rpm - out of the saddle is fine there;
 *   - hard: the hardest km (a sliding 1 km window on the profile) at 60 rpm;
 *   - avg:  the whole climb at its average gradient at 65 rpm.
 * The floors are what an amateur can still turn without grinding (checked on Zoncolan: 3 W/kg -> 30x34/34x36,
 * what riders actually fit there), not a coach's ideal 80-90 rpm.
 * The gear shown is the HARDEST common road combination that is still easy enough: one easier never hurts.
 */
import { eleAt } from "./climb.mjs?v=59";

export const GEAR_WKG = [2, 2.5, 3, 3.5, 4, 5];
export const RIDER_KG = 70, BIKE_KG = 8, WHEEL_M = 2.11;          // 700x28 tyre
export const CADENCE = { ramp: 50, hard: 60, avg: 65 };
export const RAMP_M = 300;                                          // the window of maxGradient (build_osm_passes.mjs)
const G = 9.81, CRR = 0.005, CDA = 0.4, RHO = 1.1, ETA = 0.97;

/* common road combinations, easiest first: { f: chainring, r: cog, dev: metres per pedal turn } */
export const GEARS = [[30, 36], [30, 34], [34, 36], [34, 34], [34, 32], [34, 30], [34, 28], [36, 28], [34, 25], [39, 28], [39, 25], [39, 23]]
  .map(([f, r]) => ({ f, r, dev: +(f / r * WHEEL_M).toFixed(2) }));

/* share of FTP a rider holds for t minutes: above it on short efforts (x1.5 at most), a little below it past an hour */
export function powerFactor(min) {
  if (!(min > 0)) return 1;
  return min >= 60 ? Math.pow(60 / min, 0.07) : Math.min(1.5, Math.pow(60 / min, 0.1));
}

/* steady speed (m/s) on a gradient (%) with W watts at the pedals, for a total mass (kg) */
export function speedAt(gradePct, watts, kg = RIDER_KG + BIKE_KG) {
  const th = Math.atan(gradePct / 100), Fg = kg * G * (Math.sin(th) + CRR * Math.cos(th)), P = watts * ETA;
  let lo = 0.05, hi = 30;
  for (let i = 0; i < 60; i++) { const v = (lo + hi) / 2; if (v * Fg + 0.5 * RHO * CDA * v ** 3 > P) hi = v; else lo = v; }
  return (lo + hi) / 2;
}

/* speed a rider of wkg W/kg holds on lenM metres at gradePct: power for the time the stretch takes */
export function holdSpeed(gradePct, lenM, wkg, riderKg = RIDER_KG) {
  let v = speedAt(gradePct, wkg * riderKg, riderKg + BIKE_KG);
  for (let i = 0; i < 6; i++) v = speedAt(gradePct, wkg * riderKg * powerFactor(lenM / v / 60), riderKg + BIKE_KG);
  return v;
}

/* the hardest km of a side (sliding window on the profile): { g: %, from: km }; the whole side if it is shorter */
export function hardestStretch(v, lenKm = 1) {
  const L = +v.distance_km || 0;
  if (!(L > 0) || !(v.elevationProfile || []).length) return null;
  if (L <= lenKm) return { g: +v.avgGradient || 0, from: 0, len: L };
  let best = null;
  for (let a = 0; a + lenKm <= L + 1e-9; a += 0.05) {
    const g = (eleAt(v, a + lenKm) - eleAt(v, a)) / (lenKm * 10);
    if (!best || g > best.g) best = { g, from: a };
  }
  return { g: +best.g.toFixed(1), from: +best.from.toFixed(2), len: lenKm };
}

/* the stretches that decide the gear on a side: [{ k: ramp|hard|avg, g: %, m: metres }] */
export function gearChecks(v) {
  const L = (+v.distance_km || 0) * 1000, out = [];
  if (!(L > 0)) return out;
  const hard = hardestStretch(v);
  if (isFinite(v.maxGradient) && v.maxGradient > 0) out.push({ k: "ramp", g: +v.maxGradient, m: Math.min(RAMP_M, L) });
  if (hard) out.push({ k: "hard", g: hard.g, m: Math.min(1000, L) });
  if (isFinite(v.avgGradient) && v.avgGradient > 0) out.push({ k: "avg", g: +v.avgGradient, m: L });
  return out.filter((c) => c.g >= 2);
}

/* the hardest common gear whose development is at most `dev` (3% of slack): null = easier than 30x36 is needed,
   any: true = even the hardest listed one is easy enough (any road bike will do) */
export function gearFor(dev) {
  let pick = null;
  for (const x of GEARS) if (x.dev <= dev * 1.03) pick = x;
  return pick && pick === GEARS[GEARS.length - 1] && dev > pick.dev * 1.03 ? { ...pick, any: true } : pick;
}

/* the gear for one rider on one side: { wkg, dev (m), by: which check decides, gear } or null when flat */
export function gearsFor(v, wkg, riderKg = RIDER_KG) {
  let best = null;
  for (const c of gearChecks(v)) {
    const dev = holdSpeed(c.g, c.m, wkg, riderKg) * 60 / CADENCE[c.k];
    if (!best || dev < best.dev) best = { dev, by: c.k };
  }
  if (!best) return null;
  const dev = +best.dev.toFixed(2);
  return { wkg, dev, by: best.by, gear: gearFor(dev) };
}
