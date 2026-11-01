import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hintKeyFor } from "../scripts/lib/hints.mjs";

const hints = JSON.parse(readFileSync(new URL("../data/base_hints.json", import.meta.url), "utf8"));
test("the Dolomites pass and the Tuscan one each get their own hint", () => {
  assert.equal(hintKeyFor("Passo San Pellegrino", hints), "Passo San Pellegrino");
  assert.equal(hintKeyFor("Passo San Pellegrino in Alpe", hints), "San Pellegrino in Alpe");
  assert.equal(hintKeyFor("Salita presso San Pellegrino In Alpe", hints), "San Pellegrino in Alpe");
});
test("the key must be inside the name, not the reverse", () => {
  assert.equal(hintKeyFor("Passo del Mortirolo", hints), "Mortirolo");
  assert.equal(hintKeyFor("Passo", hints), null);
  assert.equal(hintKeyFor("Pellegrino", hints), null);
});
test("hyphens do not matter, accents do (01/11/2026: Croix-de-Fer and Grand Saint-Bernard hints were never applied)", () => {
  assert.equal(hintKeyFor("Col de la Croix-de-Fer", hints), "Croix de Fer");
  assert.equal(hintKeyFor("Col du Grand Saint-Bernard", hints), "Grand-Saint-Bernard");
  assert.equal(hintKeyFor("Col des Sagnes", hints), null, "'Agnès' must not match 'Sagnes'");
  assert.equal(hintKeyFor("Col de Portet d'Aspet", hints), null, "the Saint-Girons hint is for the discover climb only");
});
test("European icons: Ventoux, Angliru, Simplon, Sa Calobra get their classic bases", () => {
  assert.deepEqual(hints[hintKeyFor("Mont Ventoux", hints)], ["Bédoin", "Malaucène", "Sault"]);
  assert.equal(hints[hintKeyFor("Angliru", hints)][0][2], "La Vega");
  assert.equal(hintKeyFor("Simplonpass", hints), "Simplon");
  assert.deepEqual(hints[hintKeyFor("Coll dels Reis", hints)], ["Sa Calobra"]);
});
test("base_hints.json has no duplicate keys (JSON.parse would silently keep only the last)", () => {
  const raw = readFileSync(new URL("../data/base_hints.json", import.meta.url), "utf8");
  const keys = [...raw.matchAll(/^ "((?:[^"\\]|\\.)*)":/gm)].map((m) => m[1]);
  assert.equal(keys.length, Object.keys(hints).length);
});
