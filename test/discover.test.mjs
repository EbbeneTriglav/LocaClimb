// scripts/lib/discover.mjs: road-graph tops for climbs that have no pass node.
import { test } from "node:test";
import assert from "node:assert/strict";
import { findRoadTops, roadProminence, dominates, dropKnown, nameTop, southOfLine, inRegion, csr, DISCOVER_REGIONS, flatCutBase } from "../scripts/lib/discover.mjs";

// a straight road of n vertices, 100 m apart, heading north from 44.0,11.0, with given elevations
function road(eles, extraEdges) {
  const n = eles.length, lat = new Float64Array(n), lon = new Float64Array(n).fill(11), ele = Float32Array.from(eles);
  for (let i = 0; i < n; i++) lat[i] = 44 + i * 0.0009;
  const edges = [];
  for (let i = 1; i < n; i++) edges.push([i - 1, i, 0.1]);
  for (const e of (extraEdges || [])) edges.push(e);
  return csr(n, lat, lon, ele, edges);
}
const O = { minEle: 150, prom: 120, domKm: 1.0, minSepKm: 1.5, maxNodes: 10000 };

test("a dead-end road climbing 400 m gives one top at the end", () => {
  const eles = Array.from({ length: 50 }, (_, i) => 200 + i * 8);   // 200 -> 592 m, 5 km
  const tops = findRoadTops(road(eles), O);
  assert.equal(tops.length, 1);
  assert.equal(tops[0].v, 49);
  assert.equal(tops[0].prom, 392);
});

test("a pass between two valleys is a top; a 30 m hump on the climb is not", () => {
  const up = Array.from({ length: 40 }, (_, i) => 300 + i * 10);       // 300 -> 690
  up[15] = 470; up[16] = 440;                                           // hump of 30 m at km 1.5
  const down = Array.from({ length: 40 }, (_, i) => 690 - (i + 1) * 9);  // 681 -> 330
  const tops = findRoadTops(road(up.concat(down)), O);
  assert.deepEqual(tops.map((t) => t.v), [39]);
});

test("road prominence stops at higher ground: a shoulder below a higher summit is rejected", () => {
  // 300 -> 600 (shoulder) -> dip to 560 -> 900 summit
  const a = Array.from({ length: 31 }, (_, i) => 300 + i * 10);
  const b = [590, 575, 560, 570, 590];
  const c = Array.from({ length: 31 }, (_, i) => 600 + i * 10);
  const g = road(a.concat(b, c));
  const shoulder = 30;
  assert.equal(roadProminence(g, shoulder, 10000).higher, true);
  assert.ok(roadProminence(g, shoulder, 10000).prom < 120);
  const tops = findRoadTops(g, O);
  assert.deepEqual(tops.map((t) => t.ele), [900]);
});

test("a tunnel (NaN elevations) is neither a summit nor a valley", () => {
  const eles = Array.from({ length: 40 }, (_, i) => 200 + i * 10);   // 200 -> 590
  for (let i = 20; i < 25; i++) eles[i] = NaN;                       // tunnel mid-climb
  const tops = findRoadTops(road(eles), O);
  assert.deepEqual(tops.map((t) => t.v), [39]);
});

test("dominance: a vertex with a higher one 600 m away is not a top", () => {
  const eles = [200, 300, 400, 500, 450, 480, 520, 300];
  const g = road(eles);
  assert.equal(dominates(g, 3, 1.0), false);
  assert.equal(dominates(g, 6, 1.0), true);
});

test("tops below minEle or north of the mask line are dropped", () => {
  const eles = Array.from({ length: 30 }, (_, i) => 10 + i * 5);     // top 155 m
  assert.equal(findRoadTops(road(eles), { ...O, minEle: 200, prom: 50 }).length, 0);
  const er = DISCOVER_REGIONS.er;
  assert.equal(southOfLine(er.southOf, 44.40, 11.34, 0), true);       // Bologna hills
  assert.equal(southOfLine(er.southOf, 44.60, 11.34, 0), false);      // plain north of Bologna
});

