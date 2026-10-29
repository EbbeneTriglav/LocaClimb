/*
 * rideimport.js + the timing added to gpxclimbs.js / myclimbs.js: "Le tue salite" from real,
 * timed rides (GPX, FIT, TCX, .gz, zip exports). Files are built here, byte by byte.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import zlib from "node:zlib";

const ctx = { TextDecoder, Blob, Response, DecompressionStream, setTimeout, console };
vm.createContext(ctx);
for (const f of ["gpxclimbs", "myclimbs", "rideimport"])
  vm.runInContext(await readFile(new URL(`../js/${f}.js`, import.meta.url), "utf8"), ctx);
const plain = (x) => JSON.parse(JSON.stringify(x));

/* A timed ride along a meridian: [km, ele, kmh] breakpoints (speed of the segment that ENDS
   there), one point every 10 m; stops = [[km, seconds]] standing still at that km. */
function timedPts(profile, stops = [], t0 = Date.UTC(2026, 6, 12, 7, 0, 0)) {
  const pts = []; let t = t0, k = 0;
  const end = profile[profile.length - 1][0];
  for (let d = 0; d <= end + 1e-9; d += 0.01) {
    while (k < profile.length - 2 && profile[k + 1][0] < d) k++;
    const [d0, e0] = profile[k], [d1, e1, v] = profile[k + 1];
    const e = e0 + (e1 - e0) * ((d - d0) / (d1 - d0 || 1));
    if (d > 0) t += (0.01 / v) * 3600 * 1000;
    for (const [sk, ss] of stops) if (Math.abs(d - sk) < 0.005) { pts.push([43.5 + d / 111.2, 12, e, t]); t += ss * 1000; }
    pts.push([+(43.5 + d / 111.2).toFixed(6), 12, +e.toFixed(1), Math.round(t)]);
  }
  return pts;
}
const gpxOf = (pts) => `<?xml version="1.0"?><gpx><trk><trkseg>${pts.map((p) =>
  `<trkpt lat="${p[0]}" lon="${p[1]}"><ele>${p[2]}</ele><time>${new Date(p[3]).toISOString()}</time></trkpt>`).join("")}</trkseg></trk></gpx>`;

// 3 km flat at 30 km/h, then 8 km at 6% (+480 m) at 12 km/h, 5-minute stop at km 7
const PROFILE = [[0, 300], [3, 300, 30], [11, 780, 12]];
const PASS = { id: "osm-test", name: "Passo Prova", lat: 43.5 + 11 / 111.2, lon: 12, elevation: 780,
  versanti: [{ side: "Da Valle", startLat: 43.5 + 3 / 111.2, startLon: 12 }] };

test("GPX with <time>: climb time from the official start, stops excluded from moving time", () => {
  const res = ctx.gcAnalyze(gpxOf(timedPts(PROFILE, [[7, 300]])), [PASS]);
  assert.equal(res.timed, true);
  assert.equal(res.climbs.length, 1);
  const c = res.climbs[0], tm = c.timing;
  assert.equal(c.match.kind, "known");
  assert.equal(tm.canon, true);
  assert.ok(Math.abs(tm.km - 8) < 0.15, "km " + tm.km);
  assert.ok(Math.abs(tm.sec - (40 * 60 + 300)) < 30, "sec " + tm.sec);       // 40' riding + 5' stop
  assert.ok(Math.abs(tm.moving - 40 * 60) < 30, "moving " + tm.moving);
  assert.ok(Math.abs(tm.vam - 720) < 25, "vam " + tm.vam);                   // 480 m in 40'
  assert.equal(tm.date, "2026-07-12");
});

test("a GPX without times still finds the climb, just without timing", () => {
  const txt = gpxOf(timedPts(PROFILE)).replace(/<time>[^<]*<\/time>/g, "");
  const res = ctx.gcAnalyze(txt, [PASS]);
  assert.equal(res.timed, false);
  assert.equal(res.climbs.length, 1);
  assert.equal(res.climbs[0].timing, null);
});

test("gcDur formats h:mm:ss and m:ss", () => {
  assert.equal(ctx.gcDur(3725), "1:02:05");
  assert.equal(ctx.gcDur(725), "12:05");
});

