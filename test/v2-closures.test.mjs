// Winter closures of the passes (v2/lib/closures.mjs + data/winter_closures.json, Rick 11/11/2026)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeClosures, closureFor, closureState, closureInfo, blocked, inWindow, span, dm, closureTag } from "../v2/lib/closures.mjs";
import { validateWinterClosures } from "../scripts/validate_data.mjs";

const STELVIO = { id: "stelvio", name: "Passo dello Stelvio", lat: 46.52862, lon: 10.45321, closes: ["10-25", "11-10"], opens: ["05-20", "06-10"], note: "n", sources: ["https://a"] };
const GAVIA = { id: "gavia", name: "Passo di Gavia", lat: 46.34348, lon: 10.48733, closes: ["10-20", "11-05"], opens: ["05-22", "06-14"], sources: ["https://b"],
  now: { closed: true, since: "2026-10-23", checked: "2026-11-11", source: "https://c" } };
const PENNES = { id: "pennes", name: "Passo di Pennes", lat: 46.81878, lon: 11.44125, closes: null, opens: null, sources: ["https://d"] };

test("closures: window across New Year", () => {
  assert.ok(inWindow("12-25", "11-10", "05-20"));
  assert.ok(inWindow("02-01", "11-10", "05-20"));
  assert.ok(!inWindow("07-01", "11-10", "05-20"));
  assert.ok(inWindow("05-25", "05-20", "06-10"));
});

test("closures: usual windows give closed-for-sure, maybe, open", () => {
  assert.equal(closureState(STELVIO, "2026-11-11"), "likely", "after the latest usual closing");
  assert.equal(closureState(STELVIO, "2027-01-15"), "likely");
  assert.equal(closureState(STELVIO, "2026-10-30"), "maybe", "inside the closing window");
  assert.equal(closureState(STELVIO, "2027-05-28"), "maybe", "inside the reopening window");
  assert.equal(closureState(STELVIO, "2027-07-15"), null, "summer");
  assert.equal(closureState(STELVIO, "2027-10-01"), null);
  assert.ok(blocked(STELVIO, "2026-12-01") && !blocked(STELVIO, "2026-10-30"));
});

test("closures: unknown bounds keep at least December - March closed", () => {
  assert.equal(closureState(PENNES, "2027-01-10"), "likely");
  assert.equal(closureState(PENNES, "2026-12-01"), "likely");
  assert.equal(closureState(PENNES, "2026-11-15"), null, "no claim outside the safe core");
  assert.equal(closureState(PENNES, "2027-04-15"), null);
});

test("closures: the checked state wins over the usual window", () => {
  assert.equal(closureState(GAVIA, "2026-10-24"), "closed", "closed since 23/10 even inside the closing window");
  assert.equal(closureState(GAVIA, "2026-10-22"), "maybe", "before the closure day the window decides");
  const reopened = { ...GAVIA, now: { closed: true, since: "2026-10-23", reopens: "2027-05-22", checked: "2027-05-20", source: "https://c" } };
  assert.equal(closureState(reopened, "2027-05-21"), "closed");
  assert.equal(closureState(reopened, "2027-05-22"), null, "announced reopening: open, even in the reopening window");
  const open = { ...STELVIO, now: { closed: false, checked: "2026-11-11", source: "https://e" } };
  assert.equal(closureState(open, "2026-11-12"), null, "checked open a day ago");
  assert.equal(closureState(open, "2026-11-30"), "likely", "an old 'open' check expires after a week");
});

test("closures: a climb matches the pass whose top is within 1 km (curated, OSM and x- twins)", () => {
  const list = normalizeClosures({ passes: [STELVIO, GAVIA, { name: "bad" }] });
  assert.equal(list.length, 2, "an entry without coordinates is dropped");
  assert.equal(closureFor(list, 46.5285, 10.4534).id, "stelvio", "curated coordinates, 30 m away");
  assert.equal(closureFor(list, 46.54165, 10.43318), null, "Umbrail, 2,5 km away, is another pass");
});

