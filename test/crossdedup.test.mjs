// Cross-pass dedup: which of two adjacent summits on the same road keeps the versanti (01/11/2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { weakerOf, misfit } from "../scripts/lib/crossdedup.mjs";

const pass = (name, elevation, tops) => ({ id: "osm-" + name, name, elevation, versanti: tops.map((t) => ({ endElevation: t })) });

test("the road pass beats a higher stray node snapped onto the same road (Col d'Izoard vs Col Perdu)", () => {
  const izoard = pass("Col d'Izoard", 2361, [2321, 2321]), perdu = pass("Col Perdu", 2490, [2321, 2321]);
  assert.equal(weakerOf(izoard, perdu), perdu);
  assert.equal(weakerOf(perdu, izoard), perdu, "order of the pair does not matter");
});
test("same for Iseran / Lessieres and Vrsic / Vratca (real numbers of the 01/11/2026 data)", () => {
  assert.equal(weakerOf(pass("Col de l'Iseran", 2764, [2653, 2650]), pass("Col des Lessieres", 2964, [2653])).name, "Col des Lessieres");
  assert.equal(weakerOf(pass("Prelaz Vršič", 1611, [1558]), pass("Vratca", 1800, [1558, 1550])).name, "Vratca");
});
test("two nodes that both fit the road: the old rule (higher, then more versanti) still decides", () => {
  const radici = pass("Passo delle Radici", 1529, [1529, 1527]), foce = pass("Foce di Terrarossa", 1505, [1505]);
  assert.equal(weakerOf(radici, foce), foce);
  const a = pass("A", 1000, [990, 995]), b = pass("B", 1000, [1000]);
  assert.equal(weakerOf(a, b), b, "equal height: fewer versanti is weaker");
});
test("unknown heights fall back to the old rule instead of throwing", () => {
  assert.equal(misfit({ elevation: 1200, versanti: [] }), Infinity);
  assert.equal(weakerOf(pass("X", 1200, []), pass("Y", 1300, [1290])).name, "X");
});
