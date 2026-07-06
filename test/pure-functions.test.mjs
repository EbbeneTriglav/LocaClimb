import { test, before } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./helpers/load-app.mjs";

let app;
before(async () => { app = await loadApp(); });

test("esc() neutralizes HTML metacharacters", () => {
  assert.equal(app.esc("<img src=x onerror=alert(1)>"), "&lt;img src=x onerror=alert(1)&gt;");
  assert.equal(app.esc(`O'Brien & <b>"quoted"</b>`), "O&#39;Brien &amp; &lt;b&gt;&quot;quoted&quot;&lt;/b&gt;");
  assert.equal(app.esc(null), "");
  assert.equal(app.esc(undefined), "");
  assert.equal(app.esc(42), "42");
});

test("hav() computes great-circle distance between two points (km)", () => {
  // Stelvio summit -> Bormio, known-ish real-world distance in the low tens of km.
  const d = app.hav(46.5285, 10.4534, 46.4683, 10.3708);
  assert.ok(d > 8 && d < 11, `expected ~9km, got ${d}`);
  assert.equal(app.hav(45, 10, 45, 10), 0);
});

test("compass() maps a bearing to an 8-point compass label", () => {
  // due north
  assert.equal(app.compass(45.0, 10.0, 46.0, 10.0), "Nord");
  // same point in -> no clear bearing, but must not throw
  assert.doesNotThrow(() => app.compass(45, 10, 45, 10));
});

test("fmtDate() converts ISO yyyy-mm-dd to it-IT dd/mm/yyyy", () => {
  assert.equal(app.fmtDate("2026-07-05"), "05/07/2026");
  assert.equal(app.fmtDate(""), "");
  assert.equal(app.fmtDate(null), "");
  assert.equal(app.fmtDate("not-a-date"), "not-a-date");
});

test("estDiff() stays within [1,10] and rewards steeper/longer/higher climbs", () => {
  const easy = app.estDiff(5, 200, 800);
  const hard = app.estDiff(20, 1800, 2700);
  assert.ok(easy >= 1 && easy <= 10);
  assert.ok(hard >= 1 && hard <= 10);
  assert.ok(hard > easy, "a longer/steeper/higher climb should score harder");
  assert.equal(app.estDiff(0, 0, 0), 1, "degenerate input floors at 1");
});

test("climbCat() classifies by gain^2/distance + altitude bonus, or null below climb threshold", () => {
  assert.equal(app.climbCat(1, 100, 500), null, "below 150m gain / 1km distance -> not a climb");
  assert.equal(app.climbCat(10, 900, 2000), "HC");
  assert.ok(["1", "2", "3", "4"].includes(app.climbCat(6, 400, 1200)));
});

test("catRank() orders categories HC > 1 > 2 > 3 > 4", () => {
  assert.ok(app.catRank("HC") > app.catRank("1"));
  assert.ok(app.catRank("1") > app.catRank("2"));
  assert.ok(app.catRank("2") > app.catRank("3"));
  assert.ok(app.catRank("3") > app.catRank("4"));
  assert.equal(app.catRank("nope"), 0);
});

test("ds() renders a difficulty out of 10 as filled/empty star entities", () => {
  assert.equal(app.ds(0), "&#x2606;".repeat(10));
  assert.equal(app.ds(10), "&#x2605;".repeat(10));
  assert.equal(app.ds(3), "&#x2605;".repeat(3) + "&#x2606;".repeat(7));
});

test("sc()/sl() map pass status to a color and an Italian label", () => {
  assert.equal(app.sc("open"), "#22c55e");
  assert.equal(app.sc("seasonal"), "#f59e0b");
  assert.equal(app.sc("closed"), "#ef4444");
  assert.match(app.sl("open"), /Aperto/);
  assert.match(app.sl("seasonal"), /Stagionale/);
  assert.match(app.sl("closed"), /Chiuso/);
});

test("passTruck()/truckRank() pick the worst-case truck exposure across versanti", () => {
  const p = { versanti: [{ trafFeriale: 3, trafWeekend: 4, trucks: "no" }, { trafFeriale: 3, trafWeekend: 4, trucks: "si" }] };
  assert.equal(app.passTruck(p), "si");
  assert.equal(app.passTruck({ versanti: [] }), "rari");
});

test("isGravel() detects unpaved surface labels", () => {
  assert.equal(app.isGravel({ surfaceLabel: "Sterrato" }), true);
  assert.equal(app.isGravel({ surfaceLabel: "Asfalto" }), false);
  assert.equal(app.isGravel({}), false);
});

test("niceBin() picks a chart bin width that fits ~9 bins across a distance", () => {
  assert.equal(app.niceBin(2), 0.25);
  assert.equal(app.niceBin(90), 5);
});

test("interpE() linearly interpolates elevation along a distance/elevation series", () => {
  const s = { pts: [{ d: 0, e: 100 }, { d: 10, e: 200 }] };
  assert.equal(app.interpE(s, 0), 100);
  assert.equal(app.interpE(s, 10), 200);
  assert.equal(app.interpE(s, 5), 150);
  assert.equal(app.interpE(s, -5), 100, "clamps below range");
  assert.equal(app.interpE(s, 50), 200, "clamps above range");
});
