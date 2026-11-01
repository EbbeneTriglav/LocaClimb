// Sun and shade: the pipeline helpers (scripts/lib/shade.mjs) and the reading in v2 (v2/lib/shade.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { passList, insideArea, mergeShade } from "../scripts/lib/shade.mjs";
import { unpack, shadeFor, shadeWord, shadeCauses } from "../v2/lib/shade.mjs";

const pack = (rows) => rows.map((r) => [Math.round(r.sun * 10), r.shade, r.terr].map((x) => x.toString(36).padStart(2, "0")).join("")).join("");
const YEAR = Array.from({ length: 12 }, (_, i) => ({ sun: 6.5, shade: 20 + i, terr: 40 }));

test("passList reads arrays, {passes}, and the curated map", () => {
  assert.equal(passList([{ id: "a" }]).length, 1);
  assert.equal(passList({ passes: [{ id: "a" }, { id: "b" }] }).length, 2);
  assert.deepEqual(passList({ _note: "x", stelvio: { versanti: [] } }).map((p) => p.id), ["stelvio"]);
});

test("insideArea keeps only the curated passes in the region box (summit or end of the first track)", () => {
  const region = [{ id: "r1", lat: 46.3, lon: 10.2 }, { id: "r2", lat: 46.6, lon: 10.6 }];
  const extra = [{ id: "in", versanti: [{ track: [[46.0, 10.0], [46.5, 10.45]] }] }, { id: "out", lat: 44.3, lon: 10.2 }, { id: "edge", lat: 46.68, lon: 10.65 }];
  assert.deepEqual(insideArea(region, extra).map((p) => p.id), ["in", "edge"]);
  assert.deepEqual(insideArea([], extra), []);
});

test("mergeShade: the run's keys are added to the current file, nothing of the others is lost", () => {
  const base = { v: 1, built: "2026-10-30", m: { "a|x": "old", "b|y": "keep" } };
  const add = { v: 1, built: "2026-11-01", m: { "a|x": "new", "c|z": "more" } };
  const { store, changed } = mergeShade(base, add);
  assert.deepEqual(store.m, { "a|x": "new", "b|y": "keep", "c|z": "more" });
  assert.equal(changed, 2); assert.equal(store.built, "2026-11-01");
  assert.equal(mergeShade(null, add).store.m["c|z"], "more");
});

test("v2 reading: unpack, the curated pass falls back to its OSM twin, honest words and causes", () => {
  const s = pack(YEAR);
  assert.equal(s.length, 72);
  const r = unpack(s);
  assert.equal(r[10].shade, 30); assert.equal(r[10].sun, 6.5); assert.equal(r[10].terr, 40);
  assert.equal(unpack("short"), null);
  const m = { "osm-9|Da Bormio": s };
  assert.ok(shadeFor(m, { id: "stelvio", twins: [{ id: "osm-9" }] }, "Da Bormio"));
  assert.equal(shadeFor(m, { id: "stelvio", twins: [] }, "Da Bormio"), null);
  assert.equal(shadeWord(5), "Pieno sole"); assert.equal(shadeWord(75), "Quasi sempre ombra");
  assert.deepEqual(shadeCauses({ shade: 50, terr: 40 }), [{ k: "bosco", pct: 30 }, { k: "rilievi", pct: 20 }]);
  assert.deepEqual(shadeCauses({ shade: 5, terr: 40 }), []);
});
