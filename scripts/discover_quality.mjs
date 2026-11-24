#!/usr/bin/env node
/*
 * discover_quality.mjs - weekly quality report of the climb search (osm-discover), 21/11/2026.
 *
 * Rick (21/11/2026): "controlla l'algoritmo per la ricerca e se funziona fallo girare in loop per
 * migliorare le salite" - option B: measure what the search finds against references, write the
 * report, fix the algorithm in a PR, and the rotation (osm-discover-rotate.yml) recomputes every zone.
 *
 * Three measures, no network, no DEM (reads only data/):
 *   1. known climbs: every entry of data/climbs_extra.json (hand-located summit finishes, Grand Tour
 *      GPMs, walls) must have a published climb within KNOWN_KM in data/osm_index.json;
 *   2. suspicious sides in data/discover_<region>.json, by region (rates point at the algorithm or the
 *      DEM: a region far above the others is where to look first);
 *   3. coverage: discover regions never searched (no data/discover_<region>.json).
 *
 *   node scripts/discover_quality.mjs [--md docs/qualita-salite.md] [--json docs/qualita-salite.json]
 * Pure functions are covered by test/discover-quality.test.mjs.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dataPath } from "./lib/paths.mjs";
import { DISCOVER_REGIONS } from "./lib/discover.mjs";

export const KNOWN_KM = 1.0;
/* flag -> rule. Thresholds are deliberately loose: a flag is "go and look", not "wrong". */
export const FLAGS = {
  ripida: "pendenza media sopra il 15% per almeno 1,5 km (DEM, galleria o ponte)",
  picco: "pendenza massima sopra il 30% (punto del DEM sbagliato)",
  piatta: "oltre 25 km sotto il 3,5% di media (fondovalle non tagliato)",
  salto: "un tratto del profilo sopra il 35% tra due campioni (salto del DEM)",
  incoerente: "dislivello diverso da lunghezza x pendenza media (oltre il 15%)"
};

export function km(aLat, aLon, bLat, bLon) {
  const r = Math.PI / 180, x = (bLon - aLon) * r * Math.cos(((aLat + bLat) / 2) * r), y = (bLat - aLat) * r;
  return 6371 * Math.hypot(x, y);
}

/* pure: one side -> its flag codes (see FLAGS) */
export function sideFlags(v) {
  const out = [], d = +v.distance_km || 0, avg = +v.avgGradient || 0, gain = (+v.endElevation || 0) - (+v.startElevation || 0);
  if (avg > 15 && d >= 1.5) out.push("ripida");
  if ((+v.maxGradient || 0) > 30) out.push("picco");
  if (d > 25 && avg < 3.5) out.push("piatta");
  const p = Array.isArray(v.elevationProfile) ? v.elevationProfile : [];
  if (p.length > 2 && d > 0) {
    const step = (d * 1000) / (p.length - 1);
    for (let i = 1; i < p.length; i++) if (Math.abs(p[i] - p[i - 1]) / step > 0.35) { out.push("salto"); break; }
  }
  if (d > 0 && gain > 0 && Math.abs(gain - d * avg * 10) > Math.max(30, 0.15 * gain)) out.push("incoerente");
  return out;
}

/* pure: the climbs of data/discover_<region>.json -> counts, flag counts and up to `ex` examples */
export function regionQuality(climbs, ex = 5) {
  const flags = Object.fromEntries(Object.keys(FLAGS).map((k) => [k, 0]));
  let sides = 0, flagged = 0;
  const examples = [];
  for (const c of climbs || []) {
    for (const v of c.versanti || []) {
      sides++;
      const f = sideFlags(v);
      if (!f.length) continue;
      flagged++;
      for (const k of f) flags[k]++;
      if (examples.length < ex) examples.push({ id: c.id, name: c.name, side: v.side, flags: f, km: v.distance_km, avg: v.avgGradient });
    }
  }
  return { climbs: (climbs || []).length, sides, flagged, rate: sides ? +(flagged / sides).toFixed(3) : 0, flags, examples };
}

/* pure: reference climbs [{ id, name, lat, lon }] + published index [{ lat, lon, name }] -> the ones
   with no published climb within maxKm, with the nearest distance */
export function knownMissing(refs, index, maxKm = KNOWN_KM) {
  const out = [];
  for (const r of refs) {
    let best = Infinity, bestName = "";
    for (const p of index) {
      if (Math.abs(p.lat - r.lat) > 0.2) continue;
      const d = km(r.lat, r.lon, p.lat, p.lon);
      if (d < best) { best = d; bestName = p.name; }
    }
    if (best > maxKm) out.push({ id: r.id, name: r.name, lat: r.lat, lon: r.lon, nearestKm: Number.isFinite(best) ? +best.toFixed(1) : null, nearest: bestName });
  }
  return out;
}

