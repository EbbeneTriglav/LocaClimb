/*
 * Pure-logic coverage for js/editor.js - the in-app climb editor had zero automated tests.
 * Covered here (no live map needed, so the vm harness works): the geometry helpers
 * (edBestInsert, edDown/edDownPts), the admin gate (isAdmin), and edCommitStore's
 * edit-existing path (which builds the manual-override entry without touching the DOM).
 * The draw/snap/elevation flow (edCalc, edClick, snapRoute, ghSave/vpsSave) needs Leaflet +
 * network + real inputs and stays in the manual browser smoke (docs/browser-smoke.md).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./helpers/load-app.mjs";

const app = await loadApp();

test("edBestInsert places a point at the least-detour segment, extends past an end", () => {
  app.ED.track = [{ lat: 45, lon: 10 }, { lat: 45, lon: 11 }];
  assert.equal(app.edBestInsert({ lat: 45.001, lon: 10.5 }), 1, "near the middle -> insert internally");
  assert.equal(app.edBestInsert({ lat: 45, lon: 9 }), 0, "far before the start -> prepend");
  assert.equal(app.edBestInsert({ lat: 45, lon: 12 }), 2, "far past the end -> append");

  app.ED.track = [{ lat: 45, lon: 10 }];
  assert.equal(app.edBestInsert({ lat: 45, lon: 11 }), 1, "fewer than 2 points -> append at end");
});

test("edDown / edDownPts downsample to n points keeping both endpoints", () => {
  const pts = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (const fn of [app.edDown, app.edDownPts]) {
    const out = fn(pts, 4);
    assert.equal(out.length, 4);
    assert.equal(out[0], 0, "first point kept");
    assert.equal(out[out.length - 1], 9, "last point kept");
  }
  assert.equal(app.edDown(pts, 20), pts, "n >= length -> returned unchanged");
});

test("isAdmin reads the admin gate from location hash/search", () => {
  app.location.hash = "";
  app.location.search = "";
  assert.equal(app.isAdmin(), false);
  app.location.hash = "#admin";
  assert.equal(app.isAdmin(), true, "#admin in hash");
  app.location.hash = "";
  app.location.search = "?admin";
  assert.equal(app.isAdmin(), true, "admin in query string");
  app.location.search = "";
});

test("edCommitStore builds a manual-override entry for an existing pass", () => {
  app.ED.isNew = false;
  app.ED.pass = { id: "stelvio" };
  app.ED.store = {};
  app.ED.versanti = [
    { side: "Prato", distance_km: 22, startElevation: 900, endElevation: 2758, cat: "1" },
    { side: "Bormio", distance_km: 21, startElevation: 1230, endElevation: 2758, cat: "HC" }
  ];

  assert.equal(app.edCommitStore(), true);
  const entry = app.ED.store.stelvio;
  assert.ok(entry, "entry keyed by pass id");
  assert.equal(entry.versanti.length, 2);
  assert.equal(entry.manual, true);
  assert.equal(entry.cat, "HC", "hardest versante category wins");
  assert.ok(entry.difficulty >= 1 && entry.difficulty <= 10, "difficulty in range");
  assert.match(entry.updatedAt, /^\d{4}-\d{2}-\d{2}$/, "updatedAt is an ISO date");
  assert.equal(app.window.MANUAL_OV, app.ED.store, "commit publishes the store as MANUAL_OV");
});

test("edCommitStore refuses to commit with no versanti (DOM-guarded, no throw)", () => {
  app.ED.isNew = false;
  app.ED.pass = { id: "x" };
  app.ED.versanti = [];
  assert.equal(app.edCommitStore(), false);
});
