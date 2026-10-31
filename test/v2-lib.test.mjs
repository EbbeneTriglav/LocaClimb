// v2/lib/*.mjs - pure logic of the new frontend (road book, profile, ride mode, weather verdict, diary).
import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeColor, difficultyColor, num, eleAt, kmTable, hardestKm, profileShapes, trackWithEle, gpx, positionOnClimb, sideStats, profileDist, hairpins, climbMinutes, clock, traffic, alongTrack } from "../v2/lib/climb.mjs";
import { hourState, dayVerdict, advice } from "../v2/lib/weather.mjs";
import { diaryStats, bestOf, dur } from "../v2/lib/diary.mjs";
import { cleanLabel } from "../v2/lib/data.mjs";

// 10 km, 1000 -> 1800 m: first 5 km at 6%, last 5 km at 10%; profile every km; straight track north
const V = {
  side: "Da Valle", distance_km: 10, startElevation: 1000, endElevation: 1800, avgGradient: 8, maxGradient: 12,
  elevationProfile: [1000, 1060, 1120, 1180, 1240, 1300, 1400, 1500, 1600, 1700, 1800],
  track: Array.from({ length: 101 }, (_, i) => [46 + i * 0.1 / 111.2, 11])
};

test("gradient and difficulty colours follow the one scale of the app", () => {
  assert.equal(gradeColor(2), "#5B8DEF");
  assert.equal(gradeColor(6.9), "#F2C14E");
  assert.equal(gradeColor(9), "#F28C38");
  assert.equal(gradeColor(12), "#E5484D");
  assert.equal(gradeColor(18), "#C04BD6");
  assert.equal(difficultyColor(10), "#C04BD6");
  assert.equal(difficultyColor(3), "#5B8DEF");
  assert.equal(num(7.04), "7,0");
  assert.equal(num(null), "–");
});

test("road book: one row per km with the gradient of that km; hardest km found", () => {
  assert.ok(Math.abs(eleAt(V, 2.5) - 1150) < 1e-6);
  const rows = kmTable(V);
  assert.equal(rows.length, 10);
  assert.deepEqual(rows[0], { k: 1, len: 1, g: 6, e: 1060 });
  assert.equal(rows[9].g, 10);
  assert.equal(rows[9].e, 1800);
  assert.equal(hardestKm(rows), 5);
  const partial = kmTable({ ...V, distance_km: 9.5 });
  assert.equal(partial.length, 10);
  assert.equal(partial[9].len, 0.5);
});

test("profile shapes: one coloured segment per profile step", () => {
  const s = profileShapes(V, 100, 50);
  assert.equal(s.segs.length, 10);
  assert.equal(s.segs[0].color, "#F2C14E");
  assert.equal(s.segs[9].color, "#E5484D");               // exactly 10% is in the 10-13 band
  assert.equal(s.lo, 1000); assert.equal(s.hi, 1800);
  assert.match(s.line, /^M0 /);
});

test("track gets elevations from the profile; GPX is valid and escaped", () => {
  const t = trackWithEle(V);
  assert.equal(t[0][2], 1000);
  assert.equal(t[t.length - 1][2], 1800);
  const x = gpx("Passo <Prova> & co", t.slice(0, 2));
  assert.match(x, /<name>Passo &lt;Prova&gt; &amp; co<\/name>/);
  assert.match(x, /<trkpt lat="46" lon="11"><ele>1000<\/ele><\/trkpt>/);
});

test("ride mode: position along the climb, metres to go, gradient ahead, off-road distance", () => {
  const p = positionOnClimb(V, 46 + 6 * 0.1 / 111.2 * 10, 11);       // 6 km up
  assert.ok(Math.abs(p.km - 6) < 0.05, "km " + p.km);
  assert.ok(Math.abs(p.toGoKm - 4) < 0.05);
  assert.ok(Math.abs(p.toGoM - 400) < 6);
  assert.equal(p.gAhead, 10);
  assert.ok(p.offKm < 0.01);
  const far = positionOnClimb(V, 46.05, 11.2);
  assert.ok(far.offKm > 10);
});

test("side stats", () => {
  assert.deepEqual(sideStats(V), { km: 10, avg: 8, max: 12, gain: 800, top: 1800, start: 1000 });
});

