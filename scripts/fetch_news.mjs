#!/usr/bin/env node
/**
 * fetch_news.mjs  -  News/stato candidate fetcher for LocaRide.
 *
 * Queries the Google Custom Search JSON API for recent items about mountain passes
 * and writes them to a REVIEW QUEUE: pass_news_candidates.json.
 * It NEVER writes pass_news.json (that file stays human-curated): you approve
 * candidates and copy the good ones into pass_news.json.
 *
 * Why a queue: keyword search is noisy (tourism, old articles). Auto-publishing
 * unfiltered news on a pass is risky, so a human approves.
 *
 * Free tier: Custom Search JSON API = 100 queries/day. To stay under it we process
 * a daily ROTATION of passes (slice by day-of-year), so over ~N days every pass is
 * covered. Tune MAX_PER_RUN below.
 *
 * Env (set as GitHub Actions secrets):
 *   GOOGLE_CSE_KEY  - API key (console.cloud.google.com -> Custom Search API)
 *   GOOGLE_CSE_CX   - Search engine id (programmablesearchengine.google.com)
 * Optional env:
 *   LC_NEWS_MAX     - max passes per run (default 30)
 *   LC_NEWS_SRC     - source passes file (default osm_passes.json)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const KEY = process.env.GOOGLE_CSE_KEY || "";
const CX  = process.env.GOOGLE_CSE_CX  || "";
const MAX_PER_RUN = parseInt(process.env.LC_NEWS_MAX || "30", 10);
const SRC = process.env.LC_NEWS_SRC || "osm_passes.json";
const CAND_FILE = "pass_news_candidates.json";

// keywords that make a result "relevant" (status / road / cycling)
const KW = ["chius", "riapert", "apert", "lavori", "frana", "frane", "valanga", "neve",
  "valico", "transito", "viabilit", "senso unico", "ordinanza", "crollo",
  "gara", "giro d'italia", "tour", "tappa", "ciclism", "granfondo", "cronoscalata"];
// the OR-group appended to each query to bias toward status/cycling news
const QUERY_TAIL = '(chiuso OR riaperto OR lavori OR frana OR valico OR neve OR ciclismo OR gara OR tappa)';

if (!KEY || !CX) {
  console.error("GOOGLE_CSE_KEY / GOOGLE_CSE_CX mancanti: niente da fare (esco senza errore).");
  process.exit(0);
}
if (!existsSync(SRC)) {
  console.error("Sorgente passi non trovata: " + SRC + " (esco).");
  process.exit(0);
}

const passes = JSON.parse(readFileSync(SRC, "utf8"))
  .filter((p) => p && p.name && p.id)
  .map((p) => ({ id: p.id, name: p.name }));

// stable rotation by day-of-year so we cycle through all passes over time
const dayOfYear = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 86400000);
const start = (dayOfYear * MAX_PER_RUN) % Math.max(1, passes.length);
const slice = [];
for (let i = 0; i < Math.min(MAX_PER_RUN, passes.length); i++) slice.push(passes[(start + i) % passes.length]);

const relevant = (txt) => {
  const t = (txt || "").toLowerCase();
  return KW.some((k) => t.indexOf(k) >= 0);
};

async function searchOne(p) {
  const q = encodeURIComponent('"' + p.name + '" ' + QUERY_TAIL);
  const url = "https://www.googleapis.com/customsearch/v1?key=" + KEY + "&cx=" + CX +
    "&q=" + q + "&num=5&gl=it&lr=lang_it&dateRestrict=m4&safe=off";
  try {
    const r = await fetch(url);
    if (!r.ok) { console.error(p.name + ": HTTP " + r.status); return []; }
    const j = await r.json();
    const items = j.items || [];
    const out = [];
    for (const it of items) {
      const title = it.title || "";
      const snippet = it.snippet || "";
      if (!relevant(title + " " + snippet)) continue;
      // try to read a publication date from pagemap metatags
      let date = "";
      const mt = it.pagemap && it.pagemap.metatags && it.pagemap.metatags[0];
      if (mt) date = (mt["article:published_time"] || mt["og:updated_time"] || mt["date"] || "").slice(0, 10);
      out.push({
        date: date || "",
        title: title,
        url: it.link,
        source: it.displayLink || "",
        snippet: snippet,
        approved: false
      });
    }
    return out;
  } catch (e) {
    console.error(p.name + ": " + e.message);
    return [];
  }
}

const existing = existsSync(CAND_FILE) ? JSON.parse(readFileSync(CAND_FILE, "utf8")) : {};
let added = 0;

for (const p of slice) {
  const found = await searchOne(p);
  if (!found.length) continue;
  const prev = existing[p.id] || [];
  const seen = new Set(prev.map((x) => x.url));
  for (const f of found) {
    if (seen.has(f.url)) continue;
    seen.add(f.url);
    prev.push(f);
    added++;
  }
  // keep newest-ish 12 per pass, drop the rest of the unapproved tail
  existing[p.id] = prev.slice(-12);
  await new Promise((res) => setTimeout(res, 250)); // be gentle with the API
}

existing._meta = { updated: new Date().toISOString(), rotation_start: start, passes_in_run: slice.length, added };
writeFileSync(CAND_FILE, JSON.stringify(existing, null, 2));
console.log("Candidati aggiornati: +" + added + " (passi controllati: " + slice.length + ").");
console.log("Rivedi " + CAND_FILE + ", copia i buoni in pass_news.json.");
