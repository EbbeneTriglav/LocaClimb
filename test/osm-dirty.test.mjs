import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { changedEntries, filesFor, dirtyTargets } from "../scripts/osm_dirty.mjs";

test("climbs_extra: added, moved and removed entries count; untouched ones do not", () => {
  const prev = [{ id: "a", lat: 45, lon: 7 }, { id: "b", lat: 46, lon: 8 }, { id: "c", lat: 44, lon: 6 }];
  const cur = [{ id: "a", lat: 45, lon: 7 }, { id: "b", lat: 46.01, lon: 8 }, { id: "d", lat: 43, lon: 5 }];
  const ids = changedEntries(prev, cur, "extra").map((e) => e.id + "@" + e.lat).sort();
  assert.deepEqual(ids, ["x-b@46", "x-b@46.01", "x-c@44", "x-d@43"]);
  assert.equal(changedEntries(null, cur, "extra").length, 3, "a new file: every entry");
});

test("not_climbs: changed keys, notes ignored", () => {
  const prev = { _note: "x", "osm-1": { name: "A", why: "w" } };
  const cur = { _note: "y", "osm-1": { name: "A", why: "w" }, "osm-2": { name: "B", why: "w" } };
  assert.deepEqual(changedEntries(prev, cur, "not"), [{ kind: "not", key: "osm-2", id: "osm-2" }]);
});

test("a place belongs to the file that holds its id or a pass within 5 km", () => {
  const files = {
    "osm_passes_xb_fr.json": [{ id: "osm-9573882634", lat: 44.33, lon: 6.81 }],
    "osm_passes_fr_mp.json": [{ id: "osm-1", lat: 42.80, lon: 0.50 }],
    "osm_passes_es_n.json": [{ id: "osm-2", lat: 43.2, lon: -2.4 }]
  };
  assert.deepEqual(filesFor({ id: "osm-9573882634" }, files), ["osm_passes_xb_fr.json"], "not_climbs id: the file still holding it");
  assert.deepEqual(filesFor({ id: "osm-404" }, files), [], "already gone: nothing to rebuild");
  assert.deepEqual(filesFor({ id: "x-col-de-peyresourde", lat: 42.802, lon: 0.463 }, files), ["osm_passes_fr_mp.json"], "new x-: nearest region");
});

test("dirty = the entry at the file's last build differs from now (content, not dates); Italy goes to osm-refresh", () => {
  const zones = [{ id: "confine-it-fr", out: "osm_passes_xb_fr.json" }, { id: "france-midi-pyrenees", out: "osm_passes_fr_mp.json" }, { id: "france-est", out: "osm_passes_fr_est.json" }];
  const files = {
    "osm_passes_xb_fr.json": [{ id: "osm-9573882634", lat: 44.33, lon: 6.81 }],
    "osm_passes_fr_mp.json": [{ id: "osm-1", lat: 42.80, lon: 0.50 }],
    "osm_passes_fr_est.json": [{ id: "osm-4", lat: 47.97, lon: 7.05 }],
    "osm_passes.json": [{ id: "osm-3", lat: 45.9, lon: 9.4 }]
  };
  const pey = { id: "col-de-peyresourde", lat: 42.80231, lon: 0.46308 }, platz = { id: "col-du-platzerwasel", lat: 47.9695, lon: 7.04289 };
  const ts = { name: "Cime des Trois Serrieres", why: "peak above the road" };
  const before = { extra: [], not: {} }, now = { extra: [pey, platz], not: { "osm-9573882634": ts } };
  const entries = [...changedEntries(before.extra, now.extra, "extra"), ...changedEntries(before.not, now.not, "not")];
  // france-est was rebuilt AFTER the PR commit but BEFORE its merge: built with the old file -> still dirty
  const builtWith = { "osm_passes_xb_fr.json": before, "osm_passes_fr_mp.json": before, "osm_passes_fr_est.json": before, "osm_passes.json": now };
  assert.deepEqual(dirtyTargets(entries, files, now, (f) => builtWith[f], zones), ["france-midi-pyrenees", "france-est", "confine-it-fr"]);
  builtWith["osm_passes_xb_fr.json"] = now;   // rebuilt with the fix: clean
  builtWith["osm_passes_fr_mp.json"] = null;  // never built: dirty
  const poggio = { kind: "extra", key: "poggio", id: "x-poggio", lat: 45.91, lon: 9.41 };
  builtWith["osm_passes.json"] = before;
  assert.deepEqual(dirtyTargets([...entries, poggio], files, { ...now, extra: [...now.extra, { id: "poggio", lat: 45.91, lon: 9.41 }] }, (f) => builtWith[f], zones),
    ["france-midi-pyrenees", "france-est", "@refresh"]);
});

test("osm-rotate asks osm_dirty.mjs before its normal choice and Gate 1 rebuilds the index before validating", () => {
  const rot = readFileSync(new URL("../.github/workflows/osm-rotate.yml", import.meta.url), "utf8");
  const d = rot.indexOf("node scripts/osm_dirty.mjs"), n = rot.indexOf("node scripts/osm_priority.mjs --next");
  assert.ok(d > 0 && d < n, "dirty zones first");
  for (const f of ["osm-expand.yml", "osm-border.yml", "osm-refresh.yml"]) {
    const y = readFileSync(new URL("../.github/workflows/" + f, import.meta.url), "utf8");
    const g = y.slice(y.indexOf("Gate 1"));
    assert.ok(g.indexOf("build_osm_index.mjs") > 0 && g.indexOf("build_osm_index.mjs") < g.indexOf("validate_data.mjs"), f);
  }
});
