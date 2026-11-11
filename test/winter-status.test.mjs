// Winter status from the official/regular sites (scripts/winter_status.mjs, Rick 11/11/2026).
// The HTML below is cut from the real pages of 11/11/2026 (same tags and attributes).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseAlpenPaesse, parseMmv, parseCols, collect, nextNow, applyStatus, MAP, AP, MMV, COLS } from "../scripts/winter_status.mjs";

const apPage = (icons, h2) => `<div class="weather">x</div><div class="status-update-status"> ${icons.map((i) => `<div class="icon-circle"> <svg class="icon icon-status-${i} " > <use xlink:href="/_resources/themes/alpen-paesse/images/sprite_2026.svg#status-${i}"></use></svg> </div>`).join("")} </div></div><div class="status-update-content"> <h2>${h2}</h2> <div class="content "><p>Realp - Oberwald</p></div>`;
const FURKA = apPage(["closed", "winter"], "Closed for the winter");
const KLAUSEN = apPage(["open", "winter"], "Open, snow covered. Risk of slippery ice");
const SPLUGA = apPage(["open"], "Open, no restrictions");

const mmvRow = (img, name, note = "") => `<tr><td><img src="images/${img}" width="25"></td><td><a href="#"><img src="images/webcam-bis.jpg"></a></td><td><p><strong>${name}</strong></p></td><td><p><strong>${note}</strong></p></td></tr>`;
const MMV_HTML = `<table><tr><td><img src="images/semaforo_verde_fisso_e0i22flm.jpg"><img src="images/SEMAFORO_ROSSO_2_xs5o4hpu.jpg"></td><td>Passo alpino / aperto regolare transitabilità - road open. P asso alpino chiuso - road closed</td></tr>`
  + mmvRow("SEMAFORO_ROSSO_2_lenww9it.jpg", "passo Gavia<br>( sp 29 )", "CHIUSURA INVERNALE")
  + mmvRow("SEMAFORO_ROSSO_2_389rihke.jpg", "passo Mortirolo ( sp 81 )", "CHIUSURA INVERNALE")
  + mmvRow("SEMAFORO_ROSSO_2_d6xzsggl.jpg", "passo San Marco ( sp 8 )", "CHIUSURA INVERNALE")
  + mmvRow("SEMAFORO_ROSSO_2_7iip3odi.jpg", "passo Vivione ( sp 294 )", "CHIUSURA INVERNALE")
  + mmvRow("SEMAFORO_ROSSO_2_2ho0buap.jpg", "passo Crocedomini ( sp 345 )", "CHIUSURA INVERNALE")
  + mmvRow("SEMAFORO_ARANCIONE-2_ymfztupn.jpg", "passo dello Stelvio ( ss 38 )")
  + mmvRow("semaforo_verde_fisso_uobu56eh.jpg", "passo Forcola", "possibile chiusura invernale il 27 novembre, tempo permettendo.")
  + mmvRow("semaforo_verde_fisso_omleamih.jpg", "Arnoga (Valdidentro) ( ss 301 )") + "</table>";

const colRow = (name, open) => `<tr onclick="location.href='/recherche/${name}.htm'"> <td class="text-primary semibold">${name}</td> <td>2642 m</td> <td>Massif</td> <td><img src="https://charte.cols-cyclisme.com/picto-${open ? "ouvert" : "ferme"}.png" border="0" alt="Col ${open ? "ouvert" : "fermé"}" data-toggle="tooltip" title="Col ${open ? "ouvert" : "fermé"}" /></td> </tr>`;
const COLS_HTML = "<table>" + Object.values(MAP.cols).map((n) => colRow(n, n === "Col de la Colombière")).join("") + colRow("Col du Lautaret", true) + "</table>";

test("alpen-paesse: the status icons decide, the headline is the note", () => {
  assert.deepEqual(parseAlpenPaesse(FURKA), { closed: true, note: "Closed for the winter" });
  assert.deepEqual(parseAlpenPaesse(KLAUSEN), { closed: false, note: "Open, snow covered. Risk of slippery ice" }, "reopened on 9/11 after a snow closure");
  assert.equal(parseAlpenPaesse(SPLUGA).closed, false);
  assert.equal(parseAlpenPaesse("<html>maintenance</html>"), null, "page changed: no status, never a guess");
});

