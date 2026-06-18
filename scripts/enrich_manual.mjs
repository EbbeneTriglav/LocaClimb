#!/usr/bin/env node
/*
 * enrich_manual.mjs - homogenize MANUAL climbs to Terrarium elevation.
 * ---------------------------------------------------------------------------
 * Reads manual_overrides.json (hand-drawn, human-owned: track + label + notes).
 * For every versante it RE-SAMPLES elevation along the EXISTING track using the
 * same Terrarium DEM as the main build, then recomputes distance / gain / avg /
 * max / profile / category / difficulty. The geometry (v.track) and human text
 * (side, note) are never altered. Writes manual_enriched.json, which the frontend
 * prefers over manual_overrides.json.
 *
 * Light by design: no PBF download, no road graph, no OOM. Safe to run in a small
 * GitHub Action whenever manual_overrides.json changes.
 *   node scripts/enrich_manual.mjs [--in manual_overrides.json] [--out manual_enriched.json]
 * Requires: pngjs (npm), Node 18+ (global fetch). 100% ASCII.
 */
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
const { PNG } = createRequire(import.meta.url)("pngjs");

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const IN = arg("--in", "manual_overrides.json");
const OUT = arg("--out", "manual_enriched.json");
const DEM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";
const DEM_Z = 13;
const BUILD_DATE = new Date().toISOString().slice(0, 10);

function hav(la1, lo1, la2, lo2) {
  const R = 6371, p = Math.PI / 180;
  const dLa = (la2 - la1) * p, dLo = (lo2 - lo1) * p;
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * p) * Math.cos(la2 * p) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function compass(la1, lo1, la2, lo2) {
  const p = Math.PI / 180;
  const y = Math.sin((lo2 - lo1) * p) * Math.cos(la2 * p);
  const x = Math.cos(la1 * p) * Math.sin(la2 * p) - Math.sin(la1 * p) * Math.cos(la2 * p) * Math.cos((lo2 - lo1) * p);
  const br = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  return ["Nord","Nord-Est","Est","Sud-Est","Sud","Sud-Ovest","Ovest","Nord-Ovest"][Math.round(br / 45) % 8];
}
function estDiff(distKm, gain, top) {
  if (!distKm || distKm <= 0) return 1;
  const avg = gain / (distKm * 10);
  let d = avg * 0.85 + Math.min(distKm / 6, 2.5);
  if (avg >= 12) d += 2; else if (avg >= 9) d += 1;
  if (top >= 2000) d += 1;
  return Math.max(1, Math.min(10, Math.round(d)));
}
function catRank(c) { return { HC: 5, "1": 4, "2": 3, "3": 2, "4": 1 }[c] || 0; }
function climbCat(distKm, gain, top) {
  if (gain < 150 || distKm < 1) return null;
  const f = (gain * gain) / (distKm * 1000 * 10) + Math.max(0, top - 1000) / 1000;
  if (f >= 8) return "HC"; if (f >= 5.5) return "1"; if (f >= 3.5) return "2"; if (f >= 2) return "3"; return "4";
}

const demCache = new Map();
function demTile(z, x, y) {
  const k = z + "/" + x + "/" + y;
  if (demCache.has(k)) return demCache.get(k);
  const p = (async function () {
    let png = null;
    for (let a = 0; a < 3 && !png; a++) {
      try {
        const r = await fetch(DEM_URL + "/" + k + ".png");
        if (!r.ok) throw new Error("HTTP " + r.status);
        png = PNG.sync.read(Buffer.from(await r.arrayBuffer()));
      } catch (e) { if (a === 2) console.warn("  ! dem " + k + ": " + e.message); else await new Promise((s) => setTimeout(s, 700 * (a + 1))); }
    }
    return png;
  })();
  if (demCache.size > 4000) demCache.delete(demCache.keys().next().value);
  demCache.set(k, p);
  return p;
}
async function elevAt(lat, lon) {
  const z = DEM_Z, n = 1 << z;
  const fx = (lon + 180) / 360 * n;
  const r = lat * Math.PI / 180;
  const fy = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n;
  const tx = Math.floor(fx), ty = Math.floor(fy);
  const png = await demTile(z, tx, ty);
  if (!png) return null;
  const px = Math.min(png.width - 1, Math.max(0, Math.floor((fx - tx) * png.width)));
  const py = Math.min(png.height - 1, Math.max(0, Math.floor((fy - ty) * png.height)));
  const i = (py * png.width + px) * 4;
  return (png.data[i] * 256 + png.data[i + 1] + png.data[i + 2] / 256) - 32768;
}
async function elevations(pts) {
  const out = [];
  for (const p of pts) { const e = await elevAt(p[0], p[1]); if (e == null) return null; out.push(e); }
  return out;
}
function smooth3(a) { const o = a.slice(); for (let i = 1; i < a.length - 1; i++) o[i] = (a[i - 1] + a[i] + a[i + 1]) / 3; return o; }

