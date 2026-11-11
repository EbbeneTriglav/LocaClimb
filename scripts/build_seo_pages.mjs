#!/usr/bin/env node
/*
 * build_seo_pages.mjs - writes the pages Google can index (see scripts/lib/seo.mjs):
 *   salite/<slug>/index.html   one page per climb
 *   salite/index.html          the hub (hardest climbs + A-Z)
 *   salite/indice/<l>/index.html  one page per initial
 *   sitemap.xml, robots.txt
 * The climbs are the app's own (v2/lib/data.mjs: the same merge of curated passes, index and
 * region files), so a page never shows numbers the app does not. Which climbs get a page:
 * every curated pass; paved Italian climbs of difficulty >= 3; paved European climbs of
 * difficulty >= 7. Not: gravel, implausible gradients (flag "q"), names that are a street or a
 * placeholder ("Via ...", "Salita presso ..."). The output is deterministic (no dates of the
 * run), so a rebuild with the same data changes no file.
 *   node scripts/build_seo_pages.mjs            write
 *   node scripts/build_seo_pages.mjs --check    count only, write nothing
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { mergeIndex, displayName, assignCountries, isGravel, setNameFixes, fixSides, COUNTRIES } from "../v2/lib/data.mjs";
import { passDifficulty } from "../v2/lib/difficulty.mjs";
import { sameOrigin, newSidesFor } from "../v2/lib/climb.mjs";
import { SITE, CSS, assignSlugs, sideRows, climbPage, hubPage, letterPage, initialOf, sitemapXml, robotsTxt, nearest } from "./lib/seo.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const D = path.join(ROOT, "data");
const CHECK = process.argv.includes("--check");
const readJson = (f, dflt) => { try { return JSON.parse(fs.readFileSync(path.join(D, f), "utf8")); } catch { return dflt; } };

export const STREET = /^(via|strada|str[aá]da|viale|vicolo|localit[aà]|frazione|salita presso|salita a \d+|salita senza|sp\s?\d+|ss\s?\d+)(?![\p{L}\p{N}])/iu;
const EUROPE = new Set(["FR", "CH", "AT", "SI", "ES", "DE", "AD", "HR", "PT", "BE", "NLLU", "GB", "GR", "NO", "CZ", "SK", "PL", "BA", "BAL", "RS", "BG", "RO", "HU", "IE"]);
export function wanted(c) {
  if (c.curated) return true;
  if (isGravel(c) || c.q || STREET.test(c.name || "")) return false;
  const d = c.difficulty || 0;
  return (c.cc === "IT" && d >= 3) || (EUROPE.has(c.cc) && d >= 7);
}

function load() {
  const idx = readJson("osm_index.json", []), regions = readJson("osm_regions.json", []), ov = readJson("curated_overrides.json", {});
  const fixes = readJson("name_fixes.json", {});
  setNameFixes(fixes);
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(D, "passes_data.js"), "utf8") + ";this.PASSES_DATA = PASSES_DATA;", ctx);
  const curated = ctx.PASSES_DATA.map((p) => {
    const o = ov[p.id] || {}, versanti = o.versanti && o.versanti.length ? o.versanti : p.versanti;
    return { ...p, lat: o.lat ?? p.lat, lon: o.lon ?? p.lon, difficulty: passDifficulty(versanti) ?? o.difficulty ?? p.difficulty, cat: o.cat ?? p.cat, versanti, curated: true, twins: [] };
  });
  const climbs = curated.concat(mergeIndex(idx, curated));
  for (const c of climbs) if (!c.curated) c.name = displayName(c);
  assignCountries(climbs, regions);
  return { climbs, regions, fixes };
}

/* the sides of the selected climbs, from the region files: each file read once, tracks dropped */
function sidesFromFiles(sel, regions) {
  const need = new Map();   // file index -> Set(id)
  const ask = (p) => { for (const f of p.fs || []) { if (!need.has(f)) need.set(f, new Set()); need.get(f).add(String(p.id)); } };
  for (const c of sel) { if (c.curated) (c.twins || []).forEach(ask); else { ask(c); (c.co || []).forEach(ask); } }
  const recs = new Map();   // "f|id" -> versanti
  for (const [f, ids] of [...need.entries()].sort((a, b) => a[0] - b[0])) {
    const file = regions[f]; if (!file) continue;
    let arr = [];
    try { arr = JSON.parse(fs.readFileSync(path.join(D, file), "utf8")); } catch { console.warn(`  ! ${file}: not readable, skipped`); continue; }
    for (const p of Array.isArray(arr) ? arr : arr.passes || []) {
      if (!ids.has(String(p.id))) continue;
      // the track is not needed, only whether there is one (newSidesFor wants a real track): keep its ends
      recs.set(`${f}|${p.id}`, (p.versanti || []).map((v) => ({ ...v, track: Array.isArray(v.track) && v.track.length > 1 ? [v.track[0], v.track.at(-1)] : [] })));
    }
  }
  const of = (p) => { const vs = []; for (const f of p.fs || []) for (const v of recs.get(`${f}|${p.id}`) || []) if (!vs.some((w) => sameOrigin(v, w))) vs.push(v); return vs; };
  return of;
}

