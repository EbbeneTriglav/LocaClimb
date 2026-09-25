/*
 * Unit coverage for comparePass()/resolveEntry() in scripts/lib/golden.mjs, against
 * hand-built fixtures - proves the golden guard actually catches the regressions it
 * exists for (a lost versante above all) and stays quiet on DEM-level noise.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { comparePass, resolveEntry, snapshotPass, compareStats } from "../scripts/lib/golden.mjs";

const vBormio = { side: "Da Bormio", startLat: 46.4683, startLon: 10.3708, startElevation: 1225, endElevation: 2758, distance_km: 21.5, avgGradient: 7.1 };
const vPrato = { side: "Da Prato", startLat: 46.6170, startLon: 10.5920, startElevation: 915, endElevation: 2758, distance_km: 24.3, avgGradient: 7.4 };
const pass = { id: "stelvio", name: "Passo dello Stelvio", lat: 46.5285, lon: 10.4534, elevation: 2758, versanti: [vBormio, vPrato], _src: "curated" };
const base = snapshotPass(pass);
const clone = (o) => JSON.parse(JSON.stringify(o));

test("identical data passes cleanly", () => {
  assert.deepEqual(comparePass(base, clone(pass)), { errors: [], warnings: [] });
});

test("a lost versante fails (the Stelvio/Bormio regression)", () => {
  const cur = { ...clone(pass), versanti: [clone(vPrato)] };
  const { errors } = comparePass(base, cur);
  assert.ok(errors.some((e) => e.includes("versanti 2 -> 1")));
  assert.ok(errors.some((e) => e.includes("Da Bormio") && e.includes("non trovato")));
});

test("a versante whose start moved far away counts as lost", () => {
  const cur = clone(pass); cur.versanti[0].startLat += 0.05; // ~5.5 km
  assert.ok(comparePass(base, cur).errors.some((e) => e.includes("Da Bormio")));
});

test("DEM-level noise stays within tolerance", () => {
  const cur = clone(pass);
  cur.elevation += 12; cur.lat += 0.001;
  cur.versanti[0].distance_km = 21.9; cur.versanti[0].endElevation += 20; cur.versanti[0].avgGradient = 7.4;
  assert.deepEqual(comparePass(base, cur).errors, []);
});

test("summit jump, big km/gain/gradient drift all fail", () => {
  const cur = clone(pass);
  cur.lat += 0.02;                        // ~2.2 km
  cur.versanti[1].distance_km = 30;       // +5.7 km, +23%
  cur.versanti[1].startElevation = 1400;  // gain 1843 -> 1358
  cur.versanti[1].avgGradient = 5.0;
  const e = comparePass(base, cur).errors.join("\n");
  assert.match(e, /vetta spostata/);
  assert.match(e, /distanza/);
  assert.match(e, /dislivello/);
  assert.match(e, /pendenza media/);
});

test("a vanished pass fails; an extra versante only warns", () => {
  assert.ok(comparePass(base, undefined).errors[0].includes("SPARITO"));
  const cur = clone(pass); cur.versanti.push({ ...clone(vBormio), side: "Da Santa Maria", startLat: 46.60, startLon: 10.43 });
  const r = comparePass(base, cur);
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => w.includes("2 -> 3")));
});

test("resolveEntry refuses to guess on ambiguous names", () => {
  const data = { all: [
    { id: "osm-1", name: "Passo San Pellegrino", elevation: 1918 },
    { id: "osm-2", name: "Passo San Pellegrino in Alpe", elevation: 1525 }
  ] };
  assert.equal(resolveEntry({ name: "passo san pellegrino" }, data).pass.id, "osm-1", "exact match wins over substring");
  assert.match(resolveEntry({ name: "San Pellegrino" }, data).error, /ambiguous/);
  assert.equal(resolveEntry({ id: "osm-2" }, data).pass.id, "osm-2");
  assert.match(resolveEntry({ id: "nope" }, data).error, /not found/);
});

test("compareStats fails on a >3% drop, warns on big growth, ignores missing baseline", () => {
  const base = { osm: 3000, osmEnriched: 2500, versantiTotal: 5200, curated: 37 };
  assert.deepEqual(compareStats(base, { ...base }).errors, []);
  assert.match(compareStats(base, { ...base, osmEnriched: 2300 }).errors[0], /osmEnriched 2500 -> 2300/);
  assert.deepEqual(compareStats(base, { ...base, osmEnriched: 2460 }).errors, [], "-1.6% is noise");
  assert.ok(compareStats(base, { ...base, osm: 3600 }).warnings.length === 1);
  assert.deepEqual(compareStats(undefined, base), { errors: [], warnings: [] });
});
