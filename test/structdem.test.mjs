import { test } from "node:test";
import assert from "node:assert/strict";
import { fillStruct } from "../scripts/lib/structdem.mjs";

const line = (n) => Array.from({ length: n }, (_, i) => [46 + i * 0.001, 10]); // ~111 m steps
test("tunnel vertices take the line between the portals (mountain above ignored)", () => {
  const pts = line(5), ev = [1000, 1050, 1400, 1450, 1100];               // 2 and 3 inside: DEM reads the mountain
  const st = new Set([2, 3]);
  const out = fillStruct(pts, ev, (p) => st.has(pts.indexOf(p)));
  assert.equal(out[0], 1000); assert.equal(out[1], 1050); assert.equal(out[4], 1100);
  assert.ok(Math.abs(out[2] - 1066.67) < 0.5 && Math.abs(out[3] - 1083.33) < 0.5, out.join(","));
});
test("a bridge over a valley: no dip", () => {
  const pts = line(3), out = fillStruct(pts, [800, 650, 810], (p) => p === pts[1]);
  assert.ok(Math.abs(out[1] - 805) < 0.5);
});
test("a run touching the ends copies the nearest outside height; nothing flagged = unchanged", () => {
  const pts = line(4);
  assert.deepEqual(fillStruct(pts, [5, 9, 10, 11], (p) => p === pts[0] || p === pts[1]), [10, 10, 10, 11]);
  assert.deepEqual(fillStruct(pts, [5, 9, 10, 11], () => false), [5, 9, 10, 11]);
});
