// v2/lib/profile.mjs - the light elevation axis and the cursor maths of the interactive profile.
import { test } from "node:test";
import assert from "node:assert/strict";
import { yTicks, kmAtX, pointAt, kmNear, profileLength } from "../v2/lib/profile.mjs";

// 10 km north, 1000 -> 1800 m: 5 km at 6%, 5 km at 10%
const V = {
  side: "Da Valle", distance_km: 10, startElevation: 1000, endElevation: 1800,
  elevationProfile: [1000, 1060, 1120, 1180, 1240, 1300, 1400, 1500, 1600, 1700, 1800],
  track: Array.from({ length: 11 }, (_, i) => [46 + i * 0.009, 10])
};

test("yTicks: start and finish always labelled, round values between, no two labels crowded", () => {
  const t = yTicks(1000, 1800, 1000, 1800, 220, 10);
  assert.equal(t[0].kind, "start"); assert.equal(t[0].e, 1000);
  assert.equal(t[t.length - 1].kind, "end"); assert.equal(t[t.length - 1].e, 1800);
  const mids = t.filter((x) => x.kind === "mid");
  assert.ok(mids.length >= 1 && mids.length <= 4, JSON.stringify(t));
  for (const m of mids) assert.equal(m.e % 100, 0);
  for (let i = 1; i < t.length; i++) assert.ok(Math.abs(t[i].y - t[i - 1].y) >= 18);
  // a loop ride: same start and finish -> one label marked both
  const loop = yTicks(400, 400, 380, 1600, 170, 8);
  assert.equal(loop.filter((x) => x.kind.includes("start")).length, 1);
  assert.deepEqual(yTicks(NaN, 1, 0, 1, 100, 5), []);
});

test("cursor: x -> km -> elevation, gradient and map position", () => {
  assert.equal(profileLength(V), 10);
  assert.equal(kmAtX(V, 318, 636), 5);
  assert.equal(kmAtX(V, -20, 636), 0);
  const a = pointAt(V, 2.5), b = pointAt(V, 7.5);
  assert.equal(a.ele, 1150); assert.ok(Math.abs(a.grade - 6) < 0.2);
  assert.equal(b.ele, 1550); assert.ok(Math.abs(b.grade - 10) < 0.2);
  assert.ok(Math.abs(a.lat - (46 + 0.0225)) < 1e-6); assert.equal(a.lon, 10);
  assert.equal(pointAt(V, 99).km, 10);
});

test("kmNear: a point next to the road maps back to its km", () => {
  assert.ok(Math.abs(kmNear(V, 46.0451, 10.0003) - 5) < 0.01);
  assert.equal(kmNear({ track: [[46, 10]] }, 46, 10), null);
});
