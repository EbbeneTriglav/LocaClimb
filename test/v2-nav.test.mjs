// Bike navigator on the Giro (v2/lib/nav.mjs, Rick 11/11/2026)
import { test } from "node:test";
import assert from "node:assert/strict";
import { maneuvers, cumKm, gainLeft, locate, upcoming, fmtDistNav, routeBearing, offRoute, voiceCue, voiceText, spokenDist } from "../v2/lib/nav.mjs";

// a 2 km "L": 1 km north, then 1 km east (~ 0.009 deg lat = 1 km)
const T = [];
for (let i = 0; i <= 10; i++) T.push([46 + i * 0.0009, 10, 1000 + i * 10]);
for (let i = 1; i <= 10; i++) T.push([46.009, 10 + i * 0.0013, 1100 - i * 5]);
const C = cumKm(T);

test("nav: BRouter voicehints become maneuvers with Italian text", () => {
  const ms = maneuvers([[10, 5, 0, 1000, 88], [3, 13, 2, 50, -200], [15, 15, 0, 10, 0], [99, 2, 0, 1, -90], [12, 99, 0, 1, 0]], T.length);
  assert.deepEqual(ms.map((m) => [m.i, m.k, m.text]), [[3, "roundabout", "Alla rotonda prendi la 2ª uscita"], [10, "right", "Gira a destra"]],
    "sorted; beeline (15), unknown commands and indexes past the track dropped");
  assert.deepEqual(maneuvers(null), []);
});

test("nav: where am I, what comes next, how far", () => {
  const L = locate(T, C, { lat: 46.0047, lon: 10.00005 }, 0);
  assert.equal(L.seg, 5);
  assert.ok(Math.abs(L.along - 0.522) < 0.01 && L.off < 10, JSON.stringify(L));
  const ms = maneuvers([[10, 5, 0, 1000, 88]], T.length);
  const u = upcoming(ms, C, L.along);
  assert.equal(u.next.text, "Gira a destra");
  assert.ok(Math.abs(u.distM - 478) < 15, String(u.distM));
  const after = upcoming(ms, C, 1.2);
  assert.equal(after.next, null, "past the last turn: the arrival is next");
  assert.ok(Math.abs(after.distM - (C[C.length - 1] - 1.2) * 1000) < 2);
});

test("nav: an out-and-back does not jump to the other leg", () => {
  const back = [...T, ...T.slice(0, -1).reverse()], c = cumKm(back);
  const p = { lat: 46.0045, lon: 10 };
  assert.ok(locate(back, c, p, 3).along < 1, "going out");
  assert.ok(locate(back, c, p, back.length - 8).along > 3, "coming back");
});

test("nav: lost far away searches the whole route", () => {
  const L = locate(T, C, { lat: 46.009, lon: 10.0117 }, 0);
  assert.ok(L.along > 1.8 && L.off < 10);
  assert.equal(locate(T, C, null), null);
});

test("nav: metres to climb, distances, road heading, off-route", () => {
  const g = gainLeft(T);
  assert.equal(g[0], 100); assert.equal(g[10], 0, "downhill after the corner");
  assert.equal(fmtDistNav(1234), "1,2 km"); assert.equal(fmtDistNav(12345), "12 km");
  assert.equal(fmtDistNav(320), "300 m"); assert.equal(fmtDistNav(87), "90 m"); assert.equal(fmtDistNav(1234, "."), "1.2 km");
  assert.ok(Math.abs(routeBearing(T, C, 0.3) - 0) < 2, "north on the first leg");
  assert.ok(Math.abs(routeBearing(T, C, 1.5) - 90) < 2, "east on the second");
  const st = {};
  assert.equal(offRoute(st, 80), false); assert.equal(offRoute(st, 90), false); assert.equal(offRoute(st, 70), true, "third fix off the line");
  assert.equal(offRoute(st, 10), false, "back on the line resets");
});

test("nav: voice prompts once far, once near, in three languages", () => {
  const st = {}, m = { i: 10 }, m2 = { i: 14 };
  assert.equal(voiceCue(st, m, 900), null, "too far: silent");
  assert.equal(voiceCue(st, m, 290), "far");
  assert.equal(voiceCue(st, m, 200), null, "said once");
  assert.equal(voiceCue(st, m, 45), "near");
  assert.equal(voiceCue(st, m, 20), null);
  assert.equal(voiceCue(st, m2, 80), null, "a close new turn waits for the near cue");
  assert.equal(voiceCue(st, m2, 40), "near");
  assert.equal(voiceCue(st, null, 10), null);
  assert.equal(voiceText("Gira a destra", 300), "Tra 300 metri, gira a destra");
  assert.equal(voiceText("Turn right", 1000, "en"), "In one kilometre, turn right");
  assert.equal(voiceText("Gira a la derecha", 2400, "es"), "En 2,4 kilómetros, gira a la derecha");
  assert.equal(voiceText("Gira a destra", null), "Gira a destra");
  assert.equal(spokenDist(37), "40 metri");
});
