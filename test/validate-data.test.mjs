import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateVersante, validatePass, validateCuratedOverrides,
  validateManualOverrides, validateClimbsExtra, validateOsmRegions, validatePassNews
} from "../scripts/validate_data.mjs";

const goodVersante = {
  side: "Da Bormio", startLat: 46.4683, startLon: 10.3708, startElevation: 1225, endElevation: 2758,
  distance_km: 21.5, avgGradient: 7.1, maxGradient: 14, traffic: "medio", exposure: "Ovest",
  elevationProfile: [1225, 1500, 1900, 2300, 2758]
};
const goodPass = {
  id: "stelvio", name: "Passo dello Stelvio", lat: 46.5285, lon: 10.4534, elevation: 2758,
  region: "Lombardia", status: "seasonal", difficulty: 10, versanti: [goodVersante]
};

test("validateVersante accepts a well-formed versante", () => {
  assert.deepEqual(validateVersante(goodVersante, "v"), []);
});

test("validateVersante rejects missing side, bad coordinates, downhill gain, bad distance", () => {
  const bad = { ...goodVersante, side: "", startLat: 200, endElevation: 1000, distance_km: -5 };
  const errs = validateVersante(bad, "v");
  assert.ok(errs.some((e) => e.includes("side")));
  assert.ok(errs.some((e) => e.includes("startLat")));
  assert.ok(errs.some((e) => e.includes("endElevation") && e.includes("startElevation")));
  assert.ok(errs.some((e) => e.includes("distance_km")));
});

test("validateVersante flags an elevationProfile that doesn't match start/end", () => {
  const bad = { ...goodVersante, elevationProfile: [0, 500, 1000] };
  const errs = validateVersante(bad, "v");
  assert.ok(errs.some((e) => e.includes("elevationProfile[0]")));
  assert.ok(errs.some((e) => e.includes("elevationProfile last point")));
});

test("validatePass accepts a well-formed pass", () => {
  assert.deepEqual(validatePass(goodPass, "p"), []);
});

test("validatePass rejects an unknown status (would silently render as chiuso)", () => {
  const errs = validatePass({ ...goodPass, status: "half-open" }, "p");
  assert.ok(errs.some((e) => e.includes("status")));
});

test("validatePass rejects out-of-range difficulty and unknown cat", () => {
  const errs = validatePass({ ...goodPass, difficulty: 11, cat: "5" }, "p");
  assert.ok(errs.some((e) => e.includes("difficulty")));
  assert.ok(errs.some((e) => e.includes("cat")));
});

test("validateCuratedOverrides flags an override id that doesn't exist in passes_data.js", () => {
  const errs = validateCuratedOverrides({ typo_id: { difficulty: 5 } }, new Set(["stelvio", "gavia"]));
  assert.ok(errs.some((e) => e.includes("typo_id") && e.includes("silently no-ops")));
});

test("validateCuratedOverrides accepts a known id with valid fields", () => {
  const errs = validateCuratedOverrides({ stelvio: { difficulty: 9, versanti: [goodVersante] } }, new Set(["stelvio"]));
  assert.deepEqual(errs, []);
});

test("validateManualOverrides requires versanti and validates new-pass fields", () => {
  const errs = validateManualOverrides({
    "manual-foo": { new: true, name: "", lat: 999, versanti: [] }
  }, "manual_overrides.json");
  assert.ok(errs.some((e) => e.includes("missing \"name\"")));
  assert.ok(errs.some((e) => e.includes("lat is not valid")));
  assert.ok(errs.some((e) => e.includes("elevation")));
  assert.ok(errs.some((e) => e.includes("non-empty \"versanti\"")));
});

test("validateManualOverrides accepts a well-formed edit-existing-pass entry", () => {
  const errs = validateManualOverrides({ grappa: { versanti: [goodVersante], updatedAt: "2026-07-01" } }, "manual_overrides.json");
  assert.deepEqual(errs, []);
});

test("validateClimbsExtra rejects entries missing required fields", () => {
  const errs = validateClimbsExtra([{ id: "x" }]);
  assert.ok(errs.some((e) => e.includes("name")));
  assert.ok(errs.some((e) => e.includes("lat")));
});

test("validateOsmRegions rejects non-.json entries", () => {
  const errs = validateOsmRegions(["osm_passes.json", "notes.txt"]);
  assert.ok(errs.some((e) => e.includes("notes.txt")));
});

test("validatePassNews skips underscore-prefixed metadata keys and validates items", () => {
  const errs = validatePassNews({
    _comment: "not a pass",
    stelvio: [{ date: "not-a-date", title: "", url: "ftp://bad" }]
  }, "pass_news.json");
  assert.ok(errs.some((e) => e.includes("title")));
  assert.ok(errs.some((e) => e.includes("date")));
  assert.ok(errs.some((e) => e.includes("url")));
  assert.ok(!errs.some((e) => e.includes("_comment")));
});
