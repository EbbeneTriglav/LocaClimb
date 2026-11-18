import { test } from "node:test";
import assert from "node:assert/strict";
import { decodePolyline, decodeFlexPolyline, legCat, normMotis, normHere, railStations, planKey, validPlan, handleTransit } from "../cf/transit.js";

test("polylines: Google (MOTIS) and HERE flexible, the reference examples", () => {
  assert.deepEqual(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@", 5), [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
  assert.deepEqual(decodeFlexPolyline("BFoz5xJ67i1B1B7PzIhaxL7Y"), [[50.10228, 8.69821], [50.10201, 8.69567], [50.10063, 8.6915], [50.09878, 8.68752]]);
  assert.throws(() => decodeFlexPolyline("B!"));
});

test("leg kinds: regional trains carry bikes, high-speed and buses are told apart", () => {
  assert.equal(legCat("REGIONAL_RAIL"), "regional");
  assert.equal(legCat("regionalTrain"), "regional");
  assert.equal(legCat("HIGHSPEED_RAIL"), "long");
  assert.equal(legCat("BUS"), "other");
  assert.equal(legCat("BIKE"), "self");
  assert.equal(legCat("pedestrian"), "self");
});

test("MOTIS itinerary -> our shape (Milano -> Tirano, 18/11/2026)", () => {
  const it = { startTime: "2026-11-21T07:04:00Z", endTime: "2026-11-21T09:55:00Z", duration: 10260, legs: [
    { mode: "BIKE", distance: 3800, from: { name: "START", lat: 45.4642, lon: 9.19 }, to: { name: "Milano Centrale", lat: 45.4855, lon: 9.2042 }, startTime: "2026-11-21T07:04:00Z", endTime: "2026-11-21T07:18:00Z", legGeometry: { points: "_p~iF~ps|U", precision: 5 } },
    { mode: "WALK", distance: 40, from: { name: "a", lat: 1, lon: 1 }, to: { name: "b", lat: 1, lon: 1 }, startTime: "x", endTime: "y" },
    { mode: "REGIONAL_RAIL", routeShortName: "RE8", agencyName: "Trenord", from: { name: "Milano Centrale", lat: 45.4855, lon: 9.2042 }, to: { name: "Tirano", lat: 46.2158, lon: 10.1657 },
      startTime: "2026-11-21T07:20:00Z", endTime: "2026-11-21T09:53:00Z", legGeometry: { points: "_p~iF~ps|U_ulLnnqC", precision: 5 } }
  ] };
  const n = normMotis(it);
  assert.equal(n.min, 171);
  assert.equal(n.legs.length, 2, "a 40 m walk between platforms is dropped");
  assert.deepEqual({ ...n.legs[1], geom: n.legs[1].geom.length }, { mode: "REGIONAL_RAIL", cat: "regional", name: "RE8", agency: "Trenord",
    from: { name: "Milano Centrale", lat: 45.4855, lon: 9.2042 }, to: { name: "Tirano", lat: 46.2158, lon: 10.1657 }, dep: "2026-11-21T07:20:00Z", arr: "2026-11-21T09:53:00Z", geom: 2 });
  assert.equal(n.transfers, 0);
});

test("HERE route -> the same shape", () => {
  const rt = { sections: [
    { type: "pedestrian", departure: { time: "2026-11-21T08:05:00+01:00", place: { name: "", location: { lat: 45.48, lng: 9.2 } } }, arrival: { time: "2026-11-21T08:15:00+01:00", place: { name: "Milano Centrale", location: { lat: 45.4855, lng: 9.2042 } } } },
    { type: "transit", transport: { mode: "regionalTrain", name: "RE8", shortName: "RE8" }, agency: { name: "Trenord" }, polyline: "BFoz5xJ67i1B1B7PzIhaxL7Y",
      departure: { time: "2026-11-21T08:20:00+01:00", place: { name: "Milano Centrale", location: { lat: 45.4855, lng: 9.2042 } } },
      arrival: { time: "2026-11-21T10:53:00+01:00", place: { name: "Tirano", location: { lat: 46.2158, lng: 10.1657 } } } }
  ] };
  const n = normHere(rt);
  assert.equal(n.min, 168);
  assert.equal(n.transfers, 0);
  assert.equal(n.legs[1].cat, "regional");
  assert.equal(n.legs[1].agency, "Trenord");
  assert.equal(n.legs[1].geom.length, 4);
  assert.equal(n.legs[0].cat, "self");
});

test("rail stations: buses out, one per name (the most important), within the radius", () => {
  const st = railStations([
    { name: "Tirano", lat: 46.2158, lon: 10.1657, importance: 1e-3, modes: ["REGIONAL_RAIL"] },
    { name: "Tirano", lat: 46.2157, lon: 10.1667, importance: 2e-3, modes: ["REGIONAL_RAIL"] },
    { name: "Bormio, Terme", lat: 46.4696, lon: 10.3688, importance: 3e-7, modes: ["BUS"] },
    { name: "Edolo", lat: 46.177, lon: 10.3295, importance: 1e-4, modes: ["REGIONAL_RAIL"] },
    { name: "Milano Centrale", lat: 45.4855, lon: 9.2042, importance: 1e-2, modes: ["REGIONAL_RAIL", "HIGHSPEED_RAIL"] }
  ], 46.4669, 10.3705, 45);
  assert.deepEqual(st.map((s) => s.name), ["Tirano", "Edolo"], "nearest first");
  assert.equal(st[0].imp, 2e-3);
});

test("cache keys: ~500 m and a quarter of an hour share one upstream call; bad requests are refused", async () => {
  const q = (s) => new URLSearchParams(s);
  assert.equal(planKey("https://x", q("from=45.4642,9.19&to=46.2158,10.1657&time=2026-11-21T07:04:00Z")), planKey("https://x", q("from=45.4651,9.1911&to=46.2161,10.1659&time=2026-11-21T07:12:00Z")));
  assert.notEqual(planKey("https://x", q("from=45.4642,9.19&to=46.2158,10.1657&time=2026-11-21T07:04:00Z")), planKey("https://x", q("from=45.4642,9.19&to=46.2158,10.1657&time=2026-11-21T07:20:00Z")));
  assert.notEqual(planKey("https://x", q("from=45.4642,9.19&to=46.2158,10.1657&time=2026-11-21T07:04:00Z")), planKey("https://x", q("from=45.4642,9.19&to=46.2158,10.1657&time=2026-11-21T07:04:00Z&post=bike")));
  assert.equal(validPlan(q("from=45.46,9.19&to=46.21,10.16&time=2026-11-21T07:00:00Z")), true);
  assert.equal(validPlan(q("from=x&to=46.21,10.16&time=2026-11-21")), false);
  const r = await handleTransit(new Request("https://locaride.app/api/transit/plan?from=1&to=2"), {}, null);
  assert.equal(r.status, 400);
});

test("Transitous down -> HERE (only with the key); nothing found -> an empty answer, never an error page", async () => {
  const real = globalThis.fetch, calls = [];
  globalThis.fetch = async (u) => {
    calls.push(String(u));
    if (String(u).includes("transitous")) return new Response("busy", { status: 503 });
    return new Response(JSON.stringify({ routes: [{ sections: [{ type: "transit", transport: { mode: "regionalTrain", shortName: "RE8" }, agency: { name: "Trenord" },
      departure: { time: "2026-11-21T08:20:00+01:00", place: { name: "Milano Centrale", location: { lat: 45.4855, lng: 9.2042 } } },
      arrival: { time: "2026-11-21T10:53:00+01:00", place: { name: "Tirano", location: { lat: 46.2158, lng: 10.1657 } } } }] }] }), { status: 200 });
  };
  try {
    const url = "https://locaride.app/api/transit/plan?from=45.4642,9.19&to=46.2158,10.1657&time=2026-11-21T07:00:00Z&n=3";
    const a = await (await handleTransit(new Request(url), { HERE_API_KEY: "k" }, null)).json();
    assert.equal(a.source, "here");
    assert.equal(a.itineraries[0].legs[0].name, "RE8");
    assert.ok(calls.some((c) => c.startsWith("https://transit.router.hereapi.com/v8/routes?") && c.includes("modes=regionalTrain")));
    const b = await (await handleTransit(new Request(url), {}, null)).json();
    assert.deepEqual(b, { source: null, itineraries: [] }, "no HERE key: Transitous only");
  } finally { globalThis.fetch = real; }
});