/* pure: "minlon,minlat,maxlon,maxlat" contains the point */
export function inBbox(bbox, lat, lon) {
  const b = String(bbox || "").split(",").map(Number);
  return b.length === 4 && lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];
}

/* pure: the report -> markdown (Italian, short: the first table is where to look) */
export function renderMarkdown(rep) {
  const L = [`# Qualita' della ricerca salite (${rep.date})`, "",
    `Generato da \`scripts/discover_quality.mjs\` (ogni lunedi', discover-quality.yml). Un segnale = "vai a guardare", non "sbagliato".`, "",
    `- Regioni cercate: ${rep.searched} su ${rep.regions}; mai cercate: ${rep.never.length}`,
    `- Versanti trovati: ${rep.totSides}; con almeno un segnale: ${rep.totFlagged} (${(rep.totSides ? (100 * rep.totFlagged / rep.totSides) : 0).toFixed(1)}%)`,
    `- Salite note senza salita pubblicata entro ${KNOWN_KM} km: ${rep.missing.length} su ${rep.known}`, "",
    "## Regioni con piu' segnali (prime 15)", "", "| Regione | Salite | Versanti | Segnali | % | " + Object.keys(FLAGS).join(" | ") + " |",
    "|---|---|---|---|---|" + Object.keys(FLAGS).map(() => "---").join("|") + "|"];
  for (const r of rep.worst) L.push(`| ${r.region} | ${r.climbs} | ${r.sides} | ${r.flagged} | ${(100 * r.rate).toFixed(1)} | ` + Object.keys(FLAGS).map((k) => r.flags[k]).join(" | ") + " |");
  L.push("", "Segnali:", ...Object.entries(FLAGS).map(([k, t]) => `- **${k}**: ${t}`));
  L.push("", "## Salite note mancanti (data/climbs_extra.json)", "");
  if (!rep.missing.length) L.push("Nessuna.");
  const MAXL = 80;   // the full list is in the .json (23/11/2026: ~800 Grand Tour climbs forced at once)
  for (const m of rep.missing.slice(0, MAXL)) L.push(`- ${m.name} (${m.id}, ${m.lat}, ${m.lon})${m.zone ? " - zona " + m.zone : ""}: la piu' vicina e' ${m.nearest || "nessuna"}${m.nearestKm != null ? " a " + m.nearestKm + " km" : ""}`);
  if (rep.missing.length > MAXL) L.push(`- ... e altre ${rep.missing.length - MAXL} (elenco completo in docs/qualita-salite.json)`);
  L.push("", "## Esempi da controllare (2 per regione, le peggiori)", "");
  for (const r of rep.worst) for (const e of r.examples.slice(0, 2)) L.push(`- ${r.region}: ${e.name} - ${e.side} (${e.km} km al ${e.avg}%): ${e.flags.join(", ")} - https://locaride.app/#/s/${encodeURIComponent(e.id)}`);
  L.push("", "## Regioni mai cercate", "", rep.never.length ? rep.never.join(", ") : "Nessuna.", "");
  return L.join("\n");
}

export function buildReport({ regions, discover, refs, index, date }) {
  const rows = [];
  let totSides = 0, totFlagged = 0;
  const never = [];
  for (const id of regions) {
    if (!discover[id]) { never.push(id); continue; }
    const q = regionQuality(discover[id]);
    totSides += q.sides; totFlagged += q.flagged;
    rows.push({ region: id, ...q });
  }
  const worst = rows.filter((r) => r.sides >= 20).sort((a, b) => b.rate - a.rate || b.flagged - a.flagged).slice(0, 15);
  const missing = knownMissing(refs, index).map((m) => ({ ...m, zone: regions.find((id) => inBbox(DISCOVER_REGIONS[id]?.bbox, m.lat, m.lon)) || null }));
  return { date, regions: regions.length, searched: rows.length, never, totSides, totFlagged, known: refs.length, missing, worst, byRegion: rows.map(({ examples, ...r }) => r) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const regions = Object.keys(DISCOVER_REGIONS), discover = {};
  for (const id of regions) {
    const p = dataPath("discover_" + id + ".json");
    if (existsSync(p)) discover[id] = JSON.parse(readFileSync(p, "utf8"));
  }
  const refs = JSON.parse(readFileSync(dataPath("climbs_extra.json"), "utf8")).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon));
  const index = JSON.parse(readFileSync(dataPath("osm_index.json"), "utf8"));
  const rep = buildReport({ regions, discover, refs, index, date: new Date().toISOString().slice(0, 10) });
  const md = renderMarkdown(rep);
  if (arg("--md")) writeFileSync(arg("--md"), md);
  if (arg("--json")) writeFileSync(arg("--json"), JSON.stringify(rep, null, 1) + "\n");
  console.log(md);
}
