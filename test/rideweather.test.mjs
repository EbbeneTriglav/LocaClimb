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
  const up = s.find((p) => p.km > 2 && p.km < 5), down = s[s.length - 1];
  assert.ok(down.t > up.t);
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

test("compass16 e windColor: coerenti", () => {
  assert.equal(app.compass16(0), "N");
  assert.equal(app.compass16(90), "E");
  assert.equal(app.compass16(180), "S");
  assert.equal(app.compass16(270), "O");
  assert.ok(app.windColor({ kind: "head", head: 25 }).indexOf("rgb(") === 0);
  assert.equal(app.windColor({ kind: "cross", head: 0 }), "#94a3b8");
});
