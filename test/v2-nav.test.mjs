// Bike navigator on the Giro (v2/lib/nav.mjs, Rick 11/11/2026)
import { test } from "node:test";
import assert from "node:assert/strict";
import { maneuvers, cumKm, gainLeft, locate, upcoming, fmtDistNav, routeBearing, offRoute, voiceCue, voiceText, spokenDist, fingerMoved, REROUTE, rerouteDue, rerouteDone, sayReroute, sidesByDistance } from "../v2/lib/nav.mjs";

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

test("fingerMoved: a tap stays a tap, a swipe stops the navigator following", () => {
  const down = { x: 100, y: 200 };
  assert.equal(fingerMoved(down, { clientX: 103, clientY: 204 }), false, "5 px: a tap");
  assert.equal(fingerMoved(down, { clientX: 100, clientY: 207 }), true, "7 px: the map moves");
  assert.equal(fingerMoved(down, { clientX: 60, clientY: 200 }), true);
  assert.equal(fingerMoved(down, { clientX: 108, clientY: 200 }, 10), false, "custom threshold");
});

test("reroute pacing: after a new route the rider gets time to join it, the voice does not repeat itself", () => {
  // Rick 14/11/2026, by car near San Pellegrino Terme: off the line it re-routed every 3 s and the app felt stuck
  const st = {};
  assert.equal(rerouteDue(st, 80, 0), false); assert.equal(rerouteDue(st, 80, 1000), false);
  assert.equal(rerouteDue(st, 80, 2000), true, "three fixes off the line: re-route");
  rerouteDone(st, 2500, true);
  for (let t = 3500; t < 2500 + REROUTE.calmOk; t += 1000) assert.equal(rerouteDue(st, 120, t), false, "calm after a new route at " + t);
  const after = 2500 + REROUTE.calmOk;
  assert.equal(rerouteDue(st, 120, after), false); assert.equal(rerouteDue(st, 120, after + 1000), false);
  assert.equal(rerouteDue(st, 120, after + 2000), true, "still off after the calm: re-route again");
  rerouteDone(st, 0, false);
  assert.ok(st.calm === REROUTE.calmFail && REROUTE.calmFail > REROUTE.calmOk, "a failed request waits longer");
  const v = {};
  assert.equal(sayReroute(v, 0), true); assert.equal(sayReroute(v, 10000), false, "not again 10 s later");
  assert.equal(sayReroute(v, REROUTE.sayEvery + 1), true);
});

test("sides by distance: the rider picks the side; the nearest base is marked, the shown one stays first choice", () => {
  // Alino (San Pellegrino Terme): two sides end at the same top, the app took the first one
  const vs = [{ side: "Da San Giovanni Bianco", startLat: 45.87014, startLon: 9.65219, track: [[45.87014, 9.65219], [45.84768, 9.64893]] },
    { side: "Da San Pellegrino Terme", startLat: 45.83989, startLon: 9.66549, track: [[45.83989, 9.66549], [45.84768, 9.64893]] },
    { side: "senza tracciato", startLat: 45.8, startLon: 9.6 }];
  const r = sidesByDistance(vs, { lat: 45.8336, lon: 9.664 });
  assert.deepEqual(r.map((x) => x.i), [0, 1], "only sides with a track, in the sheet's order");
  assert.equal(r.find((x) => x.near).i, 1, "San Pellegrino is the nearest base");
  assert.ok(r[1].km < 1 && r[0].km > 3);
  assert.deepEqual(sidesByDistance(vs, null).map((x) => [x.i, x.km, x.near]), [[0, null, false], [1, null, false]], "no GPS: no distances");
});
