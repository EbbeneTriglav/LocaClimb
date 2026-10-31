import { test } from "node:test";
import assert from "node:assert/strict";
import { implausibleSide, implausibleClimb } from "../scripts/lib/plausible.mjs";
import { implausible } from "../v2/lib/climb.mjs";

const cases = [
  [{ distance_km: 11.7, avgGradient: 10.6, maxGradient: 18.7 }, false],  // Mortirolo da Mazzo
  [{ distance_km: 7.5, avgGradient: 17.7, maxGradient: 25 }, false],     // Scanuppia: steep but real
  [{ distance_km: 10.1, avgGradient: 11.9, maxGradient: 22 }, false],    // Zoncolan da Ovaro
  [{ distance_km: 27.5, avgGradient: 4.4, maxGradient: 71.7 }, true],    // DEM spike (tunnel/bridge)
  [{ distance_km: 2.3, avgGradient: 31.7, maxGradient: 72.6 }, true],    // a path, not a road
  [{ distance_km: 1.2, avgGradient: 19, maxGradient: 26 }, false],       // short wall: allowed
  [{ distance_km: 2, avgGradient: 18, maxGradient: 24 }, true]
];
test("plausibility rule: real hard climbs pass, artefacts and paths are flagged", () => {
  for (const [v, want] of cases) assert.equal(implausibleSide(v), want, JSON.stringify(v));
  assert.equal(implausibleClimb({ versanti: [cases[0][0], cases[3][0]] }), true);
  assert.equal(implausibleClimb({ versanti: [] }), false);
});
test("v2 uses the same rule", () => {
  for (const [v] of cases) assert.equal(implausible(v), implausibleSide(v));
});