test("closures: what the pages say, in three languages", () => {
  assert.equal(dm("2026-10-23"), "23/10");
  assert.equal(span(["05-20", "06-10"]), "tra 20/5 e 10/6");
  assert.equal(span(["10-15", "10-15"]), "verso il 15/10");
  const g = closureInfo(GAVIA, "2026-11-11");
  assert.equal(g.state, "closed"); assert.equal(g.label, "Chiuso per l'inverno"); assert.equal(g.tone, "bad");
  assert.equal(g.when, "dal 23/10 · di solito riapre tra 22/5 e 14/6");
  assert.equal(g.source, "https://c");
  assert.equal(closureInfo(GAVIA, "2026-11-11", "en").when, "since 23/10 · usually reopens between 22/5 and 14/6");
  assert.equal(closureInfo(GAVIA, "2026-11-11", "es").when, "desde el 23/10 · suele reabrir entre el 22/5 y el 14/6");
  const s = closureInfo(STELVIO, "2027-07-01");
  assert.equal(s.state, null); assert.equal(s.label, "Chiusura invernale"); assert.equal(s.when, "chiude tra 25/10 e 10/11 · riapre tra 20/5 e 10/6");
  assert.equal(closureInfo(null, "2027-07-01"), null);
});

test("winter_closures.json: valid, sourced, and every pass matches a climb we publish", () => {
  const data = JSON.parse(readFileSync(new URL("../data/winter_closures.json", import.meta.url), "utf8"));
  const idx = JSON.parse(readFileSync(new URL("../data/osm_index.json", import.meta.url), "utf8"));
  assert.deepEqual(validateWinterClosures(data, idx), []);
  const list = normalizeClosures(data);
  assert.equal(list.length, data.passes.length);
  for (const id of ["stelvio", "gavia", "galibier", "furka", "glockner", "tourmalet"]) assert.ok(list.some((p) => p.id === id), id);
  // the open-all-year Dolomite passes are NOT in the file: a wrong "closed" hides a good ride
  for (const n of ["Pordoi", "Sella", "Gardena", "Giau", "Falzarego", "Bernina", "Maloja", "Tonale"]) assert.ok(!list.some((p) => p.name.includes(n)), n);
});

test("validateWinterClosures: catches bad windows, missing sources and a pass far from every climb", () => {
  const bad = { passes: [
    { id: "a", name: "A", lat: 46, lon: 10, closes: ["13-01", "11-10"], opens: null, sources: ["https://x"] },
    { id: "a", name: "B", lat: 46, lon: 10, closes: null, opens: null, sources: [] },
    { id: "c", name: "C", lat: 46, lon: 10, closes: null, opens: null, sources: ["https://x"], now: { closed: "yes" } },
    { id: "d", name: "D", lat: 46, lon: 10, closes: null, opens: null, sources: ["https://x"], now: { closed: true, checked: "11/11/2026", source: "https://x", since: "2026-11-10", reopens: "2026-11-01" } },
    { id: "e", name: "E", lat: 40, lon: 10, closes: null, opens: null, sources: ["https://x"] }
  ] };
  const e = validateWinterClosures(bad, [{ lat: 46, lon: 10 }]).join("\n");
  assert.match(e, /\[0\] \(a\): "closes" must be null or two MM-DD/);
  assert.match(e, /\[1\] \(a\): duplicate id/);
  assert.match(e, /\[1\] \(a\): "sources" must list https links/);
  assert.match(e, /\[2\] \(c\): now.closed must be true or false/);
  assert.match(e, /\[3\] \(d\): now.checked must be yyyy-mm-dd/);
  assert.match(e, /\[3\] \(d\): now.reopens must come after now.since/);
  assert.match(e, /\[4\] \(e\): no published climb within 1 km/);
  assert.deepEqual(validateWinterClosures({}), ["winter_closures.json: root must be an object with a \"passes\" array"]);
});

test("closureTag: the red/orange tag of the lists (Oggi, map cards, search, Vicino a me)", () => {
  assert.deepEqual(closureTag(STELVIO, "2026-11-11"), { text: "Chiusa", tone: "bad" }, "almost surely closed");
  assert.deepEqual(closureTag(STELVIO, "2026-10-30"), { text: "Forse chiusa", tone: "warn" }, "closing window");
  assert.equal(closureTag(STELVIO, "2026-07-15"), null, "summer: no tag");
  assert.equal(closureTag(null, "2026-11-11"), null, "not a pass of the file");
  const open = { ...STELVIO, now: { closed: false, checked: "2026-11-10", source: "https://a" } };
  assert.equal(closureState(open, "2026-11-11"), null);
  assert.equal(closureTag(open, "2026-11-11"), null, "a recent check says open: no tag");
  const shut = { ...STELVIO, now: { closed: true, since: "2026-10-20", checked: "2026-10-21", source: "https://a" } };
  assert.deepEqual(closureTag(shut, "2026-10-22"), { text: "Chiusa", tone: "bad" }, "closed now, even before the usual window");
});
