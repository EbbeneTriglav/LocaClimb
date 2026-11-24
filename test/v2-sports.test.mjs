// v2/lib/sports.mjs: the Giro for hiking, long walks, running and gravel (24/11/2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { SPORTS, sportOf, FOOT_PROFILES, FOOT_SETUPS, FOOT_FITNESS, footMinutes, paceLabel } from "../v2/lib/sports.mjs";
import { PROFILES } from "../v2/lib/route.mjs";

const side = (prof, km) => ({ elevationProfile: prof, distance_km: km });
const flat = (km) => side(Array(101).fill(500), km);
const up = (km, gain) => side(Array.from({ length: 101 }, (_, i) => 500 + gain * i / 100), km);

test("every sport has profiles; the road bike keeps the Giro's four; foot sports use the hiking profile", () => {
  assert.deepEqual(SPORTS.map((s) => s.k), ["bici", "gravel", "escursione", "cammino", "corsa"]);
  assert.deepEqual(sportOf("bici").profiles, PROFILES);
  for (const s of SPORTS.filter((x) => x.foot)) assert.ok(s.profiles.some(([p]) => FOOT_PROFILES.has(p)), s.k);
  assert.equal(sportOf("nope").k, "bici");
});

test("hiking follows the Swiss rule: 4 km/h on the flat, 400 m/h up", () => {
  assert.equal(Math.round(footMinutes(flat(8), "hike").at(-1)), 120);
  const t = footMinutes(up(4, 800), "hike").at(-1);        // 1 h horizontal, 2 h vertical -> 2 h + 0.5 h
  assert.ok(Math.abs(t - 150) < 3, String(t));
  assert.ok(footMinutes(flat(9), "walk").at(-1) < footMinutes(flat(9), "hike").at(-1), "a walk on roads is a bit faster");
});

test("running: 9.5 km/h on the flat, one minute per 10 m up", () => {
  assert.ok(Math.abs(footMinutes(flat(9.5), "run").at(-1) - 60) < 0.5);
  assert.ok(Math.abs(footMinutes(up(9.5, 300), "run").at(-1) - 90) < 0.5);
  assert.equal(footMinutes(flat(10), "run", 1, 16).at(-1), footMinutes(flat(10), "run", 1, 4).at(-1), "no backpack weight on runs");
});

test("fitness and backpack change the time", () => {
  const base = footMinutes(up(10, 600), "hike", 1, 4).at(-1);
  assert.ok(footMinutes(up(10, 600), "hike", 1.2, 4).at(-1) < base);
  assert.ok(footMinutes(up(10, 600), "hike", 1, 16).at(-1) > base * 1.1);
  assert.deepEqual(FOOT_SETUPS.map((s) => s.kg), [4, 9, 16]);
  assert.deepEqual(FOOT_FITNESS.map((f) => f.h), [4, 6, 8]);
});

test("paceLabel: km/h walking, min/km running", () => {
  assert.equal(paceLabel(12, 180, false), "4,0 km/h");
  assert.equal(paceLabel(10, 57, true), "5:42 /km");
  assert.equal(paceLabel(0, 10, true), "–");
});