export function build() {
  const { climbs, regions, fixes } = load();
  const sel = climbs.filter(wanted);
  const sidesOf = sidesFromFiles(sel, regions);
  const entries = [];
  for (const c of sel) {
    let vs;
    if (c.curated) {
      vs = (c.versanti || []).slice();
      for (const t of c.twins || []) vs = vs.concat(newSidesFor({ ...c, versanti: vs }, sidesOf(t)));
    } else {
      vs = sidesOf(c);
      for (const o of c.co || []) for (const v of sidesOf(o)) if (!vs.some((w) => sameOrigin(v, w))) vs.push(v);
      fixSides(vs, fixes[c.id]);
    }
    const rows = sideRows(vs);
    if (!rows.length) continue;
    entries.push({ c, rows, id: c.id, name: c.name, lat: c.lat, lon: c.lon, elevation: c.elevation, difficulty: c.difficulty, curated: !!c.curated, country: COUNTRIES[c.cc] || "" });
  }
  const slugs = assignSlugs(entries);
  for (const e of entries) e.slug = slugs.get(e);
  entries.sort((a, b) => a.slug.localeCompare(b.slug));
  return entries;
}

function writeAll(entries) {
  const out = path.join(ROOT, "salite");
  fs.rmSync(out, { recursive: true, force: true });
  const put = (rel, text) => { const f = path.join(ROOT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
  for (const e of entries) {
    const c = { ...e.c, name: e.name, country: e.country };
    put(`salite/${e.slug}/index.html`, climbPage(c, e.slug, e.rows, nearest(e, entries, 8, 40)));
  }
  const byLetter = new Map();
  for (const e of entries) { const l = initialOf(e.name); if (!byLetter.has(l)) byLetter.set(l, []); byLetter.get(l).push(e); }
  const letters = [...byLetter.keys()].sort();
  put("salite/salite.css", CSS + "\n");
  put("salite/index.html", hubPage(entries, letters));
  for (const l of letters) put(`salite/indice/${l}/index.html`, letterPage(l, byLetter.get(l)));
  const urls = [{ loc: `${SITE}/` }, { loc: `${SITE}/salite/` }, ...letters.map((l) => ({ loc: `${SITE}/salite/indice/${l}/` })),
    ...entries.map((e) => ({ loc: `${SITE}/salite/${e.slug}/`, lastmod: /^\d{4}-\d{2}-\d{2}$/.test(e.c.updatedAt || "") ? e.c.updatedAt : null }))];
  put("sitemap.xml", sitemapXml(urls));
  put("robots.txt", robotsTxt());
  return { pages: entries.length, letters: letters.length, urls: urls.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const t0 = Date.now(), entries = build();
  const byC = {}; for (const e of entries) byC[e.country || "?"] = (byC[e.country || "?"] || 0) + 1;
  console.log(`climb pages: ${entries.length}`, byC);
  if (!CHECK) console.log("written:", writeAll(entries), `${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
