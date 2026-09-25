/*
 * gpxclimbs.js: climb detection on a ride GPX and matching against known passes.
 * Synthetic rides built along a meridian (1 deg lat = 111.2 km), elevation by distance.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const src = await readFile(new URL("../js/gpxclimbs.js", import.meta.url), "utf8");
const ctx = {}; vm.createContext(ctx); vm.runInContext(src, ctx);

/* profile: array of [km, ele] breakpoints -> GPX text, one point every 10 m, a bit of noise */
function ride(profile, noise = 1.5) {
  const pts = [], lon = 12.0, lat0 = 43.5;
  const endKm = profile[profile.length - 1][0];
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  for (let d = 0; d <= endKm + 1e-9; d += 0.01) {
    let k = 0; while (k < profile.length - 2 && profile[k + 1][0] < d) k++;
    const [d0, e0] = profile[k], [d1, e1] = profile[k + 1];
    const e = e0 + (e1 - e0) * ((d - d0) / (d1 - d0 || 1)) + rnd() * noise;
    pts.push(`<trkpt lon="${lon}" lat="${(lat0 + d / 111.2).toFixed(6)}"><ele>${e.toFixed(1)}</ele></trkpt>`);
  }
  return `<?xml version="1.0"?><gpx><trk><trkseg>${pts.join("")}</trkseg></trk></gpx>`;
}

test("parses trkpt with attributes in any order and missing elevation", () => {
  const p = ctx.gcParse('<trkpt lon="12.5" lat="43.1"><ele>250</ele></trkpt><rtept lat="43.2" lon="12.6"/>');
  assert.equal(p.length, 2);
  assert.deepEqual(Array.from(p[0]), [43.1, 12.5, 250]);
  assert.equal(p[1][2], null);
});

test("one real climb: flat approach trimmed, gain and length right, small bump ignored", () => {
  // 3 km flat, 8 km at 6% (+480 m), 8 km descent, 2 km flat, then a 40 m bump over 1 km
  const r = ctx.gcAnalyze(ride([[0, 300], [3, 305], [11, 785], [19, 300], [21, 300], [21.5, 340], [22.5, 300]]), []);
  assert.equal(r.climbs.length, 1);
  const c = r.climbs[0];
  assert.ok(Math.abs(c.km - 8) < 0.6, "km " + c.km);
  assert.ok(Math.abs(c.gain - 480) < 25, "gain " + c.gain);
  assert.ok(c.avg > 5.4 && c.avg < 6.6, "avg " + c.avg);
  assert.equal(c.match.kind, "new");
});

test("a 25 m dip in the middle does not split the climb in two", () => {
  const r = ctx.gcAnalyze(ride([[0, 400], [5, 750], [5.5, 725], [10, 1050]]), []);
  assert.equal(r.climbs.length, 1, JSON.stringify(Array.from(r.climbs, c => [c.km, c.gain])));
  assert.ok(r.climbs[0].gain > 600);
});

test("a long descent between two climbs gives two climbs", () => {
  const r = ctx.gcAnalyze(ride([[0, 300], [6, 700], [12, 300], [18, 750]]), []);
  assert.equal(r.climbs.length, 2);
});

test("rejects files without elevation", () => {
  const txt = Array.from({ length: 50 }, (_, i) => `<trkpt lat="${43 + i / 1000}" lon="12"></trkpt>`).join("");
  assert.equal(ctx.gcAnalyze(txt, []).err, "noele");
});

test("matching: same top + same side = known; other direction = newside; far = new", () => {
  const r = ctx.gcAnalyze(ride([[0, 300], [8, 800]]), []);
  const tr = r.climbs[0].tr, top = tr[tr.length - 1], st = tr[0];
  const known = { id: "k", name: "Passo Noto", lat: top[0], lon: top[1], elevation: 800, versanti: [{ side: "Da Sud", startLat: st[0], startLon: st[1] }] };
  assert.equal(ctx.gcMatch(tr, [known]).kind, "known");
  const other = { ...known, versanti: [{ side: "Da Nord", startLat: top[0] + 0.07, startLon: top[1] }] };
  assert.equal(ctx.gcMatch(tr, [other]).kind, "newside");
  const far = { ...known, lat: top[0] + 0.2 };
  assert.equal(ctx.gcMatch(tr, [far]).kind, "new");
});

test("a climb that passes a known pass and keeps going is 'via', not a new proposal", () => {
  const r = ctx.gcAnalyze(ride([[0, 300], [8, 800], [10, 950]]), []);
  const tr = r.climbs[0].tr;
  const mid = tr[Math.round(tr.length * 0.78)];
  const pass = { id: "p", name: "Passo di Mezzo", lat: mid[0], lon: mid[1] + 0.001, elevation: 800 };
  assert.equal(ctx.gcMatch(tr, [pass]).kind, "via");
});