/* ---------------------------------------------------------------- FIT */
function fitOf(pts, { compressedLast = false } = {}) {
  const FIT_EPOCH = 631065600, body = [];
  const u8 = (n) => body.push(n & 0xFF);
  const u16 = (n) => { u8(n); u8(n >> 8); };
  const u32 = (n) => { u8(n); u8(n >>> 8); u8(n >>> 16); u8(n >>> 24); };
  // definition, local 0 -> global 20 (record): 253 ts uint32, 0 lat sint32, 1 lon sint32, 78 enh. altitude uint32
  u8(0x40); u8(0); u8(0); u16(20); u8(4);
  for (const [num, size, base] of [[253, 4, 0x86], [0, 4, 0x85], [1, 4, 0x85], [78, 4, 0x86]]) { u8(num); u8(size); u8(base); }
  // definition, local 1 -> global 20 without timestamp (for compressed-timestamp records)
  u8(0x41); u8(0); u8(0); u16(20); u8(3);
  for (const [num, size, base] of [[0, 4, 0x85], [1, 4, 0x85], [78, 4, 0x86]]) { u8(num); u8(size); u8(base); }
  const semi = (deg) => Math.round(deg / 180 * 2147483648);
  pts.forEach((p, i) => {
    const ts = Math.round(p[3] / 1000) - FIT_EPOCH;
    if (compressedLast && i === pts.length - 1) {
      u8(0x80 | (1 << 5) | (ts & 0x1F));
    } else { u8(0x00); u32(ts); }
    u32(semi(p[0])); u32(semi(p[1])); u32(Math.round((p[2] + 500) * 5));
  });
  const head = [14, 0x20, 0x00, 0x00, ...[0, 0, 0, 0], 0x2E, 0x46, 0x49, 0x54, 0, 0];
  const n = body.length; head[4] = n & 0xFF; head[5] = (n >> 8) & 0xFF; head[6] = (n >> 16) & 0xFF; head[7] = (n >>> 24) & 0xFF;
  return new Uint8Array([...head, ...body, 0, 0]);
}

test("FIT: record messages -> points with position, altitude and time", () => {
  const pts = timedPts(PROFILE).filter((_, i) => i % 5 === 0);
  const r = ctx.riFitParse(fitOf(pts, { compressedLast: true }));
  assert.equal(r.pts.length, pts.length);
  const a = r.pts[10], b = pts[10];
  assert.ok(Math.abs(a[0] - b[0]) < 1e-5 && Math.abs(a[1] - b[1]) < 1e-5);
  assert.ok(Math.abs(a[2] - b[2]) < 0.3);
  assert.equal(a[3], Math.round(b[3] / 1000) * 1000);
  assert.equal(r.pts[r.pts.length - 1][3], Math.round(pts[pts.length - 1][3] / 1000) * 1000, "compressed timestamp");
  assert.equal(r.date, "2026-07-12");
  const res = ctx.gcAnalyzePts(r.pts, [PASS], r.date);
  assert.equal(res.climbs[0].match.kind, "known");
  assert.ok(Math.abs(res.climbs[0].timing.moving - 40 * 60) < 40);
});

test("FIT: not a FIT file -> error, no throw", () => {
  assert.equal(ctx.riFitParse(new Uint8Array(40)).err, "fit");
});

test("TCX trackpoints with time and altitude", () => {
  const r = ctx.riTcxParse(`<Trackpoint><Time>2026-07-12T07:00:00Z</Time><Position><LatitudeDegrees>46.1</LatitudeDegrees><LongitudeDegrees>10.2</LongitudeDegrees></Position><AltitudeMeters>812.4</AltitudeMeters></Trackpoint>`);
  assert.deepEqual(plain(r.pts), [[46.1, 10.2, 812.4, Date.UTC(2026, 6, 12, 7)]]);
  assert.equal(r.date, "2026-07-12");
});

test("riKind recognises ride files, gz and zips; ignores the rest", () => {
  assert.deepEqual(plain(ctx.riKind("activities/123.fit.gz")), { fmt: "fit", gz: true });
  assert.deepEqual(plain(ctx.riKind("Ride.GPX")), { fmt: "gpx", gz: false });
  assert.deepEqual(plain(ctx.riKind("export_123.zip")), { fmt: "zip", gz: false });
  assert.equal(ctx.riKind("media/photo.jpg"), null);
  assert.equal(ctx.riKind("activities.csv"), null);
});

