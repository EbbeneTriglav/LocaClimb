// js/poilocal.js: the app's water/food Overpass queries answered from baked tiles.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { poiWanted, poiTags, cellKey } from "../scripts/build_poi.mjs";

const ctx = {};
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL("../js/poilocal.js", import.meta.url), "utf8"), ctx);
const box = "(44.1000,10.6000,44.2000,10.7000)";
// the exact query shapes built by map.js, overpass2.js and uikit.js
const Q_FOUNT = '[out:json][timeout:25];(node["amenity"="drinking_water"]' + box + ';node["man_made"="water_tap"]["drinking_water"!="no"]' + box + ';node["amenity"="fountain"]["drinking_water"="yes"]' + box + ';node["natural"="spring"]["drinking_water"="yes"]' + box + ';);out body;';
const Q_FOOD = '[out:json][timeout:20];(node["amenity"~"^(cafe|restaurant|fast_food|bar|pub|ice_cream)$"]' + box + ';node["shop"~"^(bakery|convenience|supermarket|greengrocer)$"]' + box + ';);out body 300;';
const A = "(around:200,44.1500,10.6000,44.1500,10.7000)";
const Q_ROUTE = '[out:json][timeout:60];(node["amenity"~"^(drinking_water|fountain)$"]' + A + ';node["man_made"="water_tap"]' + A + ';node["natural"="spring"]' + A + ';);out body;';
const cell = [
  [1, 44.15, 10.65, { amenity: "drinking_water", name: "Fonte" }],
  [2, 44.15, 10.66, { amenity: "fountain" }],                              // decorative
  [3, 44.15, 10.67, { man_made: "water_tap", drinking_water: "no" }],
  [4, 44.19, 10.65, { natural: "spring", drinking_water: "yes" }],          // 4.4 km off the route line
  [5, 44.151, 10.65, { amenity: "cafe", name: "Bar" }],
  [6, 44.151, 10.651, { shop: "bakery" }],
  [7, 44.3, 10.65, { amenity: "drinking_water" }]                          // outside the box
];

test("parse: the three query shapes of the app, and refuse anything else", () => {
  assert.equal(ctx.poiParse(Q_FOUNT).clauses.length, 4);
  assert.equal(ctx.poiParse(Q_FOOD).limit, 300);
  assert.equal(ctx.poiParse(Q_ROUTE).clauses[0].around.pts.length, 2);
  assert.equal(ctx.poiParse('[out:json];node(123)->.n;way(bn.n)["highway"];out geom tags;'), null);
  assert.equal(ctx.poiParse('[out:json];node["mountain_pass"="yes"](44,6,47,13);out body;'), null);
});

test("fountains layer: same filters as Overpass", () => {
  const r = ctx.poiAnswer(ctx.poiParse(Q_FOUNT), [cell]);
  assert.deepEqual(Array.from(r.elements).map((e) => e.id).sort(), [1, 4]);
  assert.equal(r.elements[0].type, "node");
});

test("food layer: amenity and shop clauses", () => {
  assert.deepEqual(Array.from(ctx.poiAnswer(ctx.poiParse(Q_FOOD), [cell]).elements).map((e) => e.id).sort(), [5, 6]);
});

test("route corridor: only within 200 m of the line", () => {
  const ids = Array.from(ctx.poiAnswer(ctx.poiParse(Q_ROUTE), [cell]).elements).map((e) => e.id).sort();
  assert.deepEqual(ids, [1, 2, 3]);   // spring 4 is 4 km away; the caller drops 2 and 3 by its own rules
});

test("cells: a bbox and a corridor map to the right 0.25 deg tiles", () => {
  assert.deepEqual(Array.from(ctx.poiCellsFor(ctx.poiParse(Q_FOOD))).sort(), ["176_42"]);
  assert.ok(Array.from(ctx.poiCellsFor(ctx.poiParse(Q_ROUTE))).includes("176_42"));
  assert.equal(ctx.poiCellKey(44.15, 10.65), cellKey(44.15, 10.65));
});

test("build_poi keeps only water/food and a small tag subset", () => {
  assert.equal(poiWanted({ amenity: "bench" }), false);
  assert.equal(poiWanted({ shop: "pastry" }), true);
  assert.deepEqual(poiTags({ amenity: "cafe", name: "X", wheelchair: "yes", "@id": "n1" }), { amenity: "cafe", name: "X" });
});