test("meteomontagnavaltellina: one row per pass, traffic light image", () => {
  const rows = parseMmv(MMV_HTML);
  const by = Object.fromEntries(rows.map((r) => [r.name, r]));
  assert.equal(by.Gavia.light, "red"); assert.equal(by.Gavia.note, "CHIUSURA INVERNALE");
  assert.equal(by.Mortirolo.light, "red");
  assert.equal(by["dello Stelvio"].light, "orange");
  assert.equal(by.Forcola.light, "green"); assert.match(by.Forcola.note, /27 novembre/);
  assert.ok(!rows.some((r) => /Arnoga/.test(r.name)), "a village road is not a pass");
});

test("cols-cyclisme: picto ouvert / fermé per col", () => {
  const cs = parseCols(COLS_HTML);
  assert.equal(cs.find((c) => c.name === "Col du Galibier").closed, true);
  assert.equal(cs.find((c) => c.name === "Col de la Colombière").closed, false);
  assert.equal(cs.find((c) => c.name === "Col du Lautaret").closed, false);
});

test("collect: one source per pass; orange (snowy road) is no update; missing pages are errors", () => {
  const ap = Object.fromEntries(Object.values(MAP.ap).map((s) => [s, s === "klausenpass" || s === "spluegenpass" ? KLAUSEN : FURKA]));
  const { res, errors } = collect({ ap, mmv: MMV_HTML, cols: COLS_HTML });
  assert.deepEqual(errors, []);
  assert.equal(res.furka.closed, true); assert.equal(res.furka.source, AP + "furkapass");
  assert.equal(res.klausen.closed, false);
  assert.equal(res.mortirolo.closed, true); assert.equal(res.mortirolo.source, MMV);
  assert.equal(res.stelvio, undefined, "orange light: the usual window keeps deciding");
  assert.equal(res.galibier.closed, true); assert.equal(res.colombiere.closed, false); assert.equal(res.galibier.source, COLS);
  const broken = collect({ ap: {}, mmv: "<p>nuovo sito</p>", cols: "" });
  assert.ok(broken.errors.includes("meteomontagnavaltellina: no rows"));
  assert.ok(broken.errors.includes("cols-cyclisme: no rows"));
  assert.ok(broken.errors.includes("alpen-paesse furkapass: no status"));
  assert.deepEqual(broken.res, {}, "nothing written from a page we cannot read");
});

test("nextNow: 'since' only when we see the change, never guessed", () => {
  const r = (closed) => ({ closed, source: "https://s" });
  assert.deepEqual(nextNow(undefined, r(true), "2026-11-11"), { closed: true, checked: "2026-11-11", source: "https://s" }, "first reading: closed, since unknown");
  assert.deepEqual(nextNow({ closed: false, checked: "2026-11-10" }, r(true), "2026-11-11"), { closed: true, since: "2026-11-11", checked: "2026-11-11", source: "https://s" }, "seen closing");
  assert.deepEqual(nextNow({ closed: true, since: "2026-10-23", checked: "2026-11-10" }, r(true), "2026-11-11").since, "2026-10-23", "kept");
  assert.deepEqual(nextNow({ closed: true, since: "2026-10-23" }, r(false), "2027-05-22"), { closed: false, since: "2027-05-22", checked: "2027-05-22", source: "https://s" }, "seen reopening");
});

test("applyStatus on the real file: only 'now' and the sources change", () => {
  const doc = JSON.parse(readFileSync(new URL("../data/winter_closures.json", import.meta.url), "utf8"));
  const before = JSON.parse(JSON.stringify(doc));
  const n = applyStatus(doc, { klausen: { closed: false, source: AP + "klausenpass" }, nope: { closed: true, source: "https://x" } }, "2026-11-11");
  assert.equal(n, 1);
  const k = doc.passes.find((p) => p.id === "klausen"), k0 = before.passes.find((p) => p.id === "klausen");
  assert.deepEqual(k.now, { closed: false, checked: "2026-11-11", source: AP + "klausenpass" });
  assert.deepEqual({ ...k, now: undefined }, { ...k0, now: undefined });
  assert.equal(doc.updated, "2026-11-11");
});
