// js/discoverview.js: groups, random sample order and counters (pure helpers, no DOM).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = {};
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL("../js/discoverview.js", import.meta.url), "utf8"), ctx);
const climb = (id, gain, extra) => ({ id, versanti: [{ startElevation: 100, endElevation: 100 + gain }], ...(extra || {}) });

test("dvGroup: doppione, sterrata, piccola, nuova", () => {
  assert.equal(ctx.dvGroup(climb("a", 500), 0.9), "doppione");
  assert.equal(ctx.dvGroup(climb("b", 500, { surfaceLabel: "Sterrato/gravel" }), 0.1), "sterrata");
  assert.equal(ctx.dvGroup(climb("c", 150), 0.1), "piccola");
  assert.equal(ctx.dvGroup(climb("d", 500), 0.5), "nuova");
});

test("dvOverlap: a track on a published road is 1, elsewhere 0", () => {
  const road = Array.from({ length: 40 }, (_, i) => [44 + i * 0.0005, 11]);
  const grid = ctx.dvGrid([{ versanti: [{ track: road }] }]);
  assert.equal(ctx.dvOverlap(road, grid), 1);
  assert.equal(ctx.dvOverlap(road.map((t) => [t[0], 11.05]), grid), 0);
});

test("dvOrder: undecided first, nuove before the other groups, stable random order", () => {
  const list = [climb("a", 300), climb("b", 300), climb("c", 300), climb("d", 300)];
  const grp = { a: "doppione", b: "nuova", c: "nuova", d: "piccola" };
  const o1 = Array.from(ctx.dvOrder(list, { c: 1 }, grp)).map((p) => p.id);
  assert.deepEqual(o1, ["b", "d", "a", "c"]);
  const o2 = Array.from(ctx.dvOrder(list.slice().reverse(), { c: 1 }, grp)).map((p) => p.id);
  assert.deepEqual(o2, o1);
});

test("dvCounts: groups and sample progress", () => {
  const list = [climb("a", 1), climb("b", 1), climb("c", 1)];
  const c = ctx.dvCounts(list, { a: 1, b: 0 }, { a: "nuova", b: "doppione", c: "nuova" });
  assert.equal(c.ok, 1); assert.equal(c.no, 1); assert.equal(c.todo, 1); assert.equal(c.sample, 1);
  assert.deepEqual({ ...c.groups }, { nuova: 2, doppione: 1 });
});