/* ---------------------------------------------------------------- weather */
function hourly(day0, fn) {
  const time = [], temperature_2m = [], precipitation_probability = [], wind_speed_10m = [], cape = [];
  for (let d = 0; d < 2; d++) for (let h = 0; h < 24; h++) {
    const date = new Date(Date.parse(day0 + "T00:00:00Z") + d * 864e5).toISOString().slice(0, 10);
    time.push(date + "T" + String(h).padStart(2, "0") + ":00");
    const x = fn(d, h);
    temperature_2m.push(x.temp ?? 12); precipitation_probability.push(x.pp ?? 0); wind_speed_10m.push(x.wind ?? 10); cape.push(x.cape ?? 0);
  }
  return { time, temperature_2m, precipitation_probability, wind_speed_10m, cape };
}

test("hour states: storm beats rain beats wind beats cold", () => {
  assert.equal(hourState({ pp: 60 }), "storm");
  assert.equal(hourState({ pp: 30, cape: 900 }), "storm");
  assert.equal(hourState({ pp: 35 }), "wet");
  assert.equal(hourState({ wind: 40 }), "wind");
  assert.equal(hourState({ temp: 1 }), "cold");
  assert.equal(hourState({ temp: 10, wind: 10, pp: 10 }), "good");
});

test("verdict: longest good window, storms in the afternoon -> leave early", () => {
  const h = hourly("2026-07-12", (d, hr) => (d === 0 && hr >= 14 ? { pp: 70, cape: 1200 } : {}));
  const v = dayVerdict(h, 0);
  assert.equal(v.cells.length, 13);
  assert.deepEqual(v.window, { from: 7, to: 14 });
  assert.equal(v.label, "Ideale 7–14");
  assert.equal(advice(v).head, "Parti entro le 12:00");
  const tomorrow = dayVerdict(h, 1);
  assert.equal(tomorrow.label, "Ideale tutto il giorno");
  assert.ok(tomorrow.score > v.score);
});

test("verdict: a stormy day says so", () => {
  const v = dayVerdict(hourly("2026-07-12", (d, hr) => (hr >= 10 ? { pp: 80 } : { pp: 40 })), 0);
  assert.equal(v.window, null);
  assert.equal(v.label, "Temporali dalle 10");
  assert.equal(v.tone, "bad");
});

test("verdict without data", () => {
  assert.equal(dayVerdict({}, 0).tone, "na");
});

/* ---------------------------------------------------------------- diary */
test("diary: totals, best time across sides, durations", () => {
  const a = { name: "A", elevation: 2000, dates: ["2026-07-01", "2026-08-01"], efforts: [{}, {}], bestTime: { "Da X": { sec: 3000, moving: 2800, date: "2026-07-01" }, "Da Y": { sec: 2600, moving: 2500, date: "2026-08-01" } } };
  const b = { name: "B", elevation: 1500, dates: ["2026-06-01"] };
  const s = diaryStats([a, b]);
  assert.equal(s.climbs, 2); assert.equal(s.efforts, 3); assert.equal(s.top.name, "A");
  assert.deepEqual(bestOf(a), { side: "Da Y", sec: 2500, date: "2026-08-01" });
  assert.equal(bestOf(b), null);
  assert.equal(dur(3725), "1:02:05"); assert.equal(dur(725), "12:05");
});

test("labels from the classic app lose their emoji", () => {
  assert.equal(cleanLabel("🛣️ Asfalto"), "Asfalto");
  assert.equal(cleanLabel("🪨 Sterrato/gravel"), "Sterrato/gravel");
});

test("profile samples sit at TRACK INDEXES, not at even distances (as the classic app)", () => {
  // track: 10 points over the first 0.1 km (dense: hairpins), then 10 points 0.9 km apart (9.1 km,
  // scaled to distance_km 10); the middle sample is track index 10, at 1.0 / 9.1 * 10 = 1.1 km
  const t = [];
  for (let i = 0; i < 10; i++) t.push([46 + i * 0.1 / 9 / 111.2, 11]);
  for (let i = 1; i <= 10; i++) t.push([46 + (0.1 + i * 0.9) / 111.2, 11]);
  const v = { distance_km: 10, elevationProfile: [1000, 1100, 1500], track: t };   // samples at index 0, 10, 19
  const pd = profileDist(v);
  assert.equal(pd[0], 0);
  assert.ok(Math.abs(pd[1] - 1.1) < 0.01, "middle sample at ~1.1 km, not 5 km: " + pd[1]);
  assert.ok(Math.abs(pd[2] - 10) < 1e-9);
  assert.ok(Math.abs(eleAt(v, pd[1]) - 1100) < 1e-6);
  assert.equal(profileDist({ ...v, elevSource: "gpx" })[1], 5, "GPX profiles stay evenly spaced");
});

