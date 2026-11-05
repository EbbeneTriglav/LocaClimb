import { test } from "node:test";
import assert from "node:assert/strict";
import { postText, drawPost, POST, STORY } from "../v2/lib/postcard.mjs";

const v = { side: "Da Ponte di Legno", distance_km: 17.3, avgGradient: 7.9, maxGradient: 16, startElevation: 1258, endElevation: 2621,
  elevationProfile: [1258, 1400, 1600, 1800, 2000, 2200, 2400, 2621], track: [[46.25, 10.5], [46.3, 10.49], [46.34, 10.49]] };
const c = { name: "Passo Gavia" };

test("post text in the three languages", () => {
  const it = postText(c, v, "it");
  assert.equal(it.title, "PASSO GAVIA"); assert.equal(it.big, "17,3 km al 7,9%"); assert.equal(it.from, "Da Ponte di Legno");
  assert.match(it.small, /^\+1\.?363 m  ·  max 16%  ·  cima 2\.?621 m$/);
  assert.equal(postText(c, v, "en").big, "17.3 km at 7.9%");
  assert.equal(postText(c, v, "en").from, "From Ponte di Legno");
  assert.equal(postText(c, v, "es").from, "Desde Ponte di Legno");
});

test("drawPost draws title, numbers and credits on post and story sizes", () => {
  for (const sz of [POST, STORY]) {
    const texts = [], noop = () => {};
    const grad = { addColorStop: noop };
    const ctx = new Proxy({}, { get: (_, k) => k === "fillText" ? (s) => texts.push(s) : k === "measureText" ? (s) => ({ width: s.length * 20 }) : (k === "createLinearGradient" || k === "createRadialGradient") ? () => grad : noop, set: () => true });
    drawPost(ctx, c, v, { w: sz.w, h: sz.h, lang: "it", bg: null });
    for (const s of ["LOCARIDE", "PASSO GAVIA", "17,3 km al 7,9%", "locaride.app", "Da Ponte di Legno"]) assert.ok(texts.includes(s), sz.h + " " + s);
    assert.ok(texts.some((s) => /OpenStreetMap/.test(s)));
  }
});
