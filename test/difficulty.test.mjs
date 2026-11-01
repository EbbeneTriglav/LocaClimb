// Difficulty 1..10 (scripts/lib/difficulty.mjs = v2/lib/difficulty.mjs): one scale, 10 for the giants only.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../scripts/lib/difficulty.mjs";
import * as V from "../v2/lib/difficulty.mjs";

const side = (km, from, to) => ({ distance_km: km, startElevation: from, endElevation: to });

test("anchors: the giants 10, the classics in between, a short wall no longer 10", () => {
  assert.equal(S.passDifficulty([side(22, 1215, 2757), side(24.3, 950, 2757)]), 10);   // Stelvio
  assert.equal(S.passDifficulty([side(11.7, 551, 1790)]), 10);                        // Mortirolo da Mazzo
  assert.equal(S.passDifficulty([side(10.1, 525, 1735)]), 10);                        // Zoncolan da Ovaro
  assert.equal(S.difficultyOf(9.9, 922, 2236), 8);                                     // Giau da Selva
  assert.equal(S.difficultyOf(3.4, 321, 864), 4);                                      // Musberg (was 10)
  assert.equal(S.difficultyOf(2, 60, 400), 1);                                        // a ramp
  assert.equal(S.difficultyOf(0, 100, 500), 1);
  assert.equal(S.passDifficulty([]), null);
});

test("monotonic: longer or higher never makes it easier", () => {
  for (const km of [2, 5, 10, 20]) for (const g of [100, 400, 900, 1500]) {
    assert.ok(S.difficultyOf(km, g + 100, 1000 + g + 100) >= S.difficultyOf(km, g, 1000 + g));
  }
});

test("the app and the pipeline use the same function", () => {
  for (const km of [0, 1.2, 3.4, 9.9, 22, 40]) for (const g of [0, 50, 321, 922, 1800]) for (const top of [300, 1200, 2700]) {
    assert.equal(V.difficultyOf(km, g, top), S.difficultyOf(km, g, top), `${km} ${g} ${top}`);
  }
});
