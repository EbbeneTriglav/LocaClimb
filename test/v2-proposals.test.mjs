// v2/lib/proposals.mjs: approved rider proposals drawn live (23/11/2026: Piani di Bobbio was approved and never shown).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { toClimb, mergeClimbs, approvedClimbs, nameMatch, evenProfile, maxGradientOf } from "../v2/lib/proposals.mjs";

// a straight track north, 0.9 km per 0.0081 deg, +100 m per point
const flat = (n, lat0 = 45.9, lon = 9.49, e0 = 800, de = 100) => Array.from({ length: n }, (_, i) => [lat0 + i * 0.0081, lon, e0 + i * de]).flat();
const doc = (o) => ({ id: "1C9JidYdW5ptUuOQuXbS", name: "Piani di Bobbio", side: "Valtorta", lat: 45.9623, lon: 9.49481, elevation: 1681,
  startLat: 45.9, startLon: 9.49, startElevation: 800, endElevation: 1681, km: 8.99, avgGradient: 9.8, status: "approved", flat: flat(9), ...o });

test("an approved document becomes a climb with one side, its track and an even profile", () => {
  const c = toClimb(doc({}), "abc");
  assert.equal(c.id, "usr-abc"); assert.equal(c.name, "Piani di Bobbio"); assert.equal(c.userSubmitted, true);
  const v = c.versanti[0];
  assert.equal(v.side, "Valtorta"); assert.equal(v.distance_km, 8.99); assert.equal(v.track.length, 9);
  assert.equal(v.elevationProfile.length, 100);
  assert.equal(v.elevationProfile[0], 800); assert.equal(v.elevationProfile[99], 1600);
  assert.equal(v.exposure, "Sud", "a road going north faces south");
  assert.ok(v.maxGradient >= 10 && v.maxGradient <= 12, "100 m per 0.9 km = 11%: " + v.maxGradient);
});

test("stored maxGradient and exposure win over the recomputed ones", () => {
  const v = toClimb(doc({ maxGradient: 17, exposure: "Ovest" }), "a").versanti[0];
  assert.equal(v.maxGradient, 17); assert.equal(v.exposure, "Ovest");
});

test("two sides of the same mountain are merged (summit within 2 km, a shared name word)", () => {
  assert.ok(nameMatch("Monte Nerone", "Nerone da Piobbico"));
  assert.ok(!nameMatch("Baiso", "San Valentino"));
  const a = toClimb(doc({ name: "Monte Nerone", lat: 43.55685, lon: 12.51584, elevation: 1461 }), "n1");
  const b = toClimb(doc({ name: "Monte Nerone sud", lat: 43.55737, lon: 12.51795, elevation: 1504, side: "da Serbatoio" }), "n2");
  const c = toClimb(doc({ name: "Monte Nerone", lat: 44.5, lon: 10.6 }), "far");
  const m = mergeClimbs([a, b, c]);
  assert.equal(m.length, 2);
  assert.equal(m[0].versanti.length, 2); assert.equal(m[0].name, "Monte Nerone"); assert.equal(m[0].elevation, 1504);
  assert.equal(a.versanti.length, 1, "the input is not changed");
});

test("approvedClimbs skips broken documents instead of failing", () => {
  const list = approvedClimbs([doc({}), { id: "bad", name: "x" }, doc({ id: "nolat", lat: "?" })]);
  assert.equal(list.length, 1); assert.equal(list[0].id, "usr-1C9JidYdW5ptUuOQuXbS");
});

test("evenProfile and maxGradientOf handle short tracks", () => {
  assert.deepEqual(evenProfile([[45, 9, 100]]), []);
  assert.equal(maxGradientOf([[45, 9, 100], [45.0001, 9, 101]]), 0);
});

test("the app draws them: approvedProposals -> approvedClimbs -> addLive", async () => {
  const app = await readFile(new URL("../v2/app.mjs", import.meta.url), "utf8");
  assert.match(app, /approvedProposals\(\)\.then\(\(docs\) => \{\s*if \(!addLive\(approvedClimbs\(docs\)\)\) return;/);
});
