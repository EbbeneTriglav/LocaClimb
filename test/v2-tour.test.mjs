// v2/lib/tour.mjs: rides of several days - speed with the load, day ends in towns (24/11/2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { SETUPS, FITNESS, setupOf, fitnessOf, tourMinutes, cutDays, daySummary, placesOnSide, placesQuery } from "../v2/lib/tour.mjs";

const side = (prof, km) => ({ elevationProfile: prof, distance_km: km });
const flat = (n, km) => side(Array(n).fill(200), km);
const climb = (n, km, gain) => side(Array.from({ length: n }, (_, i) => 200 + gain * i / (n - 1)), km);

test("set-ups and fitness levels are ordered and complete", () => {
  assert.deepEqual(SETUPS.map((s) => s.kg), [10, 15, 28, 42]);
  assert.deepEqual(FITNESS.map((f) => f.h), [4, 5.5, 7]);
  assert.equal(setupOf("nope").k, "bikepacking"); assert.equal(fitnessOf("sportivo").wkg, 3.6);
});

test("more load is slower, a lot on climbs and a little on the flat", () => {
  const fit = fitnessOf("allenato");
  const fl = (kg) => tourMinutes(flat(101, 50), fit, kg).at(-1), up = (kg) => tourMinutes(climb(101, 10, 800), fit, kg).at(-1);
  assert.ok(fl(42) > fl(10) && fl(42) / fl(10) < 1.2, "flat: " + fl(10).toFixed(0) + " -> " + fl(42).toFixed(0));
  assert.ok(up(42) / up(10) > 1.3, "climb: " + up(10).toFixed(0) + " -> " + up(42).toFixed(0));
  const fast = tourMinutes(flat(101, 50), fitnessOf("sportivo"), 15).at(-1);
  assert.ok(fast < fl(15), "fitter is faster");
});

test("cutDays ends each day at the place nearest to the day's hours, towns preferred", () => {
  const cum = Array.from({ length: 101 }, (_, i) => i * 10);   // 1000 minutes, 10 per sample
  const places = [{ i: 28, name: "Borgo", rank: 1 }, { i: 31, name: "Città", rank: 2 }, { i: 62, name: "Villa", rank: 1 }, { i: 90, name: "Fuori", rank: 1 }];
  const cuts = cutDays(cum, 300, places);
  assert.deepEqual(cuts.map((c) => c.name), ["Città", "Villa", "Fuori"].slice(0, cuts.length));
  assert.equal(cuts[0].i, 31);
  assert.equal(cuts[1].i, 62);
});

test("no place near the target: the day ends at the target, unnamed", () => {
  const cum = Array.from({ length: 101 }, (_, i) => i * 10);
  const cuts = cutDays(cum, 400, []);
  assert.deepEqual(cuts, [{ i: 40, name: null }, { i: 80, name: null }]);
  assert.deepEqual(cutDays(cum, 900, []), [], "under 125% of a day: one day");
});

test("daySummary splits km, metres up and time", () => {
  const s = climb(101, 100, 1000), cum = Array.from({ length: 101 }, (_, i) => i * 6);
  const d = daySummary(s, cum, [{ i: 50, name: "Metà" }], "Casa", "Lago");
  assert.equal(d.length, 2);
  assert.deepEqual([d[0].from, d[0].to, d[1].from, d[1].to], ["Casa", "Metà", "Metà", "Lago"]);
  assert.equal(Math.round(d[0].km), 50); assert.equal(d[0].up, 500); assert.equal(d[1].min, 300);
});

test("placesOnSide keeps named places near the route; placesQuery thins the line", () => {
  const tr = Array.from({ length: 50 }, (_, i) => [45, 9 + i * 0.01]);
  const pl = placesOnSide(tr, [{ lat: 45.005, lon: 9.2, tags: { name: "Qui", place: "town" } }, { lat: 45.5, lon: 9.2, tags: { name: "Lontano", place: "village" } }, { lat: 45, lon: 9.1, tags: { place: "village" } }]);
  assert.deepEqual(pl, [{ i: 20, name: "Qui", rank: 2 }]);
  const q = placesQuery(Array.from({ length: 1000 }, (_, i) => [45, 9 + i * 0.001]));
  assert.match(q, /around:2000,45\.0000,9\.0000,/);
  assert.ok(q.split(",").length <= 2 * 122 + 2);
});
