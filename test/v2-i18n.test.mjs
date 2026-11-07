import { test } from "node:test";
import assert from "node:assert/strict";
import { translate, DICT, monthsFor } from "../v2/lib/i18n.mjs";

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

/* ---------------------------------------------------------------- Español (02/11/2026) */
import { DICT_ES, RULES_ES } from "../v2/lib/i18n_es.mjs";
import { DICT as DICT_ALL, RULES as RULES_ALL, translate as tr } from "../v2/lib/i18n.mjs";
test("Spanish: every Italian label of the dictionary has its Spanish twin, and nothing extra", () => {
  assert.deepEqual(Object.keys(DICT_ALL).filter((k) => !(k in DICT_ES)), []);
  assert.deepEqual(Object.keys(DICT_ES).filter((k) => !(k in DICT_ALL)), []);
  for (const [k, v] of Object.entries(DICT_ES)) assert.ok(typeof v === "string" && (v.trim() || !k.trim()), k);
});
test("Spanish: the dynamic rules follow the same patterns, in the same order", () => {
  assert.equal(RULES_ES.length, RULES_ALL.length);
  RULES_ALL.forEach(([re], i) => assert.equal(String(RULES_ES[i][0]), String(re), "rule " + i));
});
test("Spanish: labels, rules and the English default", () => {
  assert.equal(tr("Cerca salita, passo o località", "es"), "Busca subida, puerto o lugar");
  assert.equal(tr("Da Mazzo di Valtellina", "es"), "Desde Mazzo di Valtellina");
  assert.equal(tr("12 voti", "es"), "12 votos");
  assert.equal(tr("1 voto", "es"), "1 voto");
  assert.equal(tr("3.043 salite qui", "es"), "3.043 subidas aquí");
  assert.equal(tr("Oggi", "es"), "Hoy");
  assert.equal(tr("Oggi"), "Today", "English stays the default of translate()");
  assert.equal(tr("Passo del Mortirolo", "es"), "Passo del Mortirolo", "names are never translated");
});

test("Sole e ombra: month names in the page language, dynamic labels translated", () => {
  assert.equal(monthsFor("it")[10], "Nov");
  assert.equal(monthsFor("en")[0], "Jan");
  assert.equal(monthsFor("es")[0], "Ene");
  assert.equal(monthsFor("xx"), monthsFor("it"), "unknown language falls back to Italian");
  for (const l of ["it", "en", "es"]) assert.equal(monthsFor(l).length, 12, l);
  assert.equal(translate("di ombra a Nov"), "shade in Nov");
  assert.equal(translate("di ombra a nov", "es"), "de sombra en nov");
  assert.equal(translate("bosco 41% · rilievi 12%"), "forest 41% · terrain 12%");
  assert.equal(translate("bosco 41% · rilievi 12%", "es"), "bosque 41% · relieve 12%");
  assert.equal(translate("sole diretto 6,5 h"), "direct sun 6,5 h");
  assert.equal(translate("sole diretto 6,5 h", "es"), "sol directo 6,5 h");
  assert.equal(translate("Ombra mese per mese"), "Shade month by month");
  assert.equal(translate("Ombra mese per mese", "es"), "Sombra mes a mes");
});
