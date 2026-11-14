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
 * The floors are what an amateur can still turn without grinding (checked on Zoncolan: 3 W/kg -> 34x36 is
 * just short, what riders actually report), not a coach's ideal 80-90 rpm.
 *
 * Groupsets (Rick 14/11/2026, second pass): the gear is picked among the combinations the rider can actually
 * fit - road or gravel, Shimano or SRAM, double or single chainring (and its teeth). The first number is the
 * SMALL chainring, the second the BIGGEST cog of the cassette. Sources, checked 14/11/2026:
 *   Shimano road 12s: cranks 50/34, 52/36, 53/39; cassettes 11-28, 11-30, 11-34, 11-36 (105), 11-32 on 11s.
 *   SRAM road AXS 12s: cranks 46/33, 48/35, 50/37 (Red/Force/Rival); cassettes 10-28, 10-30, 10-33, 10-36.
 *   Shimano GRX 12s: 2x 48/31, 46/30 with 11-34 / 11-36; 1x 38, 40, 42 with 10-45 / 10-51.
 *   SRAM gravel: 2x 43/30 (Force wide), 46/33 with 10-33 / 10-36; 1x XPLR 38-46 with 10-44, Red XPLR 10-46,
 *   Eagle (mullet) 10-50 / 10-52.
 * The gear shown is the HARDEST combination that is still easy enough: one easier never hurts.
 */
import { eleAt } from "./climb.mjs?v=60";

export const GEAR_WKG = [2, 2.5, 3, 3.5, 4, 5];
export const RIDER_KG = 70;
export const CADENCE = { ramp: 50, hard: 60, avg: 65 };
export const RAMP_M = 300;                                          // the window of maxGradient (build_osm_passes.mjs)
const G = 9.81, CDA = 0.4, RHO = 1.1, ETA = 0.97;
export const CRR = { paved: 0.005, gravelBike: 0.006, unpaved: 0.010 }; // gravel tyres roll a little worse on tarmac

/* bike: wheel circumference (m), bike mass; per brand the small chainrings and the biggest cogs on sale */
export const SETUPS = {
  road: { wheel: 2.11, bikeKg: 8, brands: {                         // 700x28
    shimano: { rings: [34, 36, 39], cogs: [28, 30, 32, 34, 36] },
    sram: { rings: [33, 35, 37], cogs: [28, 30, 33, 36] } } },
  gravel2x: { wheel: 2.20, bikeKg: 9.5, brands: {                   // 700x40
    shimano: { rings: [30, 31], cogs: [34, 36] },
    sram: { rings: [30, 33], cogs: [33, 36] } } },
  gravel1x: { wheel: 2.20, bikeKg: 9.5, brands: {
    shimano: { rings: [38, 40, 42], cogs: [45, 51] },
    sram: { rings: [38, 40, 42, 44, 46], cogs: [44, 46, 50, 52] } } }
};
export const DEFAULT_SET = { bike: "road", brand: "shimano", crank: "2x", ring: 40 };

/* the setup key of a choice: road | gravel2x | gravel1x */
export function setupKey(set) { return set.bike === "gravel" ? (set.crank === "1x" ? "gravel1x" : "gravel2x") : "road"; }

/* a stored choice made safe: unknown values fall back to the defaults; a 1x ring the brand doesn't make -> its nearest */
export function cleanSet(o) {
  const s = { ...DEFAULT_SET };
  if (o && (o.bike === "road" || o.bike === "gravel")) s.bike = o.bike;
  if (o && (o.brand === "shimano" || o.brand === "sram")) s.brand = o.brand;
  if (o && (o.crank === "1x" || o.crank === "2x")) s.crank = o.crank;
  const rings = SETUPS.gravel1x.brands[s.brand].rings, r = +(o && o.ring);
  s.ring = rings.includes(r) ? r : rings.reduce((a, b) => (Math.abs(b - (r || DEFAULT_SET.ring)) < Math.abs(a - (r || DEFAULT_SET.ring)) ? b : a));
  return s;
}

