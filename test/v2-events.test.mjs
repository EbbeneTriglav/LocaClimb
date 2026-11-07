import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeEvents, upcoming, forClimb, onDay, addDays, isoDay, EVENT_TYPES } from "../v2/lib/events.mjs";
import { validateRoadEvents } from "../scripts/validate_data.mjs";

const J = { events: [
  { id: "a", type: "gara", name: "Giro t16", date: "2027-05-25", climbs: ["mortirolo", "gavia"], url: "https://x", source: "s" },
  { id: "b", type: "bikeday", name: "Sellaronda", date: "2027-06-05", end: "2027-06-06", climbs: ["pordoi"], url: "https://x", source: "s" },
  { id: "c", type: "boh", name: "bad type", date: "2027-06-05", climbs: ["x"] },
  { id: "d", type: "chiusura", name: "bad date", date: "5/6/2027", climbs: ["x"] }
] };
const LEGACY = [{ name: "Enjoy Stelvio", date: "2027-06-12", passes: ["stelvio"], hours: "8:00-14:00", url: "https://www.enjoystelvio.it" }];

test("events: curated file and legacy BIKE_EVENTS become one sorted list, malformed entries dropped", () => {
  const e = normalizeEvents(J, LEGACY);
  assert.deepEqual(e.map((x) => x.id), ["a", "b", "legacy-2027-06-12-enjoy-stelvio"]);
  assert.equal(e[0].end, "2027-05-25", "a one-day event ends the day it starts");
  assert.equal(e[2].type, "bikeday");
  assert.deepEqual(e[2].climbs, ["stelvio"]);
  assert.deepEqual(normalizeEvents(null, null), []);
});

test("events: upcoming window, per climb, on the day of a ride", () => {
  const e = normalizeEvents(J, LEGACY);
  assert.deepEqual(upcoming(e, "2027-05-20", 10).map((x) => x.id), ["a"]);
  assert.deepEqual(upcoming(e, "2027-06-06", 60).map((x) => x.id), ["b", "legacy-2027-06-12-enjoy-stelvio"], "a two-day event still shows on its second day");
  assert.deepEqual(forClimb(e, ["gavia"], "2027-01-01").map((x) => x.id), ["a"]);
  assert.deepEqual(forClimb(e, ["gavia"], "2027-05-26"), [], "past events are gone");
  assert.deepEqual(onDay(e, ["osm-1", "pordoi"], "2027-06-06").map((x) => x.id), ["b"]);
  assert.deepEqual(onDay(e, ["pordoi"], "2027-06-07"), []);
});

test("events: calendar helpers", () => {
  assert.equal(addDays("2027-02-27", 2), "2027-03-01");
  assert.equal(isoDay(new Date(2027, 0, 5)), "2027-01-05");
  for (const k of ["chiusura", "bikeday", "granfondo", "gara"]) assert.ok(EVENT_TYPES[k].label);
});

test("road_events.json validator", () => {
  assert.deepEqual(validateRoadEvents({ events: [J.events[0]] }, new Set(["mortirolo", "gavia"])), []);
  assert.equal(validateRoadEvents({ events: [J.events[0]] }, new Set(["gavia"])).length, 1, "unknown climb id");
  assert.ok(validateRoadEvents({ events: [J.events[2]] }).length >= 2, "bad type, no url, no source");
  assert.ok(validateRoadEvents({ events: [{ ...J.events[0], end: "2027-05-01" }] }).length === 1, "end before date");
  assert.ok(validateRoadEvents({ events: [J.events[0], J.events[0]] }).length === 1, "duplicate id");
  assert.equal(validateRoadEvents([]).length, 1);
});

test("road_events.json: the shipped file is valid", () => {
  const j = JSON.parse(readFileSync(new URL("../data/road_events.json", import.meta.url), "utf8"));
  assert.deepEqual(validateRoadEvents(j), []);
  assert.ok(normalizeEvents(j, []).length === j.events.length);
});