// Recompute a versante's elevation stats on its EXISTING track (base -> summit).
async function reEnrich(v, topLat, topLon) {
  const tr = v.track;
  if (!Array.isArray(tr) || tr.length < 4) return null;
  const rawEl = await elevations(tr);
  if (!rawEl) return null;
  const el = smooth3(rawEl);
  const cum = [0];
  for (let i = 1; i < tr.length; i++) cum.push(cum[i - 1] + hav(tr[i - 1][0], tr[i - 1][1], tr[i][0], tr[i][1]));
  const dist = cum[cum.length - 1];
  if (dist <= 0) return null;
  const startEl = Math.round(el[0]), endEl = Math.round(el[el.length - 1]);
  const gain = endEl - startEl;
  const avg = gain / (dist * 1000) * 100;
  let maxg = 0; // windowed >=250m to kill DEM noise
  for (let i = 0; i < tr.length - 1; i++) {
    let j = i; while (j < tr.length - 1 && cum[j] - cum[i] < 0.3) j++;
    const dd = (cum[j] - cum[i]) * 1000;
    if (dd >= 250) { const g = (el[j] - el[i]) / dd * 100; if (g > maxg) maxg = g; }
  }
  if (maxg < avg) maxg = avg;
  const n = Math.min(el.length, 30), prof = [];
  for (let i = 0; i < n; i++) prof.push(Math.round(el[Math.round(i * (el.length - 1) / (n - 1))]));
  const dir = compass(tr[0][0], tr[0][1], topLat, topLon); // base -> summit aspect
  const out = Object.assign({}, v); // keep side, note, track, etc.
  out.startElevation = startEl; out.endElevation = endEl;
  out.distance_km = Math.round(dist * 10) / 10;
  out.avgGradient = Math.round(avg * 10) / 10;
  out.maxGradient = Math.round(maxg * 10) / 10;
  out.exposure = dir; if (!out.side || /^Versante /.test(out.side)) out.side = "Versante " + dir;
  out.elevationProfile = prof;
  out.cat = climbCat(out.distance_km, gain, endEl);
  out.elevSource = "terrarium";
  return out;
}

async function main() {
  let data;
  try { data = JSON.parse(await readFile(IN, "utf8")); } catch (e) { console.error("cannot read " + IN + ": " + e.message); process.exit(1); }
  const out = {};
  let nPass = 0, nVers = 0, nFail = 0;
  for (const id of Object.keys(data)) {
    const entry = JSON.parse(JSON.stringify(data[id]));
    const topLat = entry.lat, topLon = entry.lon; // present on "new"; for overrides we fall back to the track summit
    const vs = Array.isArray(entry.versanti) ? entry.versanti : [];
    const fresh = [];
    for (const v of vs) {
      const tl = (topLat != null) ? topLat : (v.track && v.track.length ? v.track[v.track.length - 1][0] : 0);
      const tn = (topLon != null) ? topLon : (v.track && v.track.length ? v.track[v.track.length - 1][1] : 0);
      const r = await reEnrich(v, tl, tn);
      if (r) { fresh.push(r); nVers++; } else { fresh.push(v); nFail++; } // keep original if DEM unavailable
    }
    if (fresh.length) {
      entry.versanti = fresh;
      entry.difficulty = Math.max(...fresh.map((v) => estDiff(v.distance_km, v.endElevation - v.startElevation, v.endElevation)));
      entry.cat = fresh.map((v) => v.cat).filter(Boolean).sort((a, b) => catRank(b) - catRank(a))[0] || null;
      entry.updatedAt = BUILD_DATE; entry.elevSource = "terrarium";
    }
    out[id] = entry; nPass++;
  }
  await writeFile(OUT, JSON.stringify(out, null, 1) + "\n", "utf8");
  console.log("manual enrich: " + nPass + " passi, " + nVers + " versanti su Terrarium" + (nFail ? " (" + nFail + " saltati: DEM non disponibile)" : "") + " -> " + OUT);
}
main().catch((e) => { console.error("FATAL: " + e.stack); process.exit(1); });
