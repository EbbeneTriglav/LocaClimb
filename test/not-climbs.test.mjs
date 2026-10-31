/*
 * data/not_climbs.json: OSM passes a human checked and found are no road climb. Both builders drop
 * them (scripts/lib/notclimbs.mjs); this guards the file shape and the loader's failure modes.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { notClimbIds, loadNotClimbs } from "../scripts/lib/notclimbs.mjs";

test("ids are the keys, notes are ignored", () => {
  const s = notClimbIds({ _note: "x", "osm-1": { why: "a" }, "osm-2": { why: "b" } });
  assert.deepEqual([...s].sort(), ["osm-1", "osm-2"]);
  assert.equal(notClimbIds(null).size, 0);
});

test("missing file -> nothing hidden; broken file -> the build fails", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "nc-"));
  assert.equal((await loadNotClimbs(path.join(dir, "none.json"))).size, 0);
  const bad = path.join(dir, "bad.json");
  await writeFile(bad, "{ nope", "utf8");
  await assert.rejects(loadNotClimbs(bad));
});

test("data/not_climbs.json: OSM ids, each with a name and a reason; Schnalser Schartl is out", async () => {
  const o = JSON.parse(await readFile(new URL("../data/not_climbs.json", import.meta.url), "utf8"));
  for (const [k, v] of Object.entries(o)) {
    if (k.startsWith("_")) continue;
    assert.match(k, /^osm-\d+$/, k);
    assert.ok(v && v.name && v.why && v.why.length > 20, k + ": needs name and a real reason");
  }
  assert.ok((await loadNotClimbs()).has("osm-94950235"));
});

test("both builders apply the list", async () => {
  for (const f of ["build_osm_index.mjs", "build_osm_passes.mjs"]) {
    const src = await readFile(new URL("../scripts/" + f, import.meta.url), "utf8");
    assert.match(src, /loadNotClimbs\(\)/, f);
  }
});
