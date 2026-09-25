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
    assert.match(k, /^osm-\d+$/, k);
    assert.ok(v.name || v.sides, k + ": needs name or sides");
  }
});
