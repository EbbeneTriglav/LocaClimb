/*
 * v2/lib/gears.mjs - "Rapporti consigliati" (Rick 14/11/2026): the easiest gear each W/kg needs on a side,
 * from the max ramp (and its length), the hardest km and the average gradient, picked among what the rider can
 * fit: road or gravel, Shimano or SRAM, double or single chainring.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SETUPS, GEAR_WKG, DEFAULT_SET, setupKey, cleanSet, parts, powerFactor, speedAt, holdSpeed, hardestStretch, gearChecks, needFor, gearFor, gearsFor } from "../v2/lib/gears.mjs";

// real sides from the app's data (passes_data.js)
const CARPEGNA = { side: "Carpegna", distance_km: 5.8, avgGradient: 10.4, maxGradient: 19.8, elevationProfile: [773, 842, 963, 1066, 1181, 1282, 1373] };
const ZONCOLAN = { side: "Ovaro", distance_km: 10.1, avgGradient: 11.9, maxGradient: 22.0, elevationProfile: [510, 650, 800, 970, 1100, 1200, 1310, 1440, 1560, 1660, 1730] };
const PORDOI = { side: "Canazei", distance_km: 11.8, avgGradient: 6.6, maxGradient: 9.0, elevationProfile: [1465, 1540, 1620, 1700, 1780, 1860, 1940, 2020, 2090, 2150, 2200, 2239] };
const ROAD_SH = { bike: "road", brand: "shimano" }, ROAD_SR = { bike: "road", brand: "sram" };
const GRX2 = { bike: "gravel", brand: "shimano", crank: "2x" }, XPLR40 = { bike: "gravel", brand: "sram", crank: "1x", ring: 40 };
const lab = (g) => (g.none ? "<" + g.easiest.f + "x" + g.easiest.r : (g.any ? "any>=" : "") + g.f + "x" + g.r);

test("gears: the groupsets on sale - the road starts at the compact 34 (SRAM 33), gravel goes lower", () => {
  assert.equal(SETUPS.road.brands.shimano.rings[0], 34, "Shimano road: 50/34 compact is the smallest");
  assert.deepEqual(SETUPS.road.brands.sram.rings, [33, 35, 37], "SRAM AXS: 46/33, 48/35, 50/37");
  assert.equal(Math.max(...SETUPS.road.brands.shimano.cogs), 36);
  assert.ok(SETUPS.gravel2x.brands.shimano.rings.includes(30) && SETUPS.gravel2x.brands.shimano.rings.includes(31), "GRX 46/30, 48/31");
  assert.ok(SETUPS.gravel1x.brands.sram.cogs.includes(52) && SETUPS.gravel1x.brands.shimano.cogs.includes(51));
  assert.equal(setupKey(DEFAULT_SET), "road");
  assert.equal(setupKey(GRX2), "gravel2x"); assert.equal(setupKey(XPLR40), "gravel1x");
  assert.deepEqual(parts(cleanSet(XPLR40)).rings, [40], "1x: the ring the rider chose");
  assert.equal(cleanSet({ bike: "gravel", brand: "shimano", crank: "1x", ring: 46 }).ring, 42, "GRX 1x has no 46: the nearest");
  assert.deepEqual(cleanSet({ bike: "moto", brand: "campa" }), DEFAULT_SET);
});

test("gears: physics - steeper is slower, stronger is faster, short ramps are ridden above FTP, gravel rolls harder", () => {
  assert.ok(speedAt(10, 210) < speedAt(5, 210));
  assert.ok(speedAt(10, 280) > speedAt(10, 210));
  assert.ok(Math.abs(speedAt(0, 200) * 3.6 - 33) < 4, "about 33 km/h on the flat with 200 W");
  assert.ok(powerFactor(3) > 1.25 && powerFactor(3) <= 1.5, "3 minutes: ~1.3 x FTP");
  assert.ok(Math.abs(powerFactor(60) - 1) < 1e-9);
  assert.ok(powerFactor(120) < 1);
  assert.ok(holdSpeed(20, 300, 3) > speedAt(20, 210), "a 300 m ramp: above threshold");
  assert.ok(needFor(CARPEGNA, 3, { crr: 0.010, bikeKg: 9.5 }).dev < needFor(CARPEGNA, 3).dev, "a dirt climb needs an easier gear");
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

test("gears: the cassette to fit on the small chainring first, a bigger crank only when any cassette is fine", () => {
  assert.equal(lab(gearFor(2.2, ROAD_SH)), "34x32", "compact + 11-32");
  assert.equal(lab(gearFor(1.9, ROAD_SH)), "<34x36", "easier than the easiest road gear");
  assert.equal(lab(gearFor(2.7, ROAD_SH)), "36x28", "34x28 is fine: a 52/36 too");
  assert.equal(lab(gearFor(9, ROAD_SH)), "any>=39x28");
  assert.equal(lab(gearFor(1.95, ROAD_SR)), "33x36", "SRAM 46/33 + 10-36");
  assert.equal(lab(gearFor(1.75, XPLR40)), "40x50");
  assert.equal(lab(gearFor(1.5, XPLR40)), "<40x52");
});

test("gears: real climbs give the gears riders actually fit", () => {
  // Passo Pantani from Carpegna: the ~20% ramp decides
  assert.equal(gearsFor(CARPEGNA, 3, ROAD_SH).by, "ramp");
  assert.equal(lab(gearsFor(CARPEGNA, 3, ROAD_SH).gear), "34x34");
  assert.equal(lab(gearsFor(CARPEGNA, 3, ROAD_SR).gear), "33x33");
  assert.equal(lab(gearsFor(CARPEGNA, 2, ROAD_SH).gear), "<34x36", "2 W/kg on 20%: easier than any road gear");
  assert.equal(lab(gearsFor(CARPEGNA, 2.5, XPLR40).gear), "40x50", "a 1x gravel with a mullet cassette gets there");
  // Zoncolan from Ovaro: 3 W/kg is just short even with 34x36 - a gravel double makes it
  assert.equal(gearsFor(ZONCOLAN, 3, ROAD_SH).by, "hard");
  assert.equal(lab(gearsFor(ZONCOLAN, 3, ROAD_SH).gear), "<34x36");
  assert.equal(lab(gearsFor(ZONCOLAN, 3, GRX2).gear), "30x36");
  // Pordoi: regular, a compact is plenty
  assert.equal(lab(gearsFor(PORDOI, 2, ROAD_SH).gear), "34x32");
  assert.equal(gearsFor(PORDOI, 5, ROAD_SH).gear.any, true);
  // more W/kg never needs an easier gear
  for (const v of [CARPEGNA, ZONCOLAN, PORDOI]) {
    const d = GEAR_WKG.map((w) => gearsFor(v, w).dev);
    for (let i = 1; i < d.length; i++) assert.ok(d[i] > d[i - 1], v.side);
  }
  assert.equal(gearsFor({ distance_km: 0 }, 3), null);
});