/* ---------------------------------------------------------------- ZIP */
function zipOf(entries) {   // [{ name, data: Uint8Array, deflate: bool }]
  const chunks = [], cd = []; let off = 0;
  const le = (n, b) => { const a = new Uint8Array(b); for (let i = 0; i < b; i++) a[i] = (n / 2 ** (8 * i)) & 0xFF; return a; };
  for (const e of entries) {
    const name = new TextEncoder().encode(e.name), comp = e.deflate ? zlib.deflateRawSync(e.data) : e.data;
    const crc = zlib.crc32(e.data), m = e.deflate ? 8 : 0;
    const lh = [le(0x04034b50, 4), le(20, 2), le(0, 2), le(m, 2), le(0, 4), le(crc, 4), le(comp.length, 4), le(e.data.length, 4), le(name.length, 2), le(0, 2), name];
    cd.push([le(0x02014b50, 4), le(20, 2), le(20, 2), le(0, 2), le(m, 2), le(0, 4), le(crc, 4), le(comp.length, 4), le(e.data.length, 4),
      le(name.length, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(off, 4), name]);
    for (const c of lh) { chunks.push(c); off += c.length; }
    chunks.push(comp); off += comp.length;
  }
  const cdStart = off; let cdLen = 0;
  for (const parts of cd) for (const c of parts) { chunks.push(c); cdLen += c.length; }
  chunks.push(le(0x06054b50, 4), le(0, 2), le(0, 2), le(entries.length, 2), le(entries.length, 2), le(cdLen, 4), le(cdStart, 4), le(0, 2));
  return new Uint8Array(Buffer.concat(chunks.map((c) => Buffer.from(c))));
}

test("zip export: deflate + stored + .gz entries, nested zip, other files ignored", async () => {
  const pts = timedPts(PROFILE);
  const gpx = new TextEncoder().encode(gpxOf(pts));
  const fit = fitOf(pts.filter((_, i) => i % 5 === 0));
  const inner = zipOf([{ name: "UploadedFiles/ride.fit", data: fit, deflate: true }]);
  const outer = zipOf([
    { name: "activities/1.gpx", data: gpx, deflate: true },
    { name: "activities/2.fit.gz", data: new Uint8Array(zlib.gzipSync(fit)), deflate: false },
    { name: "media/photo.jpg", data: new Uint8Array([1, 2, 3]), deflate: false },
    { name: "DI_CONNECT/Part1.zip", data: inner, deflate: false }
  ]);
  const seen = [];
  await ctx.riWalk([new File([outer], "export.zip")], (name, fmt, u8) => {
    const r = ctx.riPoints(fmt, u8);
    seen.push([name, fmt, r.pts.length > 100]);
  }, () => null);
  assert.deepEqual(seen.map((s) => s[0]).sort(), ["UploadedFiles/ride.fit", "activities/1.gpx", "activities/2.fit.gz"]);
  assert.ok(seen.every((s) => s[2]), "every ride has its points");
});

/* ------------------------------------------------- myclimbs: tempi salvati */
test("efforts: same ride twice is one effort; best time per side prefers official-start timings", () => {
  const base = { passId: "osm-test", name: "Passo Prova", lat: 0, lon: 0, elevation: 780, side: "Da Valle", km: 8, gain: 480 };
  let d = ctx.mcMerge(null, { ...base, date: "2026-07-12", sec: 2700, moving: 2400, start: "2026-07-12T07:06:00Z", canon: true });
  d = ctx.mcMerge(d, { ...base, date: "2026-07-12", sec: 2700, moving: 2400, start: "2026-07-12T07:06:00Z", canon: true });
  assert.equal(d.efforts.length, 1);
  d = ctx.mcMerge(d, { ...base, date: "2026-08-01", sec: 2500, moving: 2300, start: "2026-08-01T07:00:00Z", canon: true });
  d = ctx.mcMerge(d, { ...base, date: "2026-08-20", sec: 1900, moving: 1800, start: "2026-08-20T07:00:00Z", canon: false });
  assert.equal(d.efforts.length, 3);
  assert.equal(d.bestTime["Da Valle"].moving, 2300, "the faster non-canon effort started elsewhere");
  assert.deepEqual(plain(d.dates), ["2026-07-12", "2026-08-01", "2026-08-20"]);
});

test("entries from an analysis carry the timing", () => {
  const res = ctx.gcAnalyze(gpxOf(timedPts(PROFILE)), [PASS]);
  const en = ctx.mcEntriesFrom(res);
  assert.equal(en.length, 1);
  assert.equal(en[0].side, "Da Valle");
  assert.ok(en[0].sec > 0 && en[0].moving > 0 && en[0].start);
  assert.equal(en[0].canon, true);
});
