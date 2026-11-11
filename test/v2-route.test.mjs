import { test } from "node:test";
import assert from "node:assert/strict";
import { brouterUrl, parseBrouter, surfCat, ascent, asSide, etaMinutes, climbsOnRoute, routeFeatures, surfaceFeatures, surfaceShares, encodeStops, decodeStops, routeGpx, highestIdx, trackKm, rideColor, rideProfile, rideColors, rideFeatures, riskyDescents, riskyFeatures, cumKm } from "../v2/lib/route.mjs";

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

import { encodeTrack, decodeTrack, fitTrack, rideDoc } from "../v2/lib/route.mjs";
test("saved rides: same track encoding as the classic app (js/myrides.js)", () => {
  const t = [[46.123456, 10.987654, 1234.4], [46.2, 10.9, null]];
  assert.equal(encodeTrack(t), "46.12346,10.98765,1234;46.20000,10.90000,");
  assert.deepEqual(decodeTrack(encodeTrack(t)), [[46.12346, 10.98765, 1234], [46.2, 10.9, null]]);
  assert.deepEqual(decodeTrack(""), []);
});
test("saved rides: resampled keeping both ends; the document has the classic fields", () => {
  const long = Array.from({ length: 7001 }, (_, i) => [45 + i * 1e-4, 10, 500]);
  const f = fitTrack(long, 6000);
  assert.equal(f.length, 6000); assert.deepEqual(f[0], long[0]); assert.deepEqual(f[5999], long[7000]);
  const d = rideDoc("  ", [{ lat: 46.5, lon: 10.4, id: "stelvio", name: "Passo dello Stelvio" }, { lat: 46.4, lon: 10.3 }], long, 70.04, 1939.6, 123);
  assert.equal(d.name, "Il mio giro"); assert.equal(d.pts, 6000); assert.equal(d.distKm, 70.04); assert.equal(d.ascent, 1940); assert.equal(d.savedAt, 123);
  assert.deepEqual(d.stops.map((s) => s.type), ["pass", "point"]);
});

// a descent at `grade` %: hairpin legs of 150 m (switchbacks) or one straight line, `km` long
function descent(grade, km, twisty) {
  const pts = [], leg = 0.15, dLon = leg / (111.32 * Math.cos(46 * Math.PI / 180)), dLat = 0.02 / 111.195;
  if (twisty) { for (let l = 0; l * leg < km; l++) for (let k = 0; k <= 6; k++) pts.push([46 + l * dLat, 10 + (l % 2 ? (6 - k) : k) / 6 * dLon]); }
  else for (let i = 0; i * 0.025 <= km; i++) pts.push([46 + i * 0.025 / 111.195, 10]);
  const c = cumKm(pts);
  return pts.map((q, i) => [q[0], q[1], Math.round(2000 + c[i] * 10 * grade)]);
}

test("rideColor: climb scale from 4%, white flat, three blues down", () => {
  assert.equal(rideColor(2), "#FFFFFF"); assert.equal(rideColor(-3.9), "#FFFFFF");
  assert.equal(rideColor(5), "#F2C14E"); assert.equal(rideColor(14), "#C04BD6");
  assert.equal(rideColor(-5), "#8FD3FF"); assert.equal(rideColor(-8), "#2F7CF6"); assert.equal(rideColor(-12), "#1B2A8A");
});

test("rideProfile: 25 m samples, so a 300 m wall keeps its colour on a long ride", () => {
  // 150 km flat with a 300 m wall at 12% in the middle (300 samples = one every 500 m)
  const D1 = 1 / 111.195, pts = [];
  for (let i = 0; i <= 6000; i++) { const km = i * 0.025, e = km < 75 ? 100 : km < 75.3 ? 100 + (km - 75) * 120 : 136; pts.push([45 + km * D1, 10, e]); }
  const rp = rideProfile(pts);
  assert.ok(Math.abs(rp.step - 0.025) < 0.001);
  const c = rideColors(rp);
  assert.ok(c.includes("#E5484D"), "the wall is still red");
  assert.equal(routeFeatures(asSide(pts)).some((f) => f.properties.c === "#E5484D"), false, "300 samples lose it (why the map line changed)");
  assert.ok(rideFeatures(rp).every((f) => f.geometry.coordinates.length >= 2));
});

