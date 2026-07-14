/* Ride weather: speed model, schedule, wind decomposition, opening_hours. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./helpers/load-app.mjs";

const app = await loadApp();

test("rwSpeed: la pendenza governa la velocita'", () => {
  assert.equal(app.rwSpeed(0, 22), 22);                       // piano = andatura dichiarata
  assert.ok(app.rwSpeed(0.07, 22) > 9 && app.rwSpeed(0.07, 22) < 12);   // 7% -> ~11 km/h
  assert.ok(app.rwSpeed(0.12, 22) < app.rwSpeed(0.07, 22));   // piu' ripido = piu' lento
  assert.ok(app.rwSpeed(-0.07, 22) > 30);                     // discesa
  assert.ok(app.rwSpeed(-0.20, 22) <= 55);                    // ma satura: niente 90 all'ora
});

test("rwBearing: rotta corretta sui quattro assi", () => {
  assert.ok(Math.abs(app.rwBearing([45, 10], [46, 10]) - 0) < 1);    // nord
  assert.ok(Math.abs(app.rwBearing([45, 10], [45, 11]) - 90) < 1);   // est
  assert.ok(Math.abs(app.rwBearing([45, 10], [44, 10]) - 180) < 1);  // sud
  assert.ok(Math.abs(app.rwBearing([45, 10], [45, 9]) - 270) < 1);   // ovest
});

test("rwSchedule: ore di passaggio crescenti, salita piu' lenta della discesa", () => {
  const t = [];
  for (let i = 0; i <= 100; i++) t.push([45 + i * 0.001, 7, 1000 + (i < 50 ? i * 12 : (100 - i) * 12)]);
  app.rbTrack = t;
  const start = Date.parse("2026-07-15T08:00:00Z");
  const s = app.rwSchedule(start, 22);
  assert.ok(s.length >= 4);
  for (let i = 1; i < s.length; i++) assert.ok(s[i].t > s[i - 1].t, "il tempo deve avanzare");
  // Il senso del modello: un km in salita costa piu' tempo di un km in discesa. Lo misuriamo sui
  // minuti-per-km prima e dopo la cima, invece di sperare che un campione cada in una finestra fissa.
  const top = s.find((p) => p.top), first = s[0], last = s[s.length - 1];
  const minPerKmUp = (top.t - first.t) / 60000 / (top.km - first.km);
  const minPerKmDown = (last.t - top.t) / 60000 / (last.km - top.km);
  assert.ok(minPerKmUp > minPerKmDown * 2, "la salita deve costare almeno il doppio della discesa");
  app.rbTrack = [];
});

test("ohOpen: aperto, chiuso, sintassi ignota (niente tiri a indovinare)", () => {
  const o = "Mo-Sa 07:00-19:00; Su 08:00-13:00";
  assert.equal(app.ohOpen(o, Date.parse("2026-07-15T10:00:00")), true);   // mercoledi mattina
  assert.equal(app.ohOpen(o, Date.parse("2026-07-19T15:00:00")), false);  // domenica pomeriggio
  assert.equal(app.ohOpen("24/7", Date.parse("2026-07-15T03:00:00")), true);
  assert.equal(app.ohOpen("Tu-Su 09:00-12:00,15:00-19:00", Date.parse("2026-07-15T13:00:00")), false); // pausa pranzo
  assert.equal(app.ohOpen("Mo off; Tu-Su 08:00-20:00", Date.parse("2026-07-13T10:00:00")), false);     // lunedi chiuso
  assert.equal(app.ohOpen("sunrise-sunset", Date.parse("2026-07-15T10:00:00")), null);  // non gestita -> ammette di non sapere
  assert.equal(app.ohOpen("", Date.parse("2026-07-15T10:00:00")), null);
});

test("rwSchedule: la CIMA e' sempre campionata (era il bug dei 2757 vs 2788 m)", () => {
  const t = [];
  for (let i = 0; i <= 200; i++) t.push([45 + i * 0.0005, 7, 1000 + (i < 137 ? i * 13 : (200 - i) * 13)]); // vertice in un punto "scomodo"
  app.rbTrack = t;
  const s = app.rwSchedule(Date.parse("2026-07-15T08:00:00Z"), 22);
  const trueMax = Math.max(...t.map((p) => p[2]));
  const top = s.find((p) => p.top);
  assert.ok(top, "un punto deve essere marcato come cima");
  assert.equal(top.ele, trueMax, "la quota campionata deve essere il massimo vero del tracciato");
  assert.equal(s.filter((p) => p.top).length, 1);
  app.rbTrack = [];
});

test("apparentTemp: il termometro mente in discesa", () => {
  const fermo = app.apparentTemp(14, 60, 0);
  const giu = app.apparentTemp(14, 60, 50);          // 14 gradi in cima, giu' a 50 all'ora
  assert.ok(giu < 6, "a 50 km/h 14 gradi devono percepirsi sotto i 6: era " + giu.toFixed(1));
  assert.ok(giu < fermo - 8, "la discesa deve togliere parecchi gradi");
  assert.ok(app.apparentTemp(4, 70, 50) < app.apparentTemp(14, 70, 50));  // monotona nella temperatura
  assert.ok(app.apparentTemp(30, 50, 30) > 20);      // in estate non deve inventare freddo
});

test("compass16 e windColor: coerenti", () => {
  assert.equal(app.compass16(0), "N");
  assert.equal(app.compass16(90), "E");
  assert.equal(app.compass16(180), "S");
  assert.equal(app.compass16(270), "O");
  assert.ok(app.windColor({ kind: "head", head: 25 }).indexOf("rgb(") === 0);
  assert.equal(app.windColor({ kind: "cross", head: 0 }), "#94a3b8");
});

test("distPtToTrack restituisce KM: i ristori non finiscono tutti al km 0", () => {
  // il bug: dividendo `along` per 1000 ogni ristoro cadeva al km 0.0 e l'ETA coincideva con la partenza
  const track = [];
  for (let i = 0; i <= 100; i++) track.push([45 + i * 0.002, 7]);   // ~22 km rettilinei
  const meta = app.distPtToTrack(45.1, 7.0005, track);              // circa a meta'
  assert.ok(meta.along > 5 && meta.along < 20, "along deve essere in km, non in metri: " + meta.along);
  assert.ok(meta.distM < 100, "la distanza dal tracciato invece e' in metri: " + meta.distM);
});

test("profileSeries: liscia il rumore SRTM senza spostare la cima", () => {
  const t = [];
  for (let i = 0; i <= 400; i++) {
    const base = 1000 + (i < 200 ? i * 4 : (400 - i) * 4);
    t.push([45 + i * 0.0002, 7, base + (i % 2 ? 1 : -1)]);          // +/-1 m di tremolio, come SRTM
  }
  app.rbTrack = t;
  const S = app.profileSeries(500, 38, 8);
  let jumps = 0;
  for (let k = 1; k < S.n; k++) if (Math.abs(S.ele[k] - S.ele[k - 1]) > 12) jumps++;
  assert.equal(jumps, 0, "nessun salto assurdo fra pixel adiacenti");
  const peak = Math.max(...S.ele);
  assert.ok(Math.abs(peak - 1800) < 25, "la cima resta dov'era: " + peak);
  app.rbTrack = [];
});

test("gradColor: il colore segue la pendenza", () => {
  assert.equal(app.gradColor(-0.06), app.gradColor(-0.10));   // discesa
  assert.notEqual(app.gradColor(0.03), app.gradColor(0.09));  // 3% e 9% non sono lo stesso dolore
  assert.equal(app.gradColor(0.15), "#dc2626");               // muro
});

test("codici WMO: temporale e neve riconosciuti", () => {
  assert.ok(app.isStorm(95) && app.isStorm(99));
  assert.ok(!app.isStorm(61) && !app.isStorm(80));   // pioggia normale non e' temporale
  assert.ok(app.isSnow(73) && app.isSnow(85));
  assert.ok(!app.isSnow(61));
});

test("skyGlyph: la pioggia batte le nuvole, il temporale batte tutto", () => {
  assert.equal(app.skyGlyph({ code: 96, cloud: 10, mm: 0 }), "\u26A1");        // temporale anche a ciel sereno nominale
  assert.equal(app.skyGlyph({ code: 61, cloud: 90, mm: 2 }), "\uD83C\uDF27\uFE0F");
  assert.equal(app.skyGlyph({ code: 0, cloud: 5, mm: 0 }), "\u2600\uFE0F");
  assert.equal(app.skyGlyph({ code: 3, cloud: 95, mm: 0 }), "\u2601\uFE0F");
  assert.equal(app.skyGlyph({ code: 71, cloud: 80, mm: 1 }), "\u2744\uFE0F");  // neve prima di pioggia
});

test("trigger: senza orario si assume il caso peggiore (una funzione di sicurezza non deve tacere)", () => {
  assert.equal(app.trigger(null), 1);
  assert.equal(app.trigger(NaN), 1);
});

test("stormRisk: il CAPE da solo non basta, serve poca inibizione", () => {
  // molta energia ma cappuccio spesso -> pomeriggio afoso e sereno, NON un allarme
  assert.ok(app.stormRisk({ cape: 3000, cin: -200, code: 1 }) < 3);
  // stessa energia, nessun cappuccio -> cella che esplode
  assert.equal(app.stormRisk({ cape: 3000, cin: -20, code: 1 }), 3);
  // il modello che dice esplicitamente "temporale" batte qualunque ragionamento sul CAPE
  assert.equal(app.stormRisk({ cape: 0, cin: 0, code: 95 }), 3);
  // aria stabile: nessun rischio
  assert.equal(app.stormRisk({ cape: 200, cin: 0, code: 3 }), 0);
  // energia moderata senza cappuccio: attenzione, non allarme
  assert.equal(app.stormRisk({ cape: 1800, cin: -30, code: 2 }), 2);
});

test("capeLabel: soglie meteorologiche standard in J/kg", () => {
  assert.equal(app.capeLabel(100), "trascurabile");
  assert.equal(app.capeLabel(1500), "moderata");
  assert.equal(app.capeLabel(3000), "forte");
  assert.equal(app.capeLabel(4500), "estrema");
  assert.equal(app.capeLabel(null), null);
});

test("trigger: la convezione di montagna e' termica, culmina nel pomeriggio", () => {
  const at = (h) => app.trigger(+new Date(2026, 6, 15, h, 0));
  assert.ok(at(6) < 0.2, "all'alba l'innesco e' quasi nullo");
  assert.ok(at(16) >= 0.99, "il picco e' alle 16");
  assert.ok(at(11) < at(15), "sale nel corso della mattina");
  assert.ok(at(20) < at(16), "cala la sera");
  assert.ok(at(22) < 0.3);
});

test("effCape/stormRisk: lo stesso CAPE non e' la stessa minaccia a ogni ora", () => {
  const p = (h) => ({ cape: 2800, cin: -20, code: 1, t: +new Date(2026, 6, 15, h, 0) });
  assert.equal(app.stormRisk(p(16)), 3, "2800 J/kg alle 16 = allarme");
  assert.ok(app.stormRisk(p(9)) < 2, "gli stessi 2800 alle 9 non sono un allarme");
  assert.ok(app.effCape(p(16)) > app.effCape(p(9)) * 4);
  // ma un fronte all'alba deve passare comunque: il weather_code batte l'ora
  assert.equal(app.stormRisk({ cape: 0, cin: 0, code: 95, t: +new Date(2026, 6, 15, 6, 0) }), 3);
});
