import { test } from "node:test";
import assert from "node:assert/strict";
import { climbFloor } from "../scripts/lib/climbfloor.mjs";
import { validateClimbsExtra } from "../scripts/validate_data.mjs";

test("curated climbs keep the 1.2 km / 140 m floor (Stelvio & co. never change)", () => {
  assert.deepEqual(climbFloor(true, false, 1.5, 125), { distKm: 1.2, gainM: 140, avgPct: 2 });
  assert.deepEqual(climbFloor(true, true, 1.5, 125), { distKm: 1.2, gainM: 140, avgPct: 2 });
});

test("OSM passes: global floor, lower only in the Belgium / Netherlands files", () => {
  assert.deepEqual(climbFloor(false, false, 1.5, 125), { distKm: 1.5, gainM: 125, avgPct: 2.5 });
  assert.deepEqual(climbFloor(false, true, 1.5, 125), { distKm: 0.3, gainM: 50, avgPct: 2.5 });
});

test("extras flagged short accept the walls of the classics (Paterberg ~0.4 km / 50 m)", () => {
  const f = climbFloor("short", false, 1.5, 125);
  const paterberg = { km: 0.4, gain: 48 };
  assert.ok(paterberg.km >= f.distKm && paterberg.gain >= f.gainM && (paterberg.gain / (paterberg.km * 10)) >= f.avgPct);
  const bump = { km: 0.25, gain: 12 }; // a road hump is still not a climb
  assert.ok(bump.km < f.distKm || bump.gain < f.gainM);
});

test("climbs_extra: short must be a boolean", () => {
  const ok = [{ id: "paterberg", name: "Paterberg", lat: 50.78, lon: 3.6, short: true }];
  assert.deepEqual(validateClimbsExtra(ok), []);
  const bad = [{ id: "x", name: "X", lat: 50, lon: 3, short: "yes" }];
  assert.equal(validateClimbsExtra(bad).length, 1);
});
