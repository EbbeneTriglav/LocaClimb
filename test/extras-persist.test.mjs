// Forced climbs (data/climbs_extra.json, id "x-<id>") must survive every rebuild (Rick, 23/11/2026: "fai in
// modo che poi non si cancellino ad un nuovo run"). The builder starts from the region file on disk
// (byId = existing records): a forced climb that cannot be rebuilt this time (download, no road) keeps
// its last good record. These guards keep the three places that delete records away from "x-" ids.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const src = await readFile(new URL("../scripts/build_osm_passes.mjs", import.meta.url), "utf8");

test("the build starts from the records already on disk", () => {
  assert.match(src, /const byId = new Map\(existing\.map\(\(p\) => \[p\.id, p\]\)\);/);
});

test("a forced climb that fails this run is skipped, not deleted", () => {
  const loop = src.slice(src.indexOf("extra curated climbs (no mountain_pass node)"), src.indexOf("prune stale OSM orphans"));
  assert.ok(loop.length > 200);
  assert.match(loop, /no road"\); continue; \}/);
  assert.match(loop, /no climb"\); continue; \}/);
  assert.doesNotMatch(loop, /byId\.delete/);
});

test("stale-orphan pruning and the cross-pass dedup only ever remove OSM ids", () => {
  assert.match(src, /if \(id\.indexOf\("osm-"\) === 0 && !liveOsm\.has\(id\)\) \{ byId\.delete\(id\)/);
  assert.match(src, /if \(!isOsm\(weak\.id\) \|\| !weak\.versanti\.length\) continue; \/\/ only strip OSM; never extra\/curated/);
  assert.match(src, /if \(isOsm\(id\) && Array\.isArray\(r\.versanti\) && r\.versanti\.length === 0\) \{ byId\.delete\(id\)/);
});

test("every forced climb id is unique and well formed", async () => {
  const ex = JSON.parse(await readFile(new URL("../data/climbs_extra.json", import.meta.url), "utf8"));
  const ids = new Set();
  for (const x of ex) {
    assert.match(x.id, /^[a-z0-9][a-z0-9-]*$/, x.id);
    assert.ok(!ids.has(x.id), "duplicate " + x.id); ids.add(x.id);
    assert.ok(Number.isFinite(x.lat) && Number.isFinite(x.lon), x.id);
  }
});
