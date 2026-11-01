// v2/lib/rideout.mjs - the ride outside the app: share image and printable road book.
import { test } from "node:test";
import assert from "node:assert/strict";
import { routeShape, sampleGrades, stopKms, bookRows, waterGap, roadbookHtml, drawCard, hm, CARD_W, CARD_H } from "../v2/lib/rideout.mjs";

// 20 km going north-east: 10 km flat at 500 m, then 10 km climbing to 1300 m (8%); 21 samples
const N = 21, side = {
  distance_km: 20,
  track: Array.from({ length: N }, (_, i) => [45 + i * 0.009, 9 + i * 0.006]),
  elevationProfile: Array.from({ length: N }, (_, i) => (i <= 10 ? 500 : 500 + (i - 10) * 80))
};
const D = {
  title: "Giro <b>del lago</b>", date: "sab 1 nov 2026", lang: "it", start: "08:30", wkg: 3, url: "https://locaride.app/#/giro?p=x",
  km: 20, gain: 800, minutes: 75, side, eta: Array.from({ length: N }, (_, i) => i * 3.75),
  climbs: [{ name: "Passo Alto", km: 20, elevation: 1300, difficulty: 6 }],
  water: [{ km: 4, name: "Fontana" }, { km: 9, name: "" }],
  stops: [{ lat: 45, lon: 9, name: "Partenza" }, { lat: 45.09, lon: 9.06, name: "" }, { lat: 45.18, lon: 9.12, name: "Passo Alto" }],
  weather: [{ name: "Partenza", km: 0, temp: 12.4, wind: 8, pp: 10 }]
};

test("routeShape keeps proportions, north up, inside the box", () => {
  const p = routeShape(side.track, 300, 300, 10);
  assert.equal(p.length, N);
  for (const [x, y] of p) assert.ok(x >= 9.9 && x <= 290.1 && y >= 9.9 && y <= 290.1);
  assert.ok(p[N - 1][1] < p[0][1], "going north = going up");
  assert.ok(p[N - 1][0] > p[0][0], "going east = going right");
  assert.deepEqual(routeShape([[45, 9]], 100, 100), []);
});

test("sampleGrades: flat then ~8%, smoothed", () => {
  const g = sampleGrades(side);
  assert.ok(Math.abs(g[3]) < 0.5);
  assert.ok(Math.abs(g[16] - 8) < 0.5);
});

test("road book rows: start first, finish last, climbs and water in order with the time you get there", () => {
  assert.deepEqual(stopKms(side, D.stops).map((k) => Math.round(k)), [0, 10, 20]);
  const r = bookRows(D);
  assert.equal(r[0].kind, "start"); assert.equal(r[0].time, "8:30");
  assert.equal(r[r.length - 1].name, "Passo Alto");
  const kinds = r.map((x) => x.kind);
  assert.equal(kinds.filter((k) => k === "water").length, 2);
  assert.equal(r.filter((x) => x.name === "Passo Alto").length, 1, "the finish named after the climb is one line, not two");
  assert.ok(r[r.length - 1].climb && /6\/10/.test(r[r.length - 1].note));
  const other = bookRows({ ...D, climbs: [{ name: "Colle Medio", km: 15, difficulty: 4 }] });
  assert.ok(other.some((x) => x.kind === "climb" && x.name === "Colle Medio"));
  for (let i = 2; i < r.length - 1; i++) assert.ok(r[i].km >= r[i - 1].km || r[i - 1].kind === "start");
  assert.equal(r.find((x) => x.kind === "water").time, "8:45");     // km 4 = sample 4 = 15 min
  assert.equal(waterGap(D), 11);
  assert.equal(hm(75), "1:15"); assert.equal(hm(null), "–");
});

test("roadbookHtml: a whole printable page, every value escaped, English labels", () => {
  const h = roadbookHtml(D);
  assert.match(h, /^<!doctype html>/);
  assert.match(h, /@page \{ size: A4/);
  assert.ok(!h.includes("<b>del lago</b>") && h.includes("Giro &lt;b&gt;del lago&lt;/b&gt;"));
  assert.match(h, /\+800/); assert.match(h, /1:15/); assert.match(h, /Passo Alto/); assert.match(h, /12° · 8 km\/h · 10%/);
  const en = roadbookHtml({ ...D, lang: "en", water: [] });
  assert.match(en, /The route/); assert.match(en, /No water point mapped/);
});

test("drawCard paints the whole 1080x1350 card without throwing (recorded 2D context)", () => {
  const calls = [];
  const ctx = new Proxy({}, {
    get(t, k) { if (k in t) return t[k]; if (k === "measureText") return (s) => ({ width: String(s).length * 20 }); return (...a) => calls.push([k, ...a]); },
    set(t, k, v) { t[k] = v; return true; }
  });
  drawCard(ctx, D);
  assert.equal(CARD_W, 1080); assert.equal(CARD_H, 1350);
  assert.deepEqual(calls[0], ["fillRect", 0, 0, 1080, 1350]);
  const texts = calls.filter((c) => c[0] === "fillText").map((c) => c[1]);
  assert.ok(texts.includes("GIRO <B>DEL LAGO</B>"));                 // canvas text, not HTML: nothing to escape
  assert.ok(texts.includes("locaride.app") && texts.includes("+800") && texts.includes("1:15"));
  assert.ok(texts.some((t) => /^SALITE {2}Passo Alto/.test(t)));
});
