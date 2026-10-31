import { test } from "node:test";
import assert from "node:assert/strict";
import { translate, DICT } from "../v2/lib/i18n.mjs";

test("exact labels are translated, unknown text (names, comments) is left alone", () => {
  assert.equal(translate("Solo asfalto"), "Paved only");
  assert.equal(translate("Passo dello Stelvio"), "Passo dello Stelvio");
  assert.equal(translate("Bellissima salita, poco traffico"), "Bellissima salita, poco traffico");
});
test("surrounding spaces are kept", () => {
  assert.equal(translate("  Oggi \n"), "  Today \n");
});
test("dynamic labels by pattern", () => {
  assert.equal(translate("7.238 salite qui"), "7.238 climbs here");
  assert.equal(translate("7,238 salite qui"), "7,238 climbs here");
  assert.equal(translate("Difficoltà 9/10"), "Difficulty 9/10");
  assert.equal(translate("Da Bormio"), "From Bormio");
  assert.equal(translate("3 tappe"), "3 stops");
  assert.equal(translate("1 tappa"), "1 stop");
  assert.equal(translate("Parti entro le 11:00"), "Leave by 11:00");
  assert.equal(translate("Passo a 2959 m"), "Pass at 2959 m");
});
test("' · '-joined labels piece by piece", () => {
  assert.equal(translate("Difficoltà 8/10 · stagionale"), "Difficulty 8/10 · seasonal");
  assert.equal(translate("Da Bormio · 1225 → 2758 m"), "From Bormio · 1225 → 2758 m");
  assert.equal(translate("Stelvio · Gavia"), "Stelvio · Gavia");
});
test("dictionary has no empty translations", () => {
  for (const [k, v] of Object.entries(DICT)) assert.ok(typeof v === "string" && v.length, k);
});
test("a leading or trailing ' · ' separator does not block the match", () => {
  assert.equal(translate(" · 17 m dalla strada"), " · 17 m from the road");
  assert.equal(translate("punti acqua entro 100 m · "), "water points within 100 m · ");
});
test("the implausible-gradients warning is translated", () => {
  assert.match(translate("Pendenze non credibili per una strada asfaltata (max 72%): probabile errore del modello del terreno (galleria, ponte) o un tratto che non è una strada asfaltata. Per questo non compare tra le salite più dure."), /^Gradients not credible for a paved road \(max 72%\)/);
});
