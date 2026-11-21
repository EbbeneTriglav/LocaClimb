// scripts/discover_quality.mjs: the weekly quality report of the climb search (21/11/2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { sideFlags, regionQuality, knownMissing, inBbox, buildReport, renderMarkdown } from "../scripts/discover_quality.mjs";

const side = (o) => ({ side: "Da A", distance_km: 5, avgGradient: 8, maxGradient: 12, startElevation: 500, endElevation: 900,
  elevationProfile: [500, 580, 660, 740, 820, 900], ...o });

test("a clean side has no flag", () => {
  assert.deepEqual(sideFlags(side({})), []);
});

test("each flag fires on its own case", () => {
  assert.deepEqual(sideFlags(side({ avgGradient: 16, startElevation: 500, endElevation: 1300, elevationProfile: [500, 660, 820, 980, 1140, 1300] })), ["ripida"]);
  assert.deepEqual(sideFlags(side({ maxGradient: 34 })), ["picco"]);
  assert.deepEqual(sideFlags(side({ distance_km: 30, avgGradient: 2.5, startElevation: 200, endElevation: 950,
    elevationProfile: [200, 350, 500, 650, 800, 950] })), ["piatta"]);
  assert.deepEqual(sideFlags(side({ elevationProfile: [500, 580, 660, 1100, 820, 900] })), ["salto"], "440 m over 1 km = 44% between two samples");
  assert.deepEqual(sideFlags(side({ endElevation: 1100 })), ["incoerente"], "600 m of gain is not 5 km at 8%");
  assert.deepEqual(sideFlags(side({ avgGradient: 16, distance_km: 1.2, startElevation: 500, endElevation: 692, elevationProfile: [] })), [], "short walls are not flagged");
});

test("regionQuality counts sides, flags and keeps a few examples", () => {
  const climbs = [{ id: "a", name: "A", versanti: [side({}), side({ maxGradient: 40 })] }, { id: "b", name: "B", versanti: [side({ maxGradient: 31 })] }];
  const q = regionQuality(climbs, 1);
  assert.equal(q.climbs, 2); assert.equal(q.sides, 3); assert.equal(q.flagged, 2);
  assert.equal(q.flags.picco, 2); assert.equal(q.rate, 0.667);
  assert.equal(q.examples.length, 1); assert.equal(q.examples[0].id, "a");
});

test("knownMissing: a known climb with a published climb within 1 km is covered", () => {
  const refs = [{ id: "near", name: "Near", lat: 45.0, lon: 9.0 }, { id: "far", name: "Far", lat: 46.0, lon: 9.0 }];
  const index = [{ name: "Top", lat: 45.005, lon: 9.0 }, { name: "Other", lat: 46.03, lon: 9.0 }];
  const m = knownMissing(refs, index);
  assert.equal(m.length, 1);
  assert.equal(m[0].id, "far"); assert.equal(m[0].nearest, "Other"); assert.equal(m[0].nearestKm, 3.3);
});

test("inBbox reads osmium bboxes (minlon,minlat,maxlon,maxlat)", () => {
  assert.ok(inBbox("9,44,10,45", 44.5, 9.5));
  assert.ok(!inBbox("9,44,10,45", 45.5, 9.5));
  assert.ok(!inBbox("", 44.5, 9.5));
});

test("the report lists never-searched regions, the worst regions first, and renders in Italian", () => {
  const many = (o) => Array.from({ length: 20 }, () => side(o));
  const rep = buildReport({
    regions: ["er", "liguria", "sweden"],
    discover: { er: [{ id: "x", name: "X", versanti: many({}) }], liguria: [{ id: "y", name: "Y", versanti: many({ maxGradient: 40 }) }] },
    refs: [{ id: "k", name: "Nota", lat: 44.3, lon: 11.0 }], index: [], date: "2026-11-23"
  });
  assert.deepEqual(rep.never, ["sweden"]);
  assert.deepEqual(rep.worst.map((r) => r.region), ["liguria", "er"]);
  assert.equal(rep.missing.length, 1); assert.equal(rep.missing[0].zone, "er");
  const md = renderMarkdown(rep);
  assert.match(md, /^# Qualita' della ricerca salite \(2026-11-23\)/);
  assert.match(md, /\| liguria \| 1 \| 20 \| 20 \| 100\.0 \|/);
  assert.match(md, /Nota \(k, 44\.3, 11\) - zona er/);
  assert.match(md, /## Regioni mai cercate\n\nsweden/);
});