test("rideColors: a short gentle blip takes the colour before it, steep runs stay", () => {
  const rp = { step: 0.025, g: [1, 1, 1, 5, 1, 1, 1, 12, 1, 1] };
  assert.deepEqual(rideColors(rp), ["#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#E5484D", "#FFFFFF", "#FFFFFF"]);
  assert.deepEqual(rideColors({ step: 0.025, g: [12, 12, 12, 1, 12, 12] }).slice(2, 5), ["#E5484D", "#FFFFFF", "#E5484D"], "between two walls a flat bit stays flat");
});

test("riskyDescents: only steep AND twisty descents, one warning per descent, after the right stop", () => {
  const twisty = rideProfile(descent(-11, 3, true));
  const r = riskyDescents(twisty, [{ lat: 46, lon: 10 }]);
  assert.equal(r.length, 1);
  assert.ok(r[0].avg <= -9 && r[0].km >= 2, JSON.stringify(r[0]));
  assert.equal(r[0].after, 0);
  assert.equal(riskyFeatures(twisty, r).length, 1);
  assert.deepEqual(riskyDescents(rideProfile(descent(-11, 3, false))), [], "straight: steep but not twisty");
  assert.deepEqual(riskyDescents(rideProfile(descent(-6, 3, true))), [], "twisty but not steep");
  assert.deepEqual(riskyDescents(null), []);
});

import { patchProfile, profileSrcUrl, tunnelSummary, tunnelFeatures, PROFILES } from "../v2/lib/route.mjs";
test("tunnels and cycle lanes from the way tags (Giro, 11/11/2026)", () => {
  const H = ["Longitude", "Latitude", "Elevation", "Distance", "WayTags"];
  const j = { features: [{ geometry: { coordinates: [[10, 46, 1000], [10.01, 46, 1010], [10.02, 46, 1020], [10.03, 46, 1030]] }, properties: { "track-length": "2300", "filtered ascend": "30", messages: [H,
    ["", "", "", "500", "highway=secondary surface=asphalt"],
    ["", "", "", "120", "highway=secondary surface=asphalt tunnel=yes"],
    ["", "", "", "20", "highway=secondary surface=asphalt"],
    ["", "", "", "60", "highway=secondary surface=asphalt tunnel=yes"],
    ["", "", "", "800", "highway=cycleway surface=asphalt"],
    ["", "", "", "300", "highway=tertiary cycleway:right=lane"],
    ["", "", "", "500", "highway=tertiary cycleway:both=shared_lane tunnelish=no"]] } }] };
  const r = parseBrouter(j);
  assert.deepEqual(r.tunnels, [{ from: 500, to: 700 }], "two tunnel ways 20 m apart are one tunnel");
  assert.equal(r.cycM, 1100, "cycleway + painted lane; a shared lane is not a cycle lane");
  const t = tunnelSummary(r.tunnels);
  assert.deepEqual(t, { n: 1, m: 200, long: { km: 0.5, m: 200 }, list: [{ km: 0.5, m: 200 }] });
  assert.equal(tunnelSummary([]), null);
  assert.equal(tunnelSummary([{ from: 0, to: 8 }]), null, "a few metres under a bridge are not a tunnel");
  assert.equal(tunnelFeatures([[46, 10], [46, 10.01]], []).length, 0);
  assert.deepEqual(parseBrouter({ features: [{ geometry: { coordinates: [[10, 46, 1], [10.01, 46, 2]] }, properties: {} }] }).tunnels, []);
});
test("BRouter profile with the tunnel rule: one line after the way context, once", () => {
  const brf = "---context:global\nassign x 1\n---context:way   # comment\nassign costfactor 1\n---context:node\n";
  const p = patchProfile(brf);
  assert.match(p, /---context:way {3}# comment\nassign lr_tunnel = if tunnel=yes then 1 else 0\nassign costfactor 1/);
  assert.equal(patchProfile(p), p, "idempotent");
  assert.equal(patchProfile("404: Not Found"), "404: Not Found", "not a profile: left alone, never uploaded");
  assert.equal(profileSrcUrl("fastbike"), "https://raw.githubusercontent.com/abrensch/brouter/master/misc/profiles2/fastbike.brf");
  assert.ok(PROFILES.some(([k]) => k === "safety"), "«Più ciclabili»");
});
