/*
 * Pure-logic coverage for js/routebuilder.js - the route-builder had zero automated tests,
 * but much of it is array/string logic with no live Leaflet map, so it runs in the same vm
 * harness (load-app.mjs) as the other pure-function suites. The map-drawing / DOM-mutating
 * functions (calcRoute, updateRBList, drawSurfaceOverlay, ...) are NOT covered here - they
 * stay in the manual browser smoke (docs/browser-smoke.md).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./helpers/load-app.mjs";

const app = await loadApp();

test("trackDist sums haversine distance (km) over a polyline", () => {
  // ~1 deg of latitude ~= 111 km; two hops of ~0.09 deg each
  const t = [[45.0, 10.0], [45.09, 10.0], [45.18, 10.0]];
  const d = app.trackDist(t);
  assert.ok(d > 19 && d < 21, `expected ~20 km, got ${d}`);
  assert.equal(app.trackDist([[45, 10]]), 0, "single point = 0");
});

test("trackAscent sums only positive elevation gain, ignoring nulls", () => {
  const t = [[0, 0, 100], [0, 0, 150], [0, 0, 120], [0, 0, null], [0, 0, 200]];
  // +50 (100->150), then 150->120 is a descent (ignored), 120->null ignored,
  // null->200 ignored (prev is null). Total gain = 50.
  assert.equal(app.trackAscent(t), 50);
  assert.equal(app.trackAscent([[0, 0, 100], [0, 0, 100]]), 0, "flat = 0");
});

test("interp forward- and back-fills null elevations in place", () => {
  const t = [[0, 0, null], [0, 0, 100], [0, 0, null], [0, 0, 200], [0, 0, null]];
  app.interp(t);
  assert.deepEqual(t.map((p) => p[2]), [100, 100, 100, 200, 200],
    "leading null back-filled, middle forward-filled, trailing forward-filled");
});

test("surfCat buckets BRouter way-tag strings into surface categories", () => {
  assert.equal(app.surfCat("surface=asphalt highway=primary"), "asfalto");
  assert.equal(app.surfCat("surface=paving_stones"), "asfalto");
  assert.equal(app.surfCat("surface=gravel"), "sterrato");
  assert.equal(app.surfCat("highway=track"), "sterrato");
  assert.equal(app.surfCat("surface=ground"), "fondo naturale");
  assert.equal(app.surfCat("highway=path"), "fondo naturale");
  assert.equal(app.surfCat("surface=cobblestone"), "altro", "known-but-unmapped surface");
  assert.equal(app.surfCat(""), "asfalto", "no tags -> assume asphalt");
});

test("surfaceFromMessages accumulates distance per surface category", () => {
  const msgs = [
    ["Distance", "WayTags"],
    ["100", "surface=asphalt"],
    ["50", "surface=gravel"],
    ["30", "surface=asphalt"]
  ];
  const r = app.surfaceFromMessages(msgs);
  assert.equal(r.total, 180);
  assert.equal(r.acc.asfalto, 130);
  assert.equal(r.acc.sterrato, 50);
  assert.equal(app.surfaceFromMessages(null), null, "no messages -> null");
  assert.equal(app.surfaceFromMessages([["Distance", "NoTagsColumn"]]), null, "no WayTags column -> null");
});

test("generateGPX emits valid GPX with one trkpt per track point and escaped names", () => {
  app.rbStops = [
    { name: "Passo A & <b>", lat: 45.1, lon: 10.1, elevation: 1200 },
    { name: "Passo B", lat: 45.2, lon: 10.2 }
  ];
  app.rbTrack = [[45.1, 10.1, 1200], [45.15, 10.15, 1250], [45.2, 10.2, null]];
  const g = app.generateGPX();

  assert.match(g, /^<\?xml/, "xml prolog");
  assert.equal((g.match(/<trkpt /g) || []).length, 3, "one trkpt per track point");
  assert.equal((g.match(/<wpt /g) || []).length, 2, "one wpt per stop");
  assert.ok(g.includes("<ele>1250</ele>"), "elevation rounded into trkpt");
  // regression guard: names are escaped (matches exportGPX in panel.js)
  assert.ok(g.includes("Passo A &amp; &lt;b&gt;"), "waypoint name escaped");
  assert.ok(!/<name>[^<]*<b>/.test(g), "no raw markup leaked into a name");
});
