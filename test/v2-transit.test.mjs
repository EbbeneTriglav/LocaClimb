import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pickStations, bikeRule, itinView, bikeable, departIso, minuteOfDay, hm, dur, trainFeatures, planUrl, stopsUrl, roadTableUrl, roadKm, guessHours } from "../v2/lib/transit.mjs";

const RULES = JSON.parse(readFileSync(new URL("../data/rail_bike_rules.json", import.meta.url), "utf8"));
const MILANO = { lat: 45.4642, lon: 9.19 }, STELVIO = { lat: 46.5285, lon: 10.4532 };

test("data/rail_bike_rules.json: every operator has a valid pattern, a regional rule, a https source and the day it was checked", () => {
  assert.ok(RULES.operators.length >= 6);
  for (const o of RULES.operators) {
    assert.doesNotThrow(() => new RegExp(o.match, "i"), o.id);
    assert.ok(o.regional && ["yes", "reserve", "no", "check"].includes(o.regional.bike), o.id);
    if (o.long) assert.ok(["yes", "reserve", "no", "check"].includes(o.long.bike), o.id);
    assert.match(o.source, /^https:\/\//, o.id);
    assert.match(o.ticket, /^https:\/\//, o.id);
    assert.match(o.checked, /^\d{4}-\d{2}-\d{2}$/, o.id);
  }
});

test("bike rules per operator: Trenord yes, a Frecciarossa no, ÖBB long-distance with reservation, unknown -> check", () => {
  assert.equal(bikeRule({ cat: "regional", agency: "Trenord" }, RULES).bike, "yes");
  assert.equal(bikeRule({ cat: "regional", agency: "TRENITALIA" }, RULES).bike, "yes");
  assert.equal(bikeRule({ cat: "long", agency: "TRENITALIA" }, RULES).bike, "no");
  assert.equal(bikeRule({ cat: "long", agency: "ÖBB-Personenverkehr AG" }, RULES).bike, "reserve");
  assert.equal(bikeRule({ cat: "regional", agency: "Rhätische Bahn" }, RULES).op, "Ferrovie svizzere");
  assert.equal(bikeRule({ cat: "regional", agency: "TER Auvergne-Rhône-Alpes" }, RULES).op, "SNCF");
  assert.equal(bikeRule({ cat: "regional", agency: "SAD Trasporto locale" }, RULES).bike, "check");
  assert.equal(bikeRule({ cat: "regional", agency: "Tper" }, RULES).bike, "check", "'ter' must not match inside another word");
});

test("stations: the real one near the climb, not the halt next to it nor one behind home", () => {
  const st = [
    { name: "Villa Di Tirano", lat: 46.1963, lon: 10.1305, imp: 1.5e-5 },
    { name: "Tirano", lat: 46.2158, lon: 10.1657, imp: 1.1e-3 },
    { name: "Tirano, RhB", lat: 46.2157, lon: 10.1667, imp: 1e-3 },
    { name: "Sondrio", lat: 46.1696, lon: 9.8693, imp: 8e-4 },
    { name: "Monza", lat: 45.5779, lon: 9.2723, imp: 1e-3 },
    { name: "Campocologno", lat: 46.2334, lon: 10.1419, imp: 5.2e-4 }
  ];
  const p = pickStations(st, MILANO, { lat: 46.4669, lon: 10.3705 }, 3);
  assert.equal(p[0].name, "Tirano");
  assert.ok(!p.some((s) => s.name === "Tirano, RhB"), "two stations 100 m apart count once");
  assert.ok(!p.some((s) => s.name === "Monza"), "a station near home is no shortcut");
  assert.ok(!p.some((s) => s.name === "Campocologno"), "a halt 3 km from Tirano gives way to Tirano, even if a bit closer to the climb");
  assert.ok(p.findIndex((s) => s.name === "Villa Di Tirano") === -1 || p.findIndex((s) => s.name === "Villa Di Tirano") > p.findIndex((s) => s.name === "Sondrio"), "a small halt ranks after a real station a bit farther");
});

const leg = (o) => ({ cat: "regional", agency: "Trenord", name: "RE8", from: { name: "Milano Centrale" }, to: { name: "Tirano" }, geom: [[45.48, 9.2], [46.2, 10.1]], ...o });
test("an itinerary as the Giro shows it: the worst rule of its trains; a bus in the middle = no bike", () => {
  const ok = { dep: "2026-11-21T07:04:00Z", arr: "2026-11-21T09:55:00Z", legs: [{ cat: "self", mode: "BIKE" }, leg({ dep: "2026-11-21T07:20:00Z", arr: "2026-11-21T09:53:00Z" })] };
  const v = itinView(ok, RULES);
  assert.equal(v.bike, "yes");
  assert.equal(v.names, "RE8 Trenord");
  assert.equal(v.from, "Milano Centrale");
  assert.equal(v.dep, "2026-11-21T07:20:00Z", "the train's own departure, not the ride to the station");
  assert.deepEqual(v.tickets, [{ op: "Trenord", url: "https://www.trenord.it/" }]);
  const fr = { ...ok, legs: [leg({ cat: "long", agency: "TRENITALIA", name: "FR 8703" }), leg({})] };
  assert.equal(itinView(fr, RULES).bike, "no");
  const bus = { ...ok, legs: [leg({}), { cat: "other", agency: "SAD", name: "B250" }] };
  assert.equal(itinView(bus, RULES).bike, "no");
  const its = [{ ...ok, arr: "2026-11-21T10:55:00Z" }, ok, fr];
  assert.deepEqual(bikeable(its, RULES).map((x) => x.arr), ["2026-11-21T09:55:00Z", "2026-11-21T10:55:00Z"]);
  assert.equal(trainFeatures(ok).length, 1);
  assert.deepEqual(trainFeatures(ok)[0].geometry.coordinates[0], [9.2, 45.48]);
});

test("clock helpers and URLs", () => {
  const now = new Date(2026, 10, 18, 21, 0);
  const iso = departIso(1, "07:30", now), d = new Date(iso);
  assert.equal(d.getDate(), 19); assert.equal(d.getHours(), 7); assert.equal(d.getMinutes(), 30);
  assert.equal(minuteOfDay(iso), 450);
  assert.equal(hm(iso), "07:30");
  assert.equal(dur(153), "2h33"); assert.equal(dur(42), "42 min");
  assert.equal(stopsUrl(46.46694, 10.37051, 60), "/api/transit/stops?lat=46.4669&lon=10.3705&km=60");
  assert.match(planUrl(MILANO, STELVIO, "2026-11-21T06:30:00.000Z"), /^\/api\/transit\/plan\?from=45\.46420,9\.19000&to=46\.52850,10\.45320&time=2026-11-21T06%3A30%3A00\.000Z&n=3$/);
  assert.match(planUrl(STELVIO, MILANO, "2026-11-21T16:00:00.000Z", 3, true), /&n=3&post=bike$/, "the trip back ends riding home from the station");
});

test("road distance decides which stations get a timetable query (Milano -> Stelvio: Tirano, not the Engadin)", () => {
  const st = [{ name: "Zernez", lat: 46.6987, lon: 10.0926, toT: 34, toH: 150 }, { name: "Tirano", lat: 46.2158, lon: 10.1657, toT: 45, toH: 120 }];
  assert.equal(roadTableUrl(st, STELVIO), "https://router.project-osrm.org/table/v1/driving/10.09260,46.69870;10.16570,46.21580;10.45320,46.52850?sources=0;1&destinations=2&annotations=distance");
  assert.deepEqual(roadKm({ code: "Ok", distances: [[55000], [60500]] }, 2), [55, 60.5]);
  assert.deepEqual(roadKm(null, 2), [null, null], "OSRM down: straight lines");
  const g = (s, road) => guessHours({ ...s, road });
  assert.ok(g(st[0], null) < g(st[1], null), "in a straight line the Engadin looks better...");
  assert.ok(g(st[1], 60.5) < g(st[0], 55), "...by road and from Milano, Tirano is");
});
