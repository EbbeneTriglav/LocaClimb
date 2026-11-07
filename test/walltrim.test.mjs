import { test } from "node:test";
import assert from "node:assert/strict";
import { TRIM, trimParams, fwdGrade, trimValley } from "../scripts/lib/walltrim.mjs";

// a road sampled every 50 m: `flatKm` at 1% then a wall of `wallKm` at `wallPct`
function road(flatKm, wallKm, wallPct) {
  const cum = [], el = [];
  for (let d = 0; d <= flatKm + wallKm + 1e-9; d += 0.05) {
    cum.push(d);
    el.push(d <= flatKm ? 20 + d * 10 : 20 + flatKm * 10 + (d - flatKm) * wallPct * 10);
  }
  return { cum, el, end: cum.length - 1 };
}

test("walltrim: the default trim keeps its old parameters (Stelvio, Gavia, Radici unchanged)", () => {
  assert.deepEqual(TRIM.default, { floorPct: 4.0, win1: 0.6, win2: 1.4, keepKm: 3.0 });
  assert.equal(trimParams(true), TRIM.default);
  assert.equal(trimParams(false), TRIM.default);
  assert.equal(trimParams("short"), TRIM.short);
});

test("walltrim: a wall under 3 km is never trimmed by the default rule", () => {
  const r = road(1.2, 0.5, 6.6); // Taaienberg-like: flat approach + 0.5 km wall
  assert.equal(trimValley(r.cum, r.el, 0, r.end, TRIM.default), 0);
});

test("walltrim: short mode starts the wall where it really starts", () => {
  const r = road(1.2, 0.5, 6.6);
  const b = trimValley(r.cum, r.el, 0, r.end, TRIM.short);
  const km = r.cum[r.end] - r.cum[b], pct = (r.el[r.end] - r.el[b]) / (km * 10);
  assert.ok(Math.abs(km - 0.5) <= 0.1, `length ${km}`);
  assert.ok(pct >= 6, `avg ${pct}`);
});

test("walltrim: short mode keeps at least 0.3 km and leaves a wall that starts at once alone", () => {
  const flat = road(2, 0.1, 2); // no wall at all: the trim stops at the 0.3 km keep
  const b = trimValley(flat.cum, flat.el, 0, flat.end, TRIM.short);
  assert.ok(flat.cum[flat.end] - flat.cum[b] >= 0.3 - 1e-9);
  const steep = road(0, 0.4, 12); // Paterberg-like, steep from the first metre
  assert.equal(trimValley(steep.cum, steep.el, 0, steep.end, TRIM.short), 0);
});

test("walltrim: fwdGrade stops at the top", () => {
  const r = road(0, 0.4, 10);
  assert.ok(Math.abs(fwdGrade(r.cum, r.el, r.end, 0, 5) - 10) < 1e-6);
});
