// js/discoverview.js: review order and counters (pure helpers, no DOM).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = {};
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL("../js/discoverview.js", import.meta.url), "utf8"), ctx);
const climb = (id, gain) => ({ id, versanti: [{ startElevation: 100, endElevation: 100 + gain }] });

test("dvOrder: undecided first, hardest first", () => {
  const list = [climb("a", 200), climb("b", 600), climb("c", 400)];
  assert.deepEqual(Array.from(ctx.dvOrder(list, { b: 1 })).map((p) => p.id), ["c", "a", "b"]);
});

test("dvCounts", () => {
  const list = [climb("a", 1), climb("b", 1), climb("c", 1)];
  assert.deepEqual({ ...ctx.dvCounts(list, { a: 1, b: 0 }) }, { ok: 1, no: 1, todo: 1 });
});

test("inactive without ?discover=", () => {
  assert.equal(typeof ctx.dvParam, "function");
});
