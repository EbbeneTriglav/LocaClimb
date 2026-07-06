#!/usr/bin/env node
/**
 * fetch_news.mjs  -  News/stato candidate fetcher for LocaRide (GDELT edition).
 *
 * GDELT DOC 2.0 API (https://api.gdeltproject.org/api/v2/doc/doc): free, NO key, no daily
 * limit, rolling 3-month window. BUT GDELT rate-limits hard (HTTP 429), and shared CI IPs
 * (GitHub runners) are often pre-throttled. So we go slow, honor Retry-After, back off
 * exponentially, and stop+save if GDELT blocks us at scale (a later run resumes the rotation).
 *
 * Writes a REVIEW QUEUE: pass_news_candidates.json. NEVER writes pass_news.json (human-curated).
 *
 * Optional env:
 *   LC_NEWS_MAX    - max passes per run (default 25)
 *   LC_NEWS_SPAN   - GDELT timespan (default "2m")
 *   LC_NEWS_SRC    - source passes file (default osm_passes.json)
 *   LC_NEWS_LANG   - GDELT sourcelang (default "italian")
 *   LC_NEWS_DELAY  - ms between calls (default 6000)
 *   LC_NEWS_MINKM  - skip passes whose longest versante is shorter than this (default 2)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dataPath } from "./lib/paths.mjs";

const MAX_PER_RUN = parseInt(process.env.LC_NEWS_MAX || "25", 10);
const SPAN = process.env.LC_NEWS_SPAN || "2m";
const SRC = dataPath(process.env.LC_NEWS_SRC || "osm_passes.json");
const LANG = process.env.LC_NEWS_LANG || "italian";
const DELAY = parseInt(process.env.LC_NEWS_DELAY || "6000", 10);
const MINKM = parseFloat(process.env.LC_NEWS_MINKM || "2");
const CAND_FILE = dataPath("pass_news_candidates.json");
const API = "https://api.gdeltproject.org/api/v2/doc/doc";
const MAX_RETRY = 4, BASE_BACKOFF = 6000, BREAK_AFTER = 6; // consecutive hard-fails -> stop+save

const QUERY_TAIL = '(chiuso OR riaperto OR chiusura OR riapertura OR lavori OR frana OR valanga OR neve OR valico OR transitabile OR ordinanza OR ciclismo OR gara OR tappa OR granfondo)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const seenToDate = (s) => (s && s.length >= 8) ? (s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8)) : "";
const maxKm = (p) => (p.versanti || []).reduce((m, v) => Math.max(m, v.distance_km || 0), 0);

if (!existsSync(SRC)) { console.error("Sorgente passi non trovata: " + SRC + " (esco)."); process.exit(0); }

const all = JSON.parse(readFileSync(SRC, "utf8"));
const passes = all
  .filter((p) => p && p.id && p.name && p.name.trim().length >= 5 && p.name.trim().toLowerCase() !== "passo" && maxKm(p) >= MINKM)
  .map((p) => ({ id: p.id, name: p.name.trim() }));
console.log("Passi idonei (nome valido + salita >= " + MINKM + "km): " + passes.length + " / " + all.length);

const dayOfYear = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 86400000);
const start = passes.length ? (dayOfYear * MAX_PER_RUN) % passes.length : 0;
const slice = [];
for (let i = 0; i < Math.min(MAX_PER_RUN, passes.length); i++) slice.push(passes[(start + i) % passes.length]);

// returns body text, with Retry-After-aware exponential backoff on 429/503
async function gget(url, attempt = 0) {
  const r = await fetch(url, { headers: { "User-Agent": "LocaRide-news/1.0 (+https://ebbenetriglav.github.io/LocaClimb)" } });
  if (r.status === 429 || r.status === 503) {
    if (attempt >= MAX_RETRY) { const e = new Error("HTTP " + r.status); e.throttled = true; throw e; }
    const ra = parseInt(r.headers.get("retry-after") || "0", 10);
    const wait = ra ? ra * 1000 : Math.min(60000, BASE_BACKOFF * Math.pow(2, attempt));
    console.error("  " + r.status + ", attendo " + Math.round(wait / 1000) + "s e riprovo...");
    await sleep(wait);
    return gget(url, attempt + 1);
  }
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.text();
}

async function searchOne(p) {
  const q = '"' + p.name + '" ' + QUERY_TAIL + ' sourcelang:' + LANG;
  const url = API + "?query=" + encodeURIComponent(q) + "&mode=artlist&format=json&maxrecords=20&sort=datedesc&timespan=" + SPAN;
  const txt = await gget(url);
  let j; try { j = JSON.parse(txt); } catch { return []; } // GDELT may return a non-JSON notice
  return (j.articles || []).map((a) => ({
    date: seenToDate(a.seendate), title: a.title || "", url: a.url, source: a.domain || "", approved: false
  })).filter((x) => x.url && x.title);
}

const existing = existsSync(CAND_FILE) ? JSON.parse(readFileSync(CAND_FILE, "utf8")) : {};
let added = 0, done = 0, consecFail = 0, stopped = false;

for (const p of slice) {
  try {
    const found = await searchOne(p);
    consecFail = 0; done++;
    if (found.length) {
      const prev = existing[p.id] || [];
      const seen = new Set(prev.map((x) => x.url));
      for (const f of found) { if (!seen.has(f.url)) { seen.add(f.url); prev.push(f); added++; } }
      existing[p.id] = prev.slice(-12);
    }
  } catch (e) {
    console.error(p.name + ": " + e.message);
    if (e.throttled) {
      consecFail++;
      if (consecFail >= BREAK_AFTER) { console.error("GDELT throttla a tappeto: mi fermo e salvo il parziale. Rilancia piu tardi / piu lento."); stopped = true; break; }
    }
  }
  await sleep(DELAY);
}

existing._meta = { updated: new Date().toISOString(), rotation_start: start, processed: done, added, span: SPAN, lang: LANG, stopped_early: stopped };
writeFileSync(CAND_FILE, JSON.stringify(existing, null, 2));
console.log("Candidati GDELT: +" + added + " (passi processati: " + done + "/" + slice.length + (stopped ? ", interrotto" : "") + ").");
console.log("Rivedi " + CAND_FILE + ", copia i buoni in pass_news.json.");
