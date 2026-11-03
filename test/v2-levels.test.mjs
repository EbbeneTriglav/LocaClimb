import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { levelOf, nextLevel, GLOBAL_LEVELS, LEVELS, pointsByArea, points } from "../v2/lib/propose.mjs";
import { regionAt, inRing } from "../v2/lib/regions.mjs";

const REG = JSON.parse(readFileSync(new URL("../data/regions_it.json", import.meta.url), "utf8"));

test("regions_it.json: the 20 Italian regions, small enough for the profile page", () => {
  assert.equal(REG.regions.length, 20);
  assert.ok(readFileSync(new URL("../data/regions_it.json", import.meta.url)).length < 120000);
});

test("summits fall in the right region", () => {
  assert.equal(regionAt(REG, 44.4787, 11.2992), "Emilia-Romagna");   // San Luca
  assert.equal(regionAt(REG, 46.5286, 10.4532), "Lombardia");        // Stelvio
  assert.equal(regionAt(REG, 46.4826, 12.0537), "Veneto");           // Passo Giau
  assert.equal(regionAt(REG, 42.1488, 14.1138), "Abruzzo");          // Blockhaus
  assert.equal(regionAt(REG, 37.7981, 15.0384), "Sicilia");          // Etna Nord
  assert.equal(regionAt(REG, 45.9356, 7.6304), "Valle d'Aosta");     // Cervinia
  assert.equal(regionAt(REG, 45.0927, 6.0719), null);                // Alpe d'Huez: not Italy
  assert.equal(inRing(0.5, 0.5, [[0, 0], [1, 0], [1, 1], [0, 1]]), true);
});

test("levels by region with the usual thresholds, global badge with higher ones", () => {
  const area = (r) => r.area;
  const rows = [
    ...Array.from({ length: 15 }, () => ({ status: "approved", area: "Emilia-Romagna" })),
    { status: "approved", area: "Toscana" }, { status: "approved", area: "Toscana", secondSide: true },
    { status: "pending", area: "Toscana" }, { status: "rejected", area: "Liguria" }
  ];
  const a = pointsByArea(rows, area);
  assert.deepEqual(a.map((x) => [x.area, x.pts, x.lv.it]), [["Emilia-Romagna", 15, "Local Rider"], ["Toscana", 1.5, "Turista del pedale"]]);
  assert.equal(points(rows), 16.5);
  assert.equal(levelOf(16.5, GLOBAL_LEVELS).it, "Esploratore");
  assert.equal(nextLevel(16.5, GLOBAL_LEVELS).it, "Cartografo");
  assert.equal(levelOf(16.5).it, LEVELS[3].it);                    // default list is still the regional one
  assert.ok(GLOBAL_LEVELS[1].min > LEVELS[2].min);                 // the global thresholds are higher
  assert.deepEqual(pointsByArea([{ status: "approved" }], () => null).map((x) => x.area), ["Altro"]);
});
