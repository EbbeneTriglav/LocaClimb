// scripts/lib/extraroads.mjs: track/service roads only around the forced climbs (22/11/2026: Blockhaus,
// Alpe Motta and others ended on a track and were "no road" at every run).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { extraBoxes, extractConfigs, EXTRA_HW } from "../scripts/lib/extraroads.mjs";

test("one box per forced climb inside the clip, none outside", () => {
  const ex = [{ lat: 42.14876, lon: 14.11381 }, { lat: 46.49892, lon: 9.45271 }, { lat: 45.77, lon: 2.96 }];
  const b = extraBoxes(ex, "6.6,36.6,18.6,47.1");
  assert.equal(b.length, 2);
  assert.deepEqual(b[0], [14.08381, 42.11876, 14.14381, 42.17876]);
  assert.equal(extraBoxes(ex, "").length, 3, "no clip: every climb");
  assert.equal(extraBoxes([{ lat: NaN, lon: 1 }], "").length, 0);
});

test("overlapping boxes merge into one", () => {
  const b = extraBoxes([{ lat: 45.0, lon: 9.0 }, { lat: 45.02, lon: 9.03 }, { lat: 46.0, lon: 9.0 }], "");
  assert.equal(b.length, 2);
  assert.deepEqual(b[0], [8.97, 44.97, 9.06, 45.05]);
});

test("osmium extract configs: bounded boxes per pass, unique outputs", () => {
  const boxes = Array.from({ length: 450 }, (_, i) => [i, 0, i + 0.5, 1]);
  const c = extractConfigs(boxes, "/w");
  assert.equal(c.length, 3);
  assert.equal(c[0].extracts.length, 200); assert.equal(c[2].extracts.length, 50);
  assert.equal(c[2].extracts[49].output, "xbox449.osm.pbf");
  assert.equal(c[0].directory, "/w");
  assert.deepEqual(c[1].extracts[0].bbox, [200, 0, 200.5, 1]);
});

test("only track and service, and the builder uses the step only outside --discover, without failing the build", async () => {
  assert.deepEqual(EXTRA_HW, ["track", "service"]);
  const src = await readFile(new URL("../scripts/build_osm_passes.mjs", import.meta.url), "utf8");
  assert.match(src, /if \(!DISC\) \{\s*let ex = \[\];/);
  assert.match(src, /track\/service step failed .*build goes on without it/);
});
