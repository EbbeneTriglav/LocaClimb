// js/signage.js: pure helpers of the new climb sheet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = {};
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL("../js/signage.js", import.meta.url), "utf8"), ctx);

test("section titles lose their emoji and get the right icon", () => {
  assert.equal(ctx.sgStripEmoji("⚔️ Confronto Versanti"), "Confronto Versanti");
  assert.equal(ctx.sgStripEmoji("💧 Acqua sulla salita "), "Acqua sulla salita ");
  assert.equal(ctx.sgStripEmoji("Meteo"), "Meteo");
  assert.equal(ctx.sgTitleIcon("Meteo 7 Giorni"), "cloud-sun");
  assert.equal(ctx.sgTitleIcon("Acqua sulla salita"), "droplet");
  assert.equal(ctx.sgTitleIcon("Qualcosa di nuovo"), null);
});

test("the four numbers of a versante", () => {
  const n = ctx.sgNumbers({ distance_km: 12.4, startElevation: 609, endElevation: 1377, avgGradient: 6.2 }, null);
  assert.deepEqual(Array.from(n).map((x) => x.n), ["12,4", "768", "6,2%", "-"]);
});

test("sheet snaps to the nearest height, or closes when dragged down", () => {
  const S = [0.36, 0.62, 0.93];
  assert.equal(ctx.sgSnap(0.1, S), 0);
  assert.equal(ctx.sgSnap(0.4, S), 0.36);
  assert.equal(ctx.sgSnap(0.7, S), 0.62);
  assert.equal(ctx.sgSnap(0.85, S), 0.93);
});

test("every icon used by the module exists", () => {
  const src = readFileSync(new URL("../js/signage.js", import.meta.url), "utf8");
  const used = new Set([...src.matchAll(/sgIcon\("([a-z0-9-]+)"/g)].map((m) => m[1]).concat(["map", "search", "plus", "user", "menu"]));
  for (const t of ["profilo", "confronto", "acqua", "meteo", "news", "valutazioni", "consigli", "tornanti", "bike day", "strava", "ristori", "vento"]) used.add(ctx.sgTitleIcon(t));
  for (const k of used) assert.ok(ctx.SG_ICONS[k], "missing icon " + k);
});

test("no function is declared twice (a later one silently replaces the first)", () => {
  const src = readFileSync(new URL("../js/signage.js", import.meta.url), "utf8");
  const names = [...src.matchAll(/^function (\w+)\s*\(/gm)].map((m) => m[1]);
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  assert.deepEqual(dup, []);
  assert.equal(typeof ctx.sgHeader({ name: "X", elevation: 1000 }, true, true), "string");
});
