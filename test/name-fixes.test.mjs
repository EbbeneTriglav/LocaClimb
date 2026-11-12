/*
 * applyNameFixes(): data/name_fixes.json renames OSM passes and side labels by id,
 * display-only (geometry untouched), and the shipped file is well-formed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadApp } from "./helpers/load-app.mjs";

const app = await loadApp();

test("renames a pass and a side label by id, leaves the rest alone", () => {
  app.NAME_FIX = { "osm-1": { name: "Passo del Cerreto" }, "osm-2": { sides: { "Da Sestriere": "Da Usseaux" } } };
  const a = { id: "osm-1", name: "Passo Crocetta", lat: 44.3, lon: 10.22 };
  const b = { id: "osm-2", name: "Colle delle Finestre", versanti: [{ side: "Da Susa" }, { side: "Da Sestriere", startLat: 45.04 }] };
  const c = { id: "osm-3", name: "Altro" };
  app.osmPasses.length = 0; app.osmPasses.push(a, b, c);
  app.applyNameFixes();
  assert.equal(a.name, "Passo del Cerreto");
  assert.equal(a.lat, 44.3);
  assert.equal(b.versanti[0].side, "Da Susa");
  assert.equal(b.versanti[1].side, "Da Usseaux");
  assert.equal(b.versanti[1].startLat, 45.04);
  assert.equal(c.name, "Altro");
});

test("no fixes loaded yet -> no-op", () => {
  app.NAME_FIX = null;
  const a = { id: "osm-1", name: "Passo Crocetta" };
  app.osmPasses.length = 0; app.osmPasses.push(a);
  app.applyNameFixes();
  assert.equal(a.name, "Passo Crocetta");
});

test("data/name_fixes.json: every entry is keyed by an OSM id and has name or sides", async () => {
  const o = JSON.parse(await readFile(new URL("../data/name_fixes.json", import.meta.url), "utf8"));
  for (const [k, v] of Object.entries(o)) {
    if (k.startsWith("_")) continue;
    assert.match(k, /^osm-(\d+|rt\d+x-?\d+)$/, k);   // an OSM node, or a climb found on the road network (osm-rt<lat>x<lon>)
    assert.ok(v.name || v.sides, k + ": needs name or sides");
  }
});

test("data/name_fixes.json: every renamed road-network climb exists in the index, and no fix brings back a street name", async () => {
  const o = JSON.parse(await readFile(new URL("../data/name_fixes.json", import.meta.url), "utf8"));
  const idx = JSON.parse(await readFile(new URL("../data/osm_index.json", import.meta.url), "utf8"));
  const ids = new Set((Array.isArray(idx) ? idx : idx.passes || []).map((p) => String(p.id)));
  for (const [k, v] of Object.entries(o)) {
    if (k.startsWith("_")) continue;
    // road-network climbs are keyed by their summit (osm-rt<lat>x<lon>): a rebuild that moves the summit changes the id
    if (k.startsWith("osm-rt")) assert.ok(ids.has(k), k + ": not in osm_index.json (typo, or the climb was rebuilt under another id)");
    if (v.name) assert.ok(!/(stra(ss|ß)e|weg)\b|^(via|route|rue|chemin|strada)\b/i.test(v.name), k + ": " + v.name);
  }
});
