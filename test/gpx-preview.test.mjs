/*
 * gpxclimbs.js preview: a GPX climb becomes a pass object in the same shape as OSM
 * versanti (so the normal panel renders it), plus the list of known passes near its top.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const ctx = {}; vm.createContext(ctx);
vm.runInContext(await readFile(new URL("../js/gpxclimbs.js", import.meta.url), "utf8"), ctx);

/* 5 km due north at a steady 7% (350 m), one point every 20 m */
const tr = [];
for (let d = 0; d <= 5000; d += 20) tr.push([+(44 + d / 111200).toFixed(6), 12.5, Math.round(400 + d * 0.07)]);
const climb = { tr, km: 5, gain: 350, avg: 7, top: tr[tr.length - 1] };

test("preview pass has one versante with track, profile and stats like an OSM side", () => {
  const p = ctx.gcBuildPass(climb, 3, "Salita senza nome");
  assert.equal(p.id, "gpx-prev-3");
  assert.equal(p.versanti.length, 1);
  const v = p.versanti[0];
  assert.equal(v.track.length, tr.length);
  assert.equal(v.elevationProfile.length, 100);
  assert.equal(v.elevationProfile[0], 400);
  assert.equal(v.elevationProfile[99], 750);
  assert.equal(v.distance_km, 5);
  assert.ok(v.maxGradient >= 6.5 && v.maxGradient <= 7.5, "max " + v.maxGradient);
  assert.equal(v.exposure, "Sud");          // climbing north = the slope faces south
  assert.equal(p.elevation, 750);
});

test("near passes: only within the radius, sorted by distance from the top", () => {
  const t = climb.top;
  const near = ctx.gcNear(climb, [
    { name: "Lontano", lat: t[0] + 0.1, lon: t[1] },
    { name: "Due km", lat: t[0] + 0.018, lon: t[1] },
    { name: "In cima", lat: t[0] + 0.001, lon: t[1] }
  ], 5);
  assert.deepEqual(Array.from(near, (n) => n.pass.name), ["In cima", "Due km"]);
  assert.ok(near[1].km > 1.8 && near[1].km < 2.2);
});