test("hairpins: a zig-zag road counts its turns; a straight road has none", () => {
  const z = [];
  for (let k = 0; k < 6; k++) { const la = 46 + k * 0.0006; z.push([la, 11], [la, 11.002], [la + 0.0003, 11.002], [la + 0.0003, 11]); }
  assert.ok(hairpins(z) >= 8, "zig-zag " + hairpins(z));
  assert.equal(hairpins(V.track), 0);
});

test("climbing time from W/kg on the profile (Ferrari VAM + the weather speed model)", () => {
  const m3 = climbMinutes(V, 3), m4 = climbMinutes(V, 4);
  assert.ok(m3 > m4 && m4 > 0);
  assert.ok(m3 > 40 && m3 < 70, "3 W/kg on 10 km at 8%: " + m3);
  assert.equal(clock(75), "1h15"); assert.equal(clock(42.4), "42'");
});

test("traffic model as the classic app; unknown traffic says nothing", () => {
  assert.deepEqual(traffic({ traffic: "alto" }, { region: "Veneto", elevation: 1500 }), { fer: 8, wkd: 10, trucks: "possibili" });
  assert.deepEqual(traffic({ trafFeriale: 3, trafWeekend: 5 }, {}), { fer: 3, wkd: 5, trucks: "rari" });
  assert.equal(traffic({ traffic: "n/d" }, {}), null);
});

test("water along the climb: within 100 m of the track, with its km", () => {
  const w = alongTrack(V, [{ lat: 46 + 3 / 111.2, lon: 11.0005 }, { lat: 46 + 3 / 111.2, lon: 11.01 }]);
  assert.equal(w.length, 1);
  assert.ok(Math.abs(w[0].km - 3) < 0.15 && w[0].m < 60);
});

test("POI: what counts as water and food for a cyclist; cells of a track", async () => {
  const { classify, cellsFor, cellKey } = await import("../v2/lib/poi.mjs");
  assert.equal(classify({ amenity: "drinking_water" }).kind, "water");
  assert.equal(classify({ natural: "spring", drinking_water: "no" }).label, null);
  assert.equal(classify({ amenity: "fountain" }), null, "decorative fountains are not water");
  assert.equal(classify({ amenity: "cafe" }).label, "Bar");
  assert.equal(classify({ highway: "bus_stop" }), null);
  assert.equal(cellKey(46.53, 10.45), "186_41");
  assert.deepEqual(cellsFor([[46.30, 10.40], [46.53, 10.45]]), ["185_41", "186_41"]);
});

test("7-day weather rows and community ratings summary", async () => {
  const { dailyRows, wmoLabel } = await import("../v2/lib/weather.mjs");
  const { ratingSummary } = await import("../v2/lib/diary.mjs");
  assert.equal(wmoLabel(0), "Sereno"); assert.equal(wmoLabel(95), "Temporali"); assert.equal(wmoLabel(73), "Neve");
  const r = dailyRows({ time: ["2026-10-30"], weather_code: [61], temperature_2m_max: [5], temperature_2m_min: [-1], precipitation_probability_max: [70], wind_speed_10m_max: [20] });
  assert.deepEqual(r[0], { date: "2026-10-30", label: "Pioggia", code: 61, tmax: 5, tmin: -1, pp: 70, wind: 20 });
  const s = ratingSummary({ n: 2, eSum: 10, pSum: 8, tSum: 6, aSum: 8 });
  assert.equal(s.n, 2); assert.equal(s.overall, 4); assert.deepEqual(s.axes[0], ["Emozione", 5]);
  assert.equal(ratingSummary(null).n, 0);
});

test("never '-0' in numbers", () => {
  assert.equal(num(-0.3, 0), "0"); assert.equal(num(-0.04, 1), "0,0"); assert.equal(num(-1.6, 0), "-2");
});

test("index merge: one marker per pass (dup ids, co-located, curated twins incl. same name ~1 km away)", async () => {
  const { mergeIndex, baseName } = await import("../v2/lib/data.mjs");
  const curated = [{ id: "mortirolo", name: "Passo del Mortirolo", lat: 46.24738, lon: 10.29587, twins: [] }];
  const idx = [
    { id: "osm-1", name: "Passo del Mortirolo", lat: 46.24935, lon: 10.30737, hasV: 1, f: 0 },   // 900 m east, same name
    { id: "osm-1", name: "Passo del Mortirolo", lat: 46.24935, lon: 10.30737, hasV: 1, f: 76 },
    { id: "osm-2", name: "Cima A", lat: 46.4, lon: 10.4, hasV: 1, f: 3 },
    { id: "osm-3", name: "Cima A (FR)", lat: 46.4005, lon: 10.4004, hasV: 1, f: 9 },             // border twin, other file
    { id: "osm-4", name: "Nessun versante", lat: 46.5, lon: 10.5, f: 1 }
  ];
  const out = mergeIndex(idx, curated);
  assert.deepEqual(out.map((p) => p.id), ["osm-2"]);
  assert.deepEqual(out[0].co.map((p) => p.id), ["osm-3"]);
  assert.deepEqual(curated[0].twins.map((p) => p.id), ["osm-1"]);
  assert.deepEqual(curated[0].twins[0].fs, [0, 76]);
  assert.equal(baseName("Passo dello Stelvio"), "stelvio");
});

