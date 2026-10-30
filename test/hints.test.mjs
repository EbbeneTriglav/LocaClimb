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
