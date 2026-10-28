// Pure helpers of js/panelplus.js: hairpin count, W/kg -> VAM, climbing time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = {};
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL("../js/panelplus.js", import.meta.url), "utf8"), ctx);
const { ppHairpins, ppVam, ppMinutes, ppClock } = ctx;

test("ppHairpins counts switchbacks, not straight roads", () => {
  const zig = [];
  let lat = 46, lon = 10;
  for (let i = 0; i < 7; i++) { zig.push([lat, lon]); lon += (i % 2 ? -1 : 1) * 0.004; lat += 0.0004; }
  assert.equal(ppHairpins(zig), 5);
  const straight = Array.from({ length: 50 }, (_, i) => [46 + i * 0.001, 10]);
  assert.equal(ppHairpins(straight), 0);
  assert.equal(ppHairpins(null), 0);
});

test("ppVam follows Ferrari: W/kg x (200 + 10 x gradient%)", () => {
  assert.equal(ppVam(4, 8), 1120);
  assert.equal(ppVam(3, -2), 600);
});

test("ppMinutes: 10 km at 8.4% takes gain / VAM at 4 W/kg", () => {
  const prof = Array.from({ length: 101 }, (_, i) => 1000 + i * 8.4);
  const min = ppMinutes(prof, 10, ppVam(4, 8.4));
  assert.ok(Math.abs(min - 840 / ppVam(4, 8.4) * 60) < 1, String(min));
  assert.equal(ppMinutes([], 10, 1000), null);
});

test("ppClock formats minutes", () => {
  assert.equal(ppClock(44.4), "44'");
  assert.equal(ppClock(88), "1h28");
  assert.equal(ppClock(null), "-");
});
