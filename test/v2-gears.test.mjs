/*
 * v2/lib/gears.mjs - "Rapporti consigliati" (Rick 14/11/2026): the easiest gear each W/kg needs on a side,
 * from the max ramp (and its length), the hardest km and the average gradient.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { GEARS, GEAR_WKG, powerFactor, speedAt, holdSpeed, hardestStretch, gearChecks, gearFor, gearsFor } from "../v2/lib/gears.mjs";

// real sides from the app's data (passes_data.js / the Passo Pantani PR)
const CARPEGNA = { side: "Carpegna", distance_km: 5.8, avgGradient: 10.4, maxGradient: 19.8, elevationProfile: [773, 842, 963, 1066, 1181, 1282, 1373] };
const ZONCOLAN = { side: "Ovaro", distance_km: 10.1, avgGradient: 11.9, maxGradient: 22.0, elevationProfile: [510, 650, 800, 970, 1100, 1200, 1310, 1440, 1560, 1660, 1730] };
const PORDOI = { side: "Canazei", distance_km: 11.8, avgGradient: 6.6, maxGradient: 9.0, elevationProfile: [1465, 1540, 1620, 1700, 1780, 1860, 1940, 2020, 2090, 2150, 2200, 2239] };
const gear = (r) => (r.gear ? r.gear.f + "x" + r.gear.r : null);

test("gears: the list goes from the easiest to the hardest combination; developments on a 700x28 wheel", () => {
  for (let i = 1; i < GEARS.length; i++) assert.ok(GEARS[i].dev > GEARS[i - 1].dev, GEARS[i].f + "x" + GEARS[i].r);
  assert.equal(GEARS.find((g) => g.f === 34 && g.r === 34).dev, 2.11);
  assert.equal(gearFor(2.11).r, 34);
  assert.equal(gearFor(2.05).r, 34, "3% of slack: 2.11 m is fine for 2.05 m");
  assert.equal(gearFor(1.5), null, "easier than 30x36");
  assert.equal(gearFor(9).any, true, "any road gear will do");
});

test("gears: physics - steeper is slower, stronger is faster, short ramps are ridden above FTP", () => {
  assert.ok(speedAt(10, 210) < speedAt(5, 210));
  assert.ok(speedAt(10, 280) > speedAt(10, 210));
  assert.ok(Math.abs(speedAt(0, 200) * 3.6 - 33) < 4, "about 33 km/h on the flat with 200 W");
  assert.ok(powerFactor(3) > 1.25 && powerFactor(3) <= 1.5, "3 minutes: ~1.3 x FTP");
  assert.ok(Math.abs(powerFactor(60) - 1) < 1e-9);
  assert.ok(powerFactor(120) < 1);
  assert.ok(holdSpeed(20, 300, 3) > speedAt(20, 210), "a 300 m ramp: above threshold");
});

test("gears: the hardest km slides along the profile; short sides use their average", () => {
  const h = hardestStretch(ZONCOLAN);
  assert.ok(h.g >= 15 && h.g <= 17, "Zoncolan's hardest km " + h.g);
  assert.ok(h.from > 1 && h.from < 4);
  assert.deepEqual(hardestStretch({ distance_km: 0.8, avgGradient: 9, elevationProfile: [100, 172] }), { g: 9, from: 0, len: 0.8 });
  assert.deepEqual(gearChecks(CARPEGNA).map((c) => c.k), ["ramp", "hard", "avg"]);
  assert.deepEqual(gearChecks({ distance_km: 3, avgGradient: 6, elevationProfile: [100, 280] }).map((c) => c.k), ["hard", "avg"], "no max: no ramp check");
  assert.deepEqual(gearChecks({ distance_km: 3, avgGradient: 1, maxGradient: 1.5, elevationProfile: [100, 130] }), [], "flat: nothing to say");
});

test("gears: real climbs give the gears riders actually fit", () => {
  // Passo Pantani from Carpegna: the ~20% ramp decides
  assert.equal(gearsFor(CARPEGNA, 3).by, "ramp");
  assert.equal(gear(gearsFor(CARPEGNA, 3)), "34x34");
  assert.equal(gear(gearsFor(CARPEGNA, 4)), "39x28");
  assert.equal(gearsFor(CARPEGNA, 2).gear, null, "2 W/kg on 20%: easier than any road gear");
  // Zoncolan from Ovaro: the 16-17% km decides; 3 W/kg needs a 30x34
  assert.equal(gearsFor(ZONCOLAN, 3).by, "hard");
  assert.equal(gear(gearsFor(ZONCOLAN, 3)), "30x34");
  // Pordoi: regular, a compact is plenty
  assert.equal(gear(gearsFor(PORDOI, 2)), "34x32");
  assert.equal(gearsFor(PORDOI, 5).gear.any, true);
  // more W/kg never needs an easier gear
  for (const v of [CARPEGNA, ZONCOLAN, PORDOI]) {
    const d = GEAR_WKG.map((w) => gearsFor(v, w).dev);
    for (let i = 1; i < d.length; i++) assert.ok(d[i] > d[i - 1], v.side);
  }
  assert.equal(gearsFor({ distance_km: 0 }, 3), null);
});
