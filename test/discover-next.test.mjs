// scripts/discover_next.mjs: the rotation picks never-run regions first, then the oldest.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickNext } from "../scripts/discover_next.mjs";

test("never-run regions first (catalogue order), then the oldest", () => {
  const regions = ["er", "liguria", "austria", "slovenia", "norway"];
  const last = { er: 300, liguria: 100, austria: 200, slovenia: 0 };
  assert.deepEqual(pickNext(regions, last, 2), ["slovenia", "norway"]);
  assert.deepEqual(pickNext(regions, { ...last, slovenia: 50, norway: 400 }, 2), ["slovenia", "liguria"]);
  assert.deepEqual(pickNext(regions, {}, 3), ["er", "liguria", "austria"]);
});