test("dropKnown removes tops close to a known summit", () => {
  const tops = [{ lat: 44.1, lon: 11.0 }, { lat: 44.3, lon: 11.0 }];
  assert.deepEqual(dropKnown(tops, [{ lat: 44.105, lon: 11.0 }], 1.5), [{ lat: 44.3, lon: 11.0 }]);
});

test("nameTop: peak, then place, then road, then nearest town", () => {
  const t = { lat: 44.0, lon: 11.0 };
  assert.equal(nameTop(t, [{ lat: 44.002, lon: 11.0, name: "Monte Bello" }], [], null, null), "Monte Bello");
  assert.equal(nameTop(t, [], [{ lat: 44.005, lon: 11.0, name: "Montepiano" }], null, null), "Montepiano");
  assert.equal(nameTop(t, [], [], "Via di San Luca", "Bologna"), "Via di San Luca");
  assert.equal(nameTop(t, [], [], "SP 24", "Loiano"), "Salita presso Loiano");
});

test("every region is well formed and the masks work both ways", () => {
  for (const [k, r] of Object.entries(DISCOVER_REGIONS)) {
    const b = r.bbox.split(",").map(Number);
    assert.equal(b.length, 4, k);
    assert.ok(b[0] < b[2] && b[1] < b[3], k + " bbox");
    assert.ok(r.pbf.length >= 1 && r.prom > 0 && r.minEle > 0, k);
    assert.match(k, /^[a-z-]+$/, k + ": the name is used in file names");
  }
  const north = { northOf: [[10, 45.5], [12, 45.5]] };
  assert.equal(inRegion(north, 45.8, 11, 0), true);
  assert.equal(inRegion(north, 45.2, 11, 0), false);
  assert.equal(inRegion({}, 40, 10, 0), true);
});

test("valley approach is cut: 12 km at 1.5% then 4 km at 10% -> base at the foot of the ramp", () => {
  const cum = [], el = [];
  for (let k = 0; k <= 160; k++) { const km = k * 0.1; cum.push(km); el.push(km <= 12 ? 350 + km * 15 : 530 + (km - 12) * 100); }
  const b = flatCutBase(cum, el, 0, cum.length - 1, 2.0, 2.5);
  assert.ok(Math.abs(cum[b] - 12) < 0.25, "base at km " + cum[b]);
});

test("a steady climb is not cut", () => {
  const cum = [], el = [];
  for (let k = 0; k <= 100; k++) { cum.push(k * 0.1); el.push(500 + k * 7); }       // 7%
  assert.equal(flatCutBase(cum, el, 0, cum.length - 1, 2.0, 2.5), 0);
  // a short 1 km false flat in the middle is not a valley either
  const el2 = el.map((e, k) => (k > 40 && k <= 50 ? el[40] + (k - 40) * 1 : k > 50 ? e - 60 : e));
  assert.equal(flatCutBase(cum, el2, 0, cum.length - 1, 2.0, 2.5), 0);
});

test("a long false flat in the middle of a real climb does not cut the climb below it", () => {
  // 5 km at 7%, then 2.5 km at 1%, then 5 km at 7% (Monesi di Triora shape)
  const cum = [], el = [];
  for (let k = 0; k <= 125; k++) {
    const km = k * 0.1; cum.push(km);
    el.push(400 + (km <= 5 ? km * 70 : km <= 7.5 ? 350 + (km - 5) * 10 : 375 + (km - 7.5) * 70));
  }
  assert.equal(flatCutBase(cum, el, 0, cum.length - 1, 2.0, 2.5), 0);
});

test("a short flat start (under flatKm) is kept", () => {
  const cum = [], el = [];
  for (let k = 0; k <= 80; k++) { const km = k * 0.1; cum.push(km); el.push(300 + (km <= 1.5 ? km * 10 : 15 + (km - 1.5) * 60)); }
  assert.equal(flatCutBase(cum, el, 0, cum.length - 1, 2.0, 2.5), 0);
});
