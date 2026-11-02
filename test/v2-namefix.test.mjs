import { test } from "node:test";
import assert from "node:assert/strict";
import { displayName, setNameFixes, fixSides } from "../v2/lib/data.mjs";

test("v2 shows the name of data/name_fixes.json (as the classic app)", () => {
  setNameFixes({ "osm-1365010693": { name: "Prato Nevoso (Monte Malanotte)" }, "osm-428627679": { sides: { "Da Sestriere": "Da Usseaux" } } });
  assert.equal(displayName({ id: "osm-1365010693", name: "Monte Malanotte", elevation: 1742 }), "Prato Nevoso (Monte Malanotte)");
  assert.equal(displayName({ id: "osm-428627679", name: "Colle X" }), "Colle X"); // sides-only fix keeps the name
  assert.equal(displayName({ id: "osm-1", name: "Passo", elevation: 1200 }), "Passo a 1200 m");
  setNameFixes({});
});

test("name_fixes sides relabel the versanti", () => {
  const vs = [{ side: "Da Sestriere" }, { side: "Da Pragelato" }];
  fixSides(vs, { sides: { "Da Sestriere": "Da Usseaux" } });
  assert.deepEqual(vs.map((v) => v.side), ["Da Usseaux", "Da Pragelato"]);
  assert.equal(fixSides(vs, undefined), vs);
});
