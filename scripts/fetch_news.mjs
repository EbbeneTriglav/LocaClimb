#!/usr/bin/env node
/**
 * fetch_news.mjs  -  News/stato candidate fetcher for LocaRide (GDELT edition).
 *
 * Uses the GDELT DOC 2.0 API (https://api.gdeltproject.org/api/v2/doc/doc):
 * free, NO API key, no daily limit, CORS-open, rolling 3-month window, 65 languages.
 * We query Italian-language coverage for each pass + status/cycling keywords and write the
 * results to a REVIEW QUEUE: pass_news_candidates.json. It NEVER writes pass_news.json
 * (that stays human-curated): you approve candidates and copy the good ones into pass_news.json.
 *
 * Rotation: process a daily slice of passes (by day-of-year) so over time all are covered.
 *
 * Optional env:
 *   LC_NEWS_MAX   - max passes per run (default 40)
 *   LC_NEWS_SPAN  - GDELT timespan (default "2m"; e.g. 1w, 1m, 3m)
 *   LC_NEWS_SRC   - source passes file (default osm_passes.json)
 *   LC_NEWS_LANG  - GDELT sourcelang (default "italian"; e.g. "german" for Sudtirol/CH)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const MAX_PER_RUN = parseInt(process.env.LC_NEWS_MAX || "40", 10);
const SPAN = process.env.LC_NEWS_SPAN || "2m";
const SRC = process.env.LC_NEWS_SRC || "osm_passes.json";
const LANG = process.env.LC_NEWS_LANG || "italian";
const CAND_FILE = "pass_news_candidates.json";
const API = "https://api.gdeltproject.org/api/v2/doc/doc";

// OR-block appended to each query: status / road / cycling signals
const QUERY_TAIL = '(chiuso OR riaperto OR chiusura OR riapertura OR lavori OR frana OR valanga OR neve OR valico OR transitabile OR ordinanza OR ciclismo OR gara OR tappa OR granfondo)';

if (!existsSync(SRC)) { console.error("Sorgente passi non trovata: " + SRC + " (esco)."); process.exit(0); }

const passes = JSON.parse(readFileSync(SRC, "utf8"))
  .filter((p) => p && p.name && p.id)
  .map((p) => ({ id: p.id, name: p.name }));

const dayOfYear = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 86400000);
const start = passes.length ? (dayOfYear * MAX_PER_RUN) % passes.length : 0;
const slice = [];
for (let i = 0; i < Math.min(MAX_PER_RUN, passes.length); i++) slice.push(passes[(start + i) % passes.length]);

// "20260601T120000Z" -> "2026-06-01"
const seenToDate = (s) => (s && s.length >= 8) ? (s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8)) : "";

async function searchOne(p) {
  const q = '"' + p.name + '" ' + QUERY_TAIL + ' sourcelang:' + LANG;
  const url = API + "?query=" + encodeURIComponent(q) + "&mode=artlist&format=json&maxrecords=20&sort=datedesc&timespan=" + SPAN;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "LocaRide-news/1.0" } });
    if (!r.ok) { console.error(p.name + ": HTTP " + r.status); return []; }
    const txt = await r.text();
    let j; try { j = JSON.parse(txt); } catch { return []; } // GDELT sometimes returns a non-JSON notice
    return (j.articles || []).map((a) => ({
      date: seenToDate(a.seendate),
      title: a.title || "",
      url: a.url,
      source: a.domain || "",
      approved: false
    })).filter((x) => x.url && x.title);
  } catch (e) { console.error(p.name + ": " + e.message); return []; }
}

const existing = existsSync(CAND_FILE) ? JSON.parse(readFileSync(CAND_FILE, "utf8")) : {};
let added = 0;

for (const p of slice) {
  const found = await searchOne(p);
  if (found.length) {
    const prev = existing[p.id] || [];
    const seen = new Set(prev.map((x) => x.url));
    for (const f of found) { if (!seen.has(f.url)) { seen.add(f.url); prev.push(f); added++; } }
    existing[p.id] = prev.slice(-12); // keep a manageable tail per pass
  }
  await new Promise((res) => setTimeout(res, 2500)); // be gentle with GDELT
}

existing._meta = { updated: new Date().toISOString(), rotation_start: start, passes_in_run: slice.length, added, span: SPAN, lang: LANG };
writeFileSync(CAND_FILE, JSON.stringify(existing, null, 2));
console.log("Candidati GDELT: +" + added + " (passi controllati: " + slice.length + ").");
console.log("Rivedi " + CAND_FILE + ", copia i buoni in pass_news.json.");
