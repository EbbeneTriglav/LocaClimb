import { test } from "node:test";
import assert from "node:assert/strict";
import { hwKeep, HW_BASE, HW_LOCAL } from "../scripts/lib/highways.mjs";

test("full Italy refresh keeps the July road classes (no residential)", () => {
  assert.deepEqual(hwKeep({ fullRefresh: true }), HW_BASE);
  for (const h of HW_LOCAL) assert.ok(!hwKeep({ fullRefresh: true }).includes(h));
});
test("per-country and discover builds keep residential streets", () => {
  assert.deepEqual(hwKeep({ fullRefresh: false }), HW_BASE.concat(HW_LOCAL));
});
test("LC_HW_LOCAL forces the choice", () => {
  assert.deepEqual(hwKeep({ fullRefresh: true, env: { LC_HW_LOCAL: "1" } }), HW_BASE.concat(HW_LOCAL));
  assert.deepEqual(hwKeep({ fullRefresh: false, env: { LC_HW_LOCAL: "0" } }), HW_BASE);
});
test("trunk stays in: the SS38 to the Stelvio is trunk in places", () => {
  assert.ok(hwKeep({ fullRefresh: true }).includes("trunk"));
});
