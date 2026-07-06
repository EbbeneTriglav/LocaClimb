import { test, before } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./helpers/load-app.mjs";

let app;
before(async () => { app = await loadApp(); });

test("rideableWay() accepts a normal paved road", () => {
  assert.equal(app.rideableWay({ highway: "secondary" }), true);
  assert.equal(app.rideableWay({ highway: "unclassified" }), true);
});

test("rideableWay() rejects hiking-only / restricted way types", () => {
  assert.equal(app.rideableWay({ highway: "path" }), false);
  assert.equal(app.rideableWay({ highway: "footway" }), false);
  assert.equal(app.rideableWay({ highway: "motorway" }), false);
  assert.equal(app.rideableWay({ highway: "secondary", bicycle: "no" }), false);
  assert.equal(app.rideableWay({ highway: "secondary", access: "private" }), false);
  assert.equal(app.rideableWay({ highway: "secondary", motorroad: "yes" }), false);
  assert.equal(app.rideableWay({ highway: "secondary", "mtb:scale": "3" }), false);
  assert.equal(app.rideableWay(null), false);
  assert.equal(app.rideableWay({}), false);
});

test("classifyWay() mirrors rideableWay's exclusions but returns {hw,surface} or null", () => {
  // objects returned from the vm sandbox are a different realm (different Object.prototype),
  // so compare structurally via JSON rather than assert.deepEqual (which is deepStrictEqual here).
  assert.equal(JSON.stringify(app.classifyWay({ highway: "track", surface: "gravel" })), JSON.stringify({ hw: "track", surface: "gravel" }));
  assert.equal(app.classifyWay({ highway: "path" }), null);
  assert.equal(app.classifyWay({ highway: "secondary", bicycle: "dismount" }), null);
  assert.equal(app.classifyWay({ highway: "track", surface: "sand" }), null, "unrideable surface even on an otherwise-ok highway");
  assert.equal(app.classifyWay(null), null);
});

test("surfaceLabelFromWay() maps OSM surface/highway tags to a display label", () => {
  assert.match(app.surfaceLabelFromWay({ surface: "asphalt" }), /Asfalto/);
  assert.match(app.surfaceLabelFromWay({ surface: "gravel" }), /Sterrato/);
  assert.match(app.surfaceLabelFromWay({ highway: "track" }), /Sterrato/);
  assert.equal(app.surfaceLabelFromWay({ surface: "unknown-thing" }), "Fondo: unknown-thing");
  assert.equal(app.surfaceLabelFromWay({}), "");
  assert.equal(app.surfaceLabelFromWay(null), "");
});

test("versSameOrigin() matches versanti starting within ~0.02deg of each other", () => {
  assert.equal(app.versSameOrigin({ startLat: 46.5, startLon: 10.5 }, { startLat: 46.51, startLon: 10.5 }), true);
  assert.equal(app.versSameOrigin({ startLat: 46.5, startLon: 10.5 }, { startLat: 47.0, startLon: 10.5 }), false);
  assert.equal(app.versSameOrigin(null, { startLat: 46.5, startLon: 10.5 }), false);
});

test("mergeColocated() unions versanti of border passes within ~1km without duplicating shared sides", () => {
  const italianSide = { lat: 46.5, lon: 7.0, elevation: 2000, name: "Colle Test", versanti: [{ startLat: 46.4, startLon: 6.9 }] };
  const frenchSide = { lat: 46.5005, lon: 7.0005, elevation: 2100, versanti: [{ startLat: 45.9, startLon: 6.5 }] };
  const merged = app.mergeColocated([italianSide, frenchSide]);
  assert.equal(merged.length, 1, "co-located passes (<~1km) should merge into one entry");
  assert.equal(merged[0].versanti.length, 2, "both distinct versanti should be kept");
  assert.equal(merged[0].elevation, 2100, "keeps the higher of the two elevations");
  assert.equal(merged[0].name, "Colle Test", "keeps the name from whichever side has one");
});

test("mergeColocated() leaves distant passes separate", () => {
  const a = { lat: 46.5, lon: 7.0, versanti: [] };
  const b = { lat: 47.5, lon: 8.0, versanti: [] };
  assert.equal(app.mergeColocated([a, b]).length, 2);
});

test("mergeColocated() doesn't duplicate a re-listed identical versante on the same side", () => {
  const v = { startLat: 46.4, startLon: 6.9 };
  const a = { lat: 46.5, lon: 7.0, versanti: [v] };
  const b = { lat: 46.5005, lon: 7.0005, versanti: [{ startLat: 46.4001, startLon: 6.9001 }] };
  const merged = app.mergeColocated([a, b]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].versanti.length, 1, "near-identical origins on both sides count as the same versante");
});
