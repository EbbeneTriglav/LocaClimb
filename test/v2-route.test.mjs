import { test } from "node:test";
import assert from "node:assert/strict";
import { brouterUrl, parseBrouter, surfCat, ascent, asSide, etaMinutes, climbsOnRoute, routeFeatures, surfaceFeatures, surfaceShares, encodeStops, decodeStops, routeGpx, highestIdx, trackKm } from "../v2/lib/route.mjs";

// a 10 km northward line: 5 km flat at 500 m, then 5 km climbing to 1000 m (10%)
const D = 10 / 111.195; // degrees of latitude for 10 km
const track = Array.from({ length: 101 }, (_, i) => [45 + D * i / 100, 10, i <= 50 ? 500 : 500 + (i - 50) * 10]);

test("brouterUrl: lon,lat pairs joined by | with the profile", () => {
  const u = brouterUrl([{ lat: 46.5, lon: 10.45 }, { lat: 46.53, lon: 10.4512345 }], "fastbike");
  assert.match(u, /lonlats=10\.45000,46\.50000\|10\.45123,46\.53000&profile=fastbike/);
});

test("parseBrouter: track lat/lon swapped, BRouter totals, surfaces from messages", () => {
  const j = { features: [{ geometry: { coordinates: [[10, 45, 500.4], [10, 45.01, 520], [10, 45.02, 560]] },
    properties: { "track-length": "2224", "filtered ascend": "58", messages: [["Longitude", "Distance", "WayTags"], ["", "1500", "highway=secondary surface=asphalt"], ["", "724", "highway=track"]] } }] };
  const r = parseBrouter(j);
  assert.deepEqual(r.track[0], [45, 10, 500]);
  assert.equal(r.km, 2.224);
  assert.equal(r.gain, 58);
  assert.deepEqual(r.surf, { asfalto: 1500, sterrato: 724 });
  assert.deepEqual(r.segs[1], { from: 1500, to: 2224, cat: "sterrato" });
  assert.equal(parseBrouter({ features: [] }), null);
});

test("surfCat: tags to the classic app's classes", () => {
  assert.equal(surfCat("highway=tertiary"), "asfalto");
  assert.equal(surfCat("highway=unclassified surface=gravel"), "sterrato");
  assert.equal(surfCat("highway=path"), "naturale");
  assert.equal(surfCat("highway=residential surface=sett"), "altro");
});

test("ascent ignores DEM noise under 3 m", () => {
  assert.equal(ascent([[0, 0, 100], [0, 0, 102], [0, 0, 100], [0, 0, 102], [0, 0, 150]]), 50);
  assert.equal(ascent(track), 500);
});

test("asSide: even samples over the true length, heights interpolated", () => {
  const s = asSide(track, 11);
  assert.equal(s.elevSource, "route");
  assert.equal(s.elevationProfile.length, 11);
  assert.ok(Math.abs(s.distance_km - 10) < 0.01);
  assert.equal(s.elevationProfile[0], 500);
  assert.equal(s.elevationProfile[5], 500);
  assert.equal(s.elevationProfile[10], 1000);
  assert.ok(Math.abs(s.elevationProfile[8] - 800) <= 1);
  assert.equal(asSide([[45, 10, 1]], 10), null);
});

test("etaMinutes: the climb is slower than the flat, total grows with distance", () => {
  const s = asSide(track, 101), e = etaMinutes(s, 3);
  const flat = e[50] - e[0], up = e[100] - e[50];
  assert.ok(flat > 10 && flat < 16, "5 km flat at ~24 km/h: " + flat);
  assert.ok(up > 2 * flat, "5 km at 10% much slower: " + up);
  assert.ok(etaMinutes(s, 4)[100] < e[100]);
});

test("climbsOnRoute: summits near the track, in riding order, others ignored", () => {
  const cl = [{ id: "b", lat: 45 + D * 0.9, lon: 10.001 }, { id: "a", lat: 45 + D * 0.2, lon: 10 }, { id: "far", lat: 45 + D * 0.5, lon: 10.05 }];
  const r = climbsOnRoute(track, cl, 0.25);
  assert.deepEqual(r.map((x) => x.c.id), ["a", "b"]);
  assert.ok(Math.abs(r[0].km - 2) < 0.01);
  assert.equal(r[1].m, 79);
});

test("routeFeatures: gradient colors in runs, surfaceFeatures only off tarmac", () => {
  const f = routeFeatures(asSide(track, 21));
  assert.equal(f.length, 2);
  assert.notEqual(f[0].properties.c, f[1].properties.c);
  const sf = surfaceFeatures(track, [{ from: 0, to: 5000, cat: "asfalto" }, { from: 5000, to: 10000, cat: "sterrato" }]);
  assert.equal(sf.length, 1);
  assert.equal(sf[0].properties.cat, "sterrato");
  assert.deepEqual(surfaceShares({ asfalto: 750, sterrato: 250 }), [{ k: "asfalto", pct: 75 }, { k: "sterrato", pct: 25 }]);
});

test("stops round-trip through the share link; junk is dropped", () => {
  const st = [{ lat: 46.52842, lon: 10.45321, id: "stelvio" }, { lat: 46.5, lon: 10.4 }];
  assert.deepEqual(decodeStops(encodeStops(st)), [{ lat: 46.52842, lon: 10.45321, id: "stelvio" }, { lat: 46.5, lon: 10.4, id: null }]);
  assert.deepEqual(decodeStops("abc;91,10;45,10"), [{ lat: 45, lon: 10, id: null }]);
});

test("routeGpx: waypoints before the track, names escaped", () => {
  const g = routeGpx("Giro <test>", [[45, 10, 500.4], [45.1, 10, null]], [{ lat: 45.05, lon: 10, name: "Acqua & bar", sym: "Drinking Water" }]);
  assert.ok(g.indexOf("<wpt") < g.indexOf("<trk>"));
  assert.match(g, /Giro &lt;test&gt;/);
  assert.match(g, /Acqua &amp; bar/);
  assert.match(g, /<ele>500<\/ele>/);
  assert.equal((g.match(/<trkpt/g) || []).length, 2);
});

test("highestIdx and trackKm", () => {
  assert.equal(highestIdx([1, 5, 3, 5]), 1);
  assert.ok(Math.abs(trackKm(track) - 10) < 0.01);
});
