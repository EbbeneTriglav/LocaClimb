// v2/lib/*.mjs - pure logic of the new frontend (road book, profile, ride mode, weather verdict, diary).
import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeColor, difficultyColor, num, eleAt, kmTable, hardestKm, profileShapes, trackWithEle, gpx, positionOnClimb, sideStats } from "../v2/lib/climb.mjs";
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
  assert.equal(eleAt(V, 2.5), 1150);
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
