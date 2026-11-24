// v2/lib/route.mjs: drag the Giro's line to add a via point between the right stops (24/11/2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { nearestIdx, stopIndexes, insertPos } from "../v2/lib/route.mjs";

// a straight track east, 0.01 deg per point (~0.8 km at 45 N)
const line = Array.from({ length: 11 }, (_, i) => [45, 9 + i * 0.01, 300]);

test("nearestIdx finds the closest point, from an index on", () => {
  assert.equal(nearestIdx(line, 45.001, 9.042), 4);
  assert.equal(nearestIdx(line, 45.001, 9.001, 5), 5);
});

test("stopIndexes: the first stop is the start, the last the end, the others in order", () => {
  const stops = [{ lat: 45, lon: 9 }, { lat: 45, lon: 9.03 }, { lat: 45, lon: 9.07 }, { lat: 45, lon: 9.1 }];
  assert.deepEqual(stopIndexes(line, stops), [0, 3, 7, 10]);
});

test("a loop: the last stop is the end even if it sits on the start", () => {
  const loop = line.concat(line.slice(0, 10).reverse());   // there and back
  const stops = [{ lat: 45, lon: 9 }, { lat: 45, lon: 9.1 }, { lat: 45, lon: 9 }];
  assert.deepEqual(stopIndexes(loop, stops), [0, 10, 20]);
});

test("out and back: a middle stop takes the way out, not the way back", () => {
  const ob = line.concat(line.slice(0, 10).reverse());
  const stops = [{ lat: 45, lon: 9 }, { lat: 45, lon: 9.05 }, { lat: 45, lon: 9.1 }, { lat: 45, lon: 9 }];
  assert.deepEqual(stopIndexes(ob, stops).slice(0, 3), [0, 5, 10]);
});

test("insertPos puts the via point between the stops around the pressed spot", () => {
  const idx = [0, 3, 7, 10];
  assert.equal(insertPos(idx, 1), 1);
  assert.equal(insertPos(idx, 3), 2);
  assert.equal(insertPos(idx, 5), 2);
  assert.equal(insertPos(idx, 9), 3);
  assert.equal(insertPos([0, 10], 4), 1, "two stops: always between them");
});
