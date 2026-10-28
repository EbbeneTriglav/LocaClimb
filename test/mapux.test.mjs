/*
 * mapux.js pure helpers: which side represents a pass, which passes are in view and
 * in what order (hardest first), line weight by category, and the profile sparkline.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const ctx = {}; vm.createContext(ctx);
vm.runInContext(await readFile(new URL("../js/mapux.js", import.meta.url), "utf8"), ctx);
const side = (cat, s, e) => ({ cat, startElevation: s, endElevation: e });

test("best side = highest category, then most gain", () => {
  const p = { versanti: [side("2", 500, 1100), side("1", 700, 1300), side("1", 400, 1300)] };
  const b = ctx.muxBestSide(p);
  assert.equal(b.cat, "1");
  assert.equal(b.startElevation, 400);
});

test("in view: only inside the box, hardest first, passes without sides skipped", () => {
  const box = { s: 43, n: 44, w: 12, e: 13 };
  const list = ctx.muxInView([
    { name: "facile", lat: 43.5, lon: 12.5, versanti: [side("4", 300, 450)] },
    { name: "fuori", lat: 45, lon: 12.5, versanti: [side("HC", 300, 1800)] },
    { name: "dura", lat: 43.6, lon: 12.6, versanti: [side("HC", 400, 1500)] },
    { name: "senza", lat: 43.7, lon: 12.7, versanti: [] },
    { name: "media", lat: 43.8, lon: 12.8, cat: "2", versanti: [side(null, 500, 1000)] }
  ], box);
  assert.deepEqual(Array.from(list, (x) => x.p.name), ["dura", "media", "facile"]);
  assert.equal(list[0].gain, 1100);
});

test("line weight grows with category and zoom", () => {
  assert.ok(ctx.muxWeight("HC", 10) > ctx.muxWeight("4", 10));
  assert.equal(ctx.muxWeight("2", 12), ctx.muxWeight("2", 10) + 1);
  assert.equal(ctx.muxWeight(null, 10), 3);
});

test("sparkline: closed area path spanning the full width, flat profile does not divide by zero", () => {
  const d = ctx.muxSpark([400, 500, 600, 700], 150, 34);
  assert.match(d, /^M0,34 L0\.0,/);
  assert.match(d, /L150\.0,2\.0 L150,34 Z$/);
  assert.doesNotMatch(ctx.muxSpark([500, 500, 500], 150, 34), /NaN|Infinity/);
  assert.equal(ctx.muxSpark([], 150, 34), "");
});
