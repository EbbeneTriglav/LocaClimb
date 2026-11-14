/*
 * Passo Pantani (Monte Carpegna), added by hand at Rick's request (14/11/2026): the climb Marco Pantani trained
 * on, with his story in the description and the barriers of the stretch closed to traffic in the tips.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { validatePass } from "../scripts/validate_data.mjs";

async function passes() {
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(await readFile(new URL("../data/passes_data.js", import.meta.url), "utf8"), ctx);
  return ctx.PASSES_DATA;
}

test("passes_data.js: Passo Pantani is curated, with Pantani's story and the barriers", async () => {
  const p = (await passes()).find((x) => x.id === "passo-pantani");
  assert.ok(p, "passo-pantani is in passes_data.js");
  assert.deepEqual(validatePass(p, "passo-pantani"), []);
  assert.match(p.name, /Pantani/); assert.match(p.name, /Carpegna/);
  assert.match(p.description, /Marco Pantani/);
  assert.ok(p.tips.some((t) => /sbarre/.test(t) && /chiusa al traffico/.test(t)), "the closed stretch and its barriers are in the tips");
  const carp = p.versanti.find((v) => v.side === "Carpegna");
  assert.ok(carp && carp.avgGradient > 10 && carp.distance_km > 5 && carp.endElevation > 1350, "the Carpegna side: ~6 km over 10%");
  assert.ok(p.versanti.every((v) => Math.abs(v.endElevation - p.elevation) <= 10), "both sides end at the same top");
  for (const v of p.versanti) {
    assert.ok(v.track && v.track.length > 50, v.side + ": the road is drawn");
    assert.ok(Math.abs(v.track[0][0] - v.startLat) < 1e-3 && Math.abs(v.track.at(-1)[0] - p.lat) < 1e-3 && Math.abs(v.track.at(-1)[1] - p.lon) < 1e-3, v.side + ": from its base to the top");
  }
});
