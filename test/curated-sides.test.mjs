/*
 * newSidesFor(): a curated pass adopts only the OSM twin's sides that come from a clearly
 * different direction (the Spluga-from-Splugen / Stelvio-from-Umbrail case), never a near
 * copy of a side it already has.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./helpers/load-app.mjs";

const app = await loadApp();
const tr = (a, b) => [a, b];
// summit at 46.5, 9.33 (Spluga-like)
const cur = { lat: 46.5, lon: 9.33, versanti: [
  { side: "Da Chiavenna", startLat: 46.32, startLon: 9.40, track: tr([46.32, 9.40], [46.5, 9.33]) },
  { side: "Da Campodolcino", startLat: 46.40, startLon: 9.35, track: tr([46.40, 9.35], [46.5, 9.33]) }
] };

test("adopts a side from the opposite direction, skips a near copy and a trackless one", () => {
  const twin = { versanti: [
    { side: "Da Splugen", startLat: 46.55, startLon: 9.32, track: tr([46.55, 9.32], [46.5, 9.33]) },
    { side: "Da Campodolcino (OSM)", startLat: 46.405, startLon: 9.352, track: tr([46.405, 9.352], [46.5, 9.33]) },
    { side: "Da Est senza traccia", startLat: 46.5, startLon: 9.45 }
  ] };
  const add = app.newSidesFor(cur, twin);
  assert.deepEqual(Array.from(add, (v) => v.side), ["Da Splugen"]);
});

test("a side in the same direction but farther away is still a duplicate (bearing < 60 deg)", () => {
  const twin = { versanti: [{ side: "Da Gordona", startLat: 46.28, startLon: 9.41, track: tr([46.28, 9.41], [46.5, 9.33]) }] };
  assert.equal(app.newSidesFor(cur, twin).length, 0);
});

test("adds nothing when a curated side has no coordinates (cannot compare)", () => {
  const bad = { lat: 46.5, lon: 9.33, versanti: [{ side: "?", track: [] }] };
  const twin = { versanti: [{ side: "Da Splugen", startLat: 46.55, startLon: 9.32, track: tr([46.55, 9.32], [46.5, 9.33]) }] };
  assert.equal(app.newSidesFor(bad, twin).length, 0);
});

test("two new sides from different directions are both adopted, not each other's duplicate", () => {
  const twin = { versanti: [
    { side: "Nord", startLat: 46.56, startLon: 9.33, track: tr([46.56, 9.33], [46.5, 9.33]) },
    { side: "Ovest", startLat: 46.5, startLon: 9.22, track: tr([46.5, 9.22], [46.5, 9.33]) }
  ] };
  assert.deepEqual(Array.from(app.newSidesFor(cur, twin), (v) => v.side), ["Nord", "Ovest"]);
});
