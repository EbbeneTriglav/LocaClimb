// v2 "Strade trafficate": the main-road overlay (v2/lib/maps.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { TRAFFIC_CLASSES, TRAFFIC_SOURCE, trafficLayer } from "../v2/lib/maps.mjs";

test("overlay: OpenMapTiles transportation, only the main classes, no tunnels, one colour per class", () => {
  const l = trafficLayer();
  assert.equal(l.source, "traffic"); assert.equal(l["source-layer"], "transportation");
  assert.match(TRAFFIC_SOURCE.url, /^https:\/\/tiles\.openfreemap\.org\//);
  assert.deepEqual(l.filter[1][2][1], ["motorway", "trunk", "primary", "secondary"]);
  assert.deepEqual(l.filter[2], ["!=", ["get", "brunnel"], "tunnel"]);
  const m = l.paint["line-color"];
  for (const c of TRAFFIC_CLASSES) assert.equal(m[m.indexOf(c.k) + 1], c.c);
  assert.ok(!TRAFFIC_CLASSES.some((c) => c.k === "tertiary" || c.k === "minor"), "minor roads are where we want riders: never highlighted");
});