/* the chainrings and cogs of a choice: { rings (small chainring), cogs (biggest cog of the cassettes on sale), wheel } */
export function parts(set) {
  const st = SETUPS[setupKey(set)], b = st.brands[set.brand] || st.brands.shimano;
  return { rings: setupKey(set) === "gravel1x" ? [set.ring] : b.rings, cogs: b.cogs, wheel: st.wheel };
}
const combo = (f, r, wheel) => ({ f, r, dev: +(f / r * wheel).toFixed(2) });
/* share of FTP a rider holds for t minutes: above it on short efforts (x1.5 at most), a little below it past an hour */
export function powerFactor(min) {
  if (!(min > 0)) return 1;
  return min >= 60 ? Math.pow(60 / min, 0.07) : Math.min(1.5, Math.pow(60 / min, 0.1));
}

/* steady speed (m/s) on a gradient (%) with W watts at the pedals, for a total mass (kg) and a rolling coefficient */
export function speedAt(gradePct, watts, kg = RIDER_KG + 8, crr = CRR.paved) {
  const th = Math.atan(gradePct / 100), Fg = kg * G * (Math.sin(th) + crr * Math.cos(th)), P = watts * ETA;
  let lo = 0.05, hi = 30;
  for (let i = 0; i < 60; i++) { const v = (lo + hi) / 2; if (v * Fg + 0.5 * RHO * CDA * v ** 3 > P) hi = v; else lo = v; }
  return (lo + hi) / 2;
}

/* speed a rider of wkg W/kg holds on lenM metres at gradePct: power for the time the stretch takes */
export function holdSpeed(gradePct, lenM, wkg, o = {}) {
  const rk = o.riderKg || RIDER_KG, kg = rk + (o.bikeKg || 8), crr = o.crr || CRR.paved;
  let v = speedAt(gradePct, wkg * rk, kg, crr);
  for (let i = 0; i < 6; i++) v = speedAt(gradePct, wkg * rk * powerFactor(lenM / v / 60), kg, crr);
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

/* the development a rider needs on a side (metres): { dev, by } or null when there is nothing to climb */
export function needFor(v, wkg, o = {}) {
  let best = null;
  for (const c of gearChecks(v)) {
    const dev = holdSpeed(c.g, c.m, wkg, o) * 60 / CADENCE[c.k];
    if (!best || dev < best.dev) best = { dev, by: c.k };
  }
  return best ? { dev: +best.dev.toFixed(2), by: best.by } : null;
}

/* the gear to fit, with 3% of slack, the way a rider buys it: on the SMALL chainring of the most common crank
   (compact 34, SRAM 33, GRX 30...) the smallest "biggest cog" that is easy enough = the cassette to fit. Only when
   even the smallest cassette on sale is easy enough on that ring does a bigger crank come into play.
   { f, r, dev } | { none: true, easiest } when even the easiest is too hard | { f, r, dev, any: true } when all are fine */
export function gearFor(dev, set = DEFAULT_SET) {
  const { rings, cogs, wheel } = parts(cleanSet(set)), ok = (c) => c.dev <= dev * 1.03;
  const small = rings[0], cs = [...cogs].sort((a, b) => a - b);
  const onSmall = cs.map((r) => combo(small, r, wheel)).filter(ok);
  if (!onSmall.length) return { none: true, easiest: combo(small, cs[cs.length - 1], wheel) };
  if (onSmall[0].r !== cs[0]) return onSmall[0];
  const top = rings.map((f) => combo(f, cs[0], wheel)).filter(ok).pop();
  return top.f === rings[rings.length - 1] && dev > top.dev * 1.03 ? { ...top, any: true } : top;
}

/* the gear for one rider on one side with one groupset choice: { wkg, dev, by, gear } or null when flat.
   surface "unpaved" (a gravel climb) rolls harder. */
export function gearsFor(v, wkg, set = DEFAULT_SET, o = {}) {
  const s = cleanSet(set), st = SETUPS[setupKey(s)];
  const crr = o.unpaved ? CRR.unpaved : s.bike === "gravel" ? CRR.gravelBike : CRR.paved;
  const need = needFor(v, wkg, { riderKg: o.riderKg, bikeKg: st.bikeKg, crr });
  if (!need) return null;
  return { wkg, dev: need.dev, by: need.by, gear: gearFor(need.dev, s) };
}
