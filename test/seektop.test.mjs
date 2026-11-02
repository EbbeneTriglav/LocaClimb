import { test } from "node:test";
import assert from "node:assert/strict";
import { reachable, pickTop } from "../scripts/lib/seektop.mjs";

// a straight street of 6 vertices ~100 m apart, plus a side road; "lat,lon" keys
const V = ["50.000000,3.000000", "50.000900,3.000000", "50.001800,3.000000", "50.002700,3.000000", "50.003600,3.000000", "50.004500,3.000000"];
const side = "50.001800,3.001400";
const edges = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]].map(([a, b]) => [V[a], V[b], 0.1]).concat([[V[2], side, 0.1]]);
const neighbors = (k) => edges.flatMap(([a, b, s]) => (a === k ? [{ key: b, seg: s }] : b === k ? [{ key: a, seg: s }] : []));

test("reachable walks the road graph within the distance bound", () => {
  const n = reachable(V[2], neighbors, 0.25);
  assert.deepEqual(n.map((x) => x.key).sort(), [V[0], V[1], V[2], V[3], V[4], side].sort());
  assert.equal(n.find((x) => x.key === V[2]).d, 0);
  assert.ok(!n.some((x) => x.key === V[5])); // 0.3 km away: out of range
});

test("pickTop climbs from the street midpoint to its top", () => {
  const n = reachable(V[2], neighbors, 0.8);
  const ele = n.map((x) => ({ [V[0]]: 20, [V[1]]: 35, [V[2]]: 50, [V[3]]: 62, [V[4]]: 70, [V[5]]: 71, [side]: 48 })[x.key]);
  const t = pickTop(n, ele);
  assert.equal(t.key, V[4]); // 71 m is within the 2 m DEM tolerance of 70 m: the nearer top wins
  assert.equal(t.ele, 70);
});

test("pickTop ignores missing elevations and returns null when there are none", () => {
  const n = reachable(V[0], neighbors, 0.15);
  assert.equal(pickTop(n, n.map(() => null)), null);
  assert.equal(pickTop(n, [10, NaN]).key, V[0]);
});