test("curated pass adopts only the twin sides from another direction (as v1 newSidesFor)", async () => {
  const { newSidesFor, sameOrigin } = await import("../v2/lib/climb.mjs");
  const p = { lat: 46.34, lon: 10.49, versanti: [{ startLat: 46.467, startLon: 10.383 }] };               // from the NW (Bormio)
  const tr = [[0, 0], [1, 1]];
  const same = { startLat: 46.466, startLon: 10.384, track: tr }, south = { startLat: 46.255, startLon: 10.509, track: tr };
  assert.deepEqual(newSidesFor(p, [same, south]), [south]);
  assert.ok(sameOrigin(same, p.versanti[0]));
});

test("auth errors in Italian", async () => {
  const { authError } = await import("../v2/lib/diary.mjs");
  assert.equal(authError({ code: "auth/wrong-password" }), "Password sbagliata.");
  assert.equal(authError({ message: "boom" }), "boom");
});

import { displayName, isGravel, placeHit } from "../v2/lib/data.mjs";
test("displayName: generic OSM names get the height; fixed ids; real names untouched", () => {
  assert.equal(displayName({ id: "a", name: "Passo", elevation: 2959 }), "Passo a 2959 m");
  assert.equal(displayName({ id: "a", name: "colle", elevation: 900 }), "Colle a 900 m");
  assert.equal(displayName({ id: "a", name: "Sattel" }), "Sattel senza nome");
  assert.equal(displayName({ id: "a", name: "", elevation: 1200 }), "Salita a 1200 m");
  assert.equal(displayName({ id: "a", name: "Passo Gavia", elevation: 2621 }), "Passo Gavia");
  assert.equal(displayName({ id: "osm-rt4692440x1094453", name: "Tunnelausgang Süd" }), "Ötztaler Gletscherstraße (Tiefenbach)");
});
test("isGravel reads the pipeline's surface labels", () => {
  assert.ok(isGravel({ surfaceLabel: "🪨 Sterrato/gravel" }));
  assert.ok(isGravel({ surfaceLabel: "Fondo: unpaved" }));
  assert.ok(isGravel({ surfaceLabel: "Fondo: dirt" }));
  assert.ok(!isGravel({ surfaceLabel: "🛣️ Asfalto" }));
  assert.ok(!isGravel({ surfaceLabel: "Fondo: sett" }));
  assert.ok(!isGravel({}));
});
test("placeHit: Nominatim jsonv2 -> name, context, bounds as [[w,s],[e,n]]", () => {
  const p = placeHit({ lat: "46.4677", lon: "10.3707", name: "Bormio", display_name: "Bormio, Comunità montana Alta Valtellina, Sondrio, Lombardia, 23032, Italia", boundingbox: ["46.43", "46.52", "10.30", "10.45"] });
  assert.equal(p.name, "Bormio");
  assert.equal(p.sub, "Comunità montana Alta Valtellina, Sondrio");
  assert.deepEqual(p.bb, [[10.3, 46.43], [10.45, 46.52]]);
  assert.equal(placeHit({ lat: "x", lon: "1" }), null);
});

