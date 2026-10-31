import { test } from "node:test";
import assert from "node:assert/strict";
import { levelOf, nextLevel, points, facts, flatTrack, proposalProblem, proposalDoc, unflat, maxGradient, MAXPTS } from "../v2/lib/propose.mjs";

// 3 km north at 8% (240 m), summit last
const tr = Array.from({ length: 61 }, (_, i) => [46 + i * 0.00045, 10, 500 + i * 4]);
test("levels: accepted climbs count, a second side half", () => {
  assert.equal(points([{ status: "approved" }, { status: "approved", secondSide: true }, { status: "pending" }, { status: "rejected" }]), 1.5);
  assert.equal(levelOf(0).it, "Foresto"); assert.equal(levelOf(1.5).it, "Turista del pedale"); assert.equal(levelOf(15).it, "Local Rider");
  assert.equal(nextLevel(1.5).it, "Cane Sciolto"); assert.equal(nextLevel(20), null);
});
test("facts: average, max over ~100 m, exposure faces away from the summit", () => {
  const f = facts(tr, 3, 240);
  assert.equal(f.avgGradient, 8); assert.ok(Math.abs(f.maxGradient - 8) < 0.5, String(f.maxGradient));
  assert.equal(f.exposure, "Sud"); assert.equal(f.startElevation, 500); assert.equal(f.endElevation, 740);
  assert.equal(maxGradient([[46, 10, null], [46.001, 10, null]]), 0);
});
test("flatTrack: at most 800 points, ends kept; unflat inverts it", () => {
  const long = Array.from({ length: 2000 }, (_, i) => [46 + i * 1e-4, 10, 100 + i]);
  const fl = flatTrack(long);
  assert.equal(fl.length, MAXPTS * 3); assert.deepEqual(fl.slice(-3), [46.1999, 10, 2099]);
  assert.deepEqual(unflat(flatTrack(tr.slice(0, 2))), [[46, 10, 500], [46.00045, 10, 504]]);
});
test("proposal: what the rules accept (pending, own uid, name 3-70, flat <= 2400, 0 < km < 60)", () => {
  assert.match(proposalProblem({ km: 1, gain: 300 }), /troppo corto/);
  assert.match(proposalProblem({ km: 70, gain: 3000 }), /Troppo lungo/);
  assert.equal(proposalProblem({ km: 3, gain: 240 }), null);
  const d = proposalDoc({ uid: "u1", email: "rick@x.it" }, { name: "  Monte Nerone ", side: "", note: "fondo ok" }, facts(tr, 3, 240), tr, 9);
  assert.equal(d.uid, "u1"); assert.equal(d.author, "rick"); assert.equal(d.status, "pending"); assert.equal(d.name, "Monte Nerone");
  assert.equal(d.side, "Versante unico"); assert.ok(d.flat.length <= 2400); assert.ok(d.km > 0 && d.km < 60); assert.equal(d.createdAt, 9);
  assert.equal(d.lat, 46.027);
});
