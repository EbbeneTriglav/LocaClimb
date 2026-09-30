/*
 * myclimbs.js: merging GPX climbs into "Le mie salite" without inflating counts,
 * and gcRideDate from gpxclimbs.js.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const ctx = {}; vm.createContext(ctx);
vm.runInContext(await readFile(new URL("../js/gpxclimbs.js", import.meta.url), "utf8"), ctx);
vm.runInContext(await readFile(new URL("../js/myclimbs.js", import.meta.url), "utf8"), ctx);
const plain = (x) => JSON.parse(JSON.stringify(x));

const en = (o) => ({ passId: "stelvio", name: "Passo dello Stelvio", lat: 46.53, lon: 10.45, elevation: 2758, side: "Da Bormio", date: "2026-07-12", km: 21.5, gain: 1530, ...o });

test("same ride uploaded twice counts once", () => {
  let d = ctx.mcMerge(null, en());
  d = ctx.mcMerge(d, en());
  assert.deepEqual(plain(d.dates), ["2026-07-12"]);
  assert.deepEqual(plain(d.sides), { "Da Bormio": ["2026-07-12"] });
});

test("another day and another side accumulate; first/last dates follow", () => {
  let d = ctx.mcMerge(null, en());
  d = ctx.mcMerge(d, en({ date: "2025-08-01", side: "Da Prato allo Stelvio", gain: 1840 }));
  assert.deepEqual(plain(d.dates), ["2025-08-01", "2026-07-12"]);
  assert.equal(d.firstAt, "2025-08-01");
  assert.equal(d.lastAt, "2026-07-12");
  assert.equal(Object.keys(d.sides).length, 2);
  assert.equal(d.best.gain, 1840);
});

test("a GPX without date is stored but does not become first/last date", () => {
  const d = ctx.mcMerge(null, en({ date: null }));
  assert.deepEqual(plain(d.dates), ["senza-data"]);
  assert.equal(d.lastAt, null);
});

test("stats: passes, days, sides, highest", () => {
  const a = ctx.mcMerge(ctx.mcMerge(null, en()), en({ date: "2026-07-20", side: "Da Prato allo Stelvio" }));
  const b = ctx.mcMerge(null, en({ passId: "giau", name: "Passo Giau", elevation: 2236, side: "?" }));
  const s = ctx.mcStats([a, b]);
  assert.equal(s.passes, 2);
  assert.equal(s.times, 3);
  assert.equal(s.sides, 3);
  assert.equal(s.top.name, "Passo dello Stelvio");
});

test("only climbs of known passes become entries (unnamed ones must be proposed first)", () => {
  const res = { date: "2026-07-12", climbs: [
    { km: 8, gain: 500, match: { kind: "known", side: "Da Bormio", pass: { id: "stelvio", name: "Stelvio", lat: 1, lon: 2, elevation: 2758 } } },
    { km: 5, gain: 300, match: { kind: "newside", pass: { id: "osm-1", name: "X", lat: 1, lon: 2 } } },
    { km: 4, gain: 250, match: { kind: "new" } }
  ] };
  const e = ctx.mcEntriesFrom(res);
  assert.equal(e.length, 2);
  assert.equal(e[0].side, "Da Bormio");
  assert.equal(e[1].passId, "osm-1");
});

test("gcRideDate reads the first <time> of the GPX", () => {
  assert.equal(ctx.gcRideDate("<metadata><time>2026-07-12T06:31:00Z</time></metadata>"), "2026-07-12");
  assert.equal(ctx.gcRideDate("<gpx></gpx>"), null);
});