import { countryOfFile, assignCountries, fewTrucks } from "../v2/lib/data.mjs";
test("countryOfFile: country from the region file name; border files and proposals left to the neighbours", () => {
  assert.equal(countryOfFile("osm_passes.json"), "IT");
  assert.equal(countryOfFile("osm_passes_fr_paca.json"), "FR");
  assert.equal(countryOfFile("osm_passes_de_by.json"), "DE");
  assert.equal(countryOfFile("osm_passes_sud.json"), "IT");
  assert.equal(countryOfFile("osm_passes_disc_lombardia.json"), "IT");
  assert.equal(countryOfFile("osm_passes_disc_france-rhone-alpes.json"), "FR");
  assert.equal(countryOfFile("osm_passes_disc_andorra.json"), "AD");
  assert.equal(countryOfFile("osm_passes_nl_lu.json"), "NLLU");
  assert.equal(countryOfFile("osm_passes_xb_itsi.json"), null);
  assert.equal(countryOfFile("osm_passes_user.json"), null);
  assert.equal(countryOfFile("curated_overrides.json"), null);
});
test("assignCountries: border climbs take the nearest climb's country", () => {
  const regions = ["osm_passes.json", "osm_passes_si.json", "osm_passes_xb_itsi.json"];
  const cl = [{ lat: 46.30, lon: 13.40, f: 0 }, { lat: 46.30, lon: 13.80, f: 1 }, { lat: 46.31, lon: 13.75, f: 2 }, { lat: 46.30, lon: 13.45, f: 2 }, { lat: 46.5, lon: 10.4, curated: true }];
  assignCountries(cl, regions);
  assert.deepEqual(cl.map((c) => c.cc), ["IT", "SI", "SI", "IT", "IT"]);
});
test("fewTrucks: only 'possibili' and 'si' count as trucks", () => {
  assert.ok(fewTrucks({}));
  assert.ok(fewTrucks({ tk: "no" }));
  assert.ok(!fewTrucks({ tk: "possibili" }));
  assert.ok(!fewTrucks({ trucks: "si" }));
});

test("hardestFirst: paved hard climbs first, unpaved after, implausible last", async () => {
  const { hardestFirst } = await import("../v2/lib/data.mjs");
  const l = [{ n: "theodul", difficulty: 10, elevation: 3295, surfaceLabel: "🪨 Sterrato/gravel" }, { n: "schartl", difficulty: 10, elevation: 3127, q: 1 },
    { n: "stelvio", difficulty: 10, elevation: 2758 }, { n: "gavia", difficulty: 9, elevation: 2621, surfaceLabel: "🛣️ Asfalto" }];
  assert.deepEqual(l.sort(hardestFirst).map((c) => c.n), ["stelvio", "gavia", "theodul", "schartl"]);
});

test("basemaps: Notte+ by default, Ciclabile for the Giro, every one attributed", async () => {
  const { BASEMAPS, basemap, DEFAULT_MAP, GIRO_MAP, notteRoads } = await import("../v2/lib/maps.mjs");
  assert.deepEqual(BASEMAPS.map((b) => b.id), ["notte", "chiara", "ciclabile", "topo", "satellite"]);
  assert.equal(basemap("nope").id, DEFAULT_MAP);
  assert.equal(basemap(GIRO_MAP).label, "Ciclabile");
  for (const b of BASEMAPS) if (typeof b.style !== "string") assert.ok(b.style.sources.base.attribution.length > 10, b.id);
  assert.deepEqual(notteRoads({ type: "line", id: "road_major" }), { "line-color": "#8A9AAD", "line-opacity": 0.95 });
  assert.equal(notteRoads({ type: "circle", id: "x" }), null);
});

test("alongTrack (grid) finds the same points as a full scan", () => {
  const t = Array.from({ length: 400 }, (_, i) => [46 + i * 0.0009, 10 + Math.sin(i / 20) * 0.01]);
  const v = { track: t, distance_km: 40 };
  const pts = Array.from({ length: 300 }, (_, i) => ({ lat: 46 + (i * 37 % 360) * 0.001, lon: 10 + ((i * 53) % 40 - 20) * 0.0007, id: i }));
  const fast = alongTrack(v, pts, 120);
  // brute force reference
  const cum = [0]; for (let i = 1; i < t.length; i++) { const r = Math.PI / 180, a = Math.sin((t[i][0] - t[i - 1][0]) * r / 2) ** 2 + Math.cos(t[i - 1][0] * r) * Math.cos(t[i][0] * r) * Math.sin((t[i][1] - t[i - 1][1]) * r / 2) ** 2; cum.push(cum[i - 1] + 2 * 6371 * Math.asin(Math.sqrt(a))); }
  const ref = [];
  for (const p of pts) { let bd = Infinity, bi = 0; t.forEach((q, i) => { const r = Math.PI / 180, a = Math.sin((q[0] - p.lat) * r / 2) ** 2 + Math.cos(p.lat * r) * Math.cos(q[0] * r) * Math.sin((q[1] - p.lon) * r / 2) ** 2, d = 2 * 6371 * Math.asin(Math.sqrt(a)); if (d < bd) { bd = d; bi = i; } }); if (bd * 1000 <= 120) ref.push(p.id); }
  assert.deepEqual(fast.map((x) => x.p.id).sort((a, b) => a - b), ref.sort((a, b) => a - b));
  assert.ok(ref.length > 10);
});
