/* Winter closures of the passes: data/winter_closures.json (human-curated, sources per pass; Rick 11/11/2026:
   "a closed pass shown as open is worse than a missing feature"). Pure helpers, tested in test/v2-closures.test.mjs.
   Pass: { id, name, lat, lon, closes: [MM-DD, MM-DD] | null, opens: [MM-DD, MM-DD] | null, note, sources: [url],
           now?: { closed: bool, since?: yyyy-mm-dd, reopens?: yyyy-mm-dd, checked: yyyy-mm-dd, source } }
   closes/opens = the usual window in which the road closes / reopens (the season varies with the snow).
   State on a day:
     "closed" - now says closed (since that day, until reopens if known)
     "likely" - between the latest usual closing and the earliest usual reopening ("chiuso d'inverno, di solito")
     "maybe"  - inside one of the two windows: it may already be closed / still be closed
     null     - open season, or a recent check says it is open
   With an unknown bound the safe core is 1 December - 31 March: every pass of the file is shut then. */
import { havKm } from "./climb.mjs?v=53";

const MD = /^\d{2}-\d{2}$/, ISO = /^\d{4}-\d{2}-\d{2}$/;
export const MATCH_KM = 1.0;
const CORE = ["12-01", "03-31"];

/* "MM-DD" of a yyyy-mm-dd day */
const md = (day) => day.slice(5);
/* day (MM-DD) inside [a, b], also across New Year (a > b) */
export function inWindow(d, a, b) { return a <= b ? d >= a && d <= b : d >= a || d <= b; }

export function normalizeClosures(json) {
  const out = [];
  for (const p of (json && Array.isArray(json.passes) ? json.passes : [])) {
    if (!p || typeof p.lat !== "number" || typeof p.lon !== "number" || !p.name) continue;
    const win = (w) => (Array.isArray(w) && w.length === 2 && MD.test(w[0]) && MD.test(w[1]) ? w : null);
    out.push({ ...p, closes: win(p.closes), opens: win(p.opens), now: p.now && typeof p.now === "object" ? p.now : null });
  }
  return out;
}

/* the pass whose top is within MATCH_KM of the climb's top (curated, OSM and x- twins all match) */
export function closureFor(list, lat, lon) {
  let best = null, bd = MATCH_KM;
  for (const p of list) { const d = havKm(lat, lon, p.lat, p.lon); if (d <= bd) { bd = d; best = p; } }
  return best;
}

export function closureState(p, day) {
  if (!p || !ISO.test(day || "")) return null;
  const n = p.now;
  if (n && n.closed === true && (!ISO.test(n.since || "") || day >= n.since) && (!ISO.test(n.reopens || "") || day < n.reopens)) return "closed";
  if (n && n.closed === false && ISO.test(n.checked || "") && day >= n.checked && daysBetween(n.checked, day) <= 7) return null;
  if (n && n.closed === true && ISO.test(n.reopens || "") && day >= n.reopens && daysBetween(n.reopens, day) <= 60) return null;
  const d = md(day);
  const a = p.closes ? p.closes[1] : CORE[0], b = p.opens ? p.opens[0] : CORE[1];
  if (inWindow(d, a, b)) return "likely";
  if ((p.closes && inWindow(d, p.closes[0], p.closes[1])) || (p.opens && inWindow(d, p.opens[0], p.opens[1]))) return "maybe";
  return null;
}
function daysBetween(a, b) { return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5); }

/* 23/10 from 2026-10-23 or 10-23 */
export function dm(s) { const [m, d] = String(s).slice(-5).split("-"); return +d + "/" + +m; }
/* the dates line in the page language (the labels go through i18n, this line is built here) */
const W = {
  it: { between: "tra %a e %b", about: "verso il %a", since: "dal %a", reopensOn: "riapre il %a", usually: "di solito riapre %s", closes: "chiude %s", opens: "riapre %s" },
  en: { between: "between %a and %b", about: "around %a", since: "since %a", reopensOn: "reopens on %a", usually: "usually reopens %s", closes: "closes %s", opens: "reopens %s" },
  es: { between: "entre el %a y el %b", about: "hacia el %a", since: "desde el %a", reopensOn: "reabre el %a", usually: "suele reabrir %s", closes: "cierra %s", opens: "reabre %s" }
};
/* "tra 20/5 e 10/6" or "verso il 15/5" (both bounds equal) */
export function span(w, lang = "it") {
  const t = W[lang] || W.it;
  return !w ? "" : w[0] === w[1] ? t.about.replace("%a", dm(w[0])) : t.between.replace("%a", dm(w[0])).replace("%b", dm(w[1]));
}

/* what the climb page, Oggi and the Giro say; label = a fixed Italian string (translated by i18n), when = dates line */
export function closureInfo(p, day, lang = "it") {
  if (!p) return null;
  const st = closureState(p, day), n = p.now || {}, t = W[lang] || W.it;
  const label = st === "closed" ? "Chiuso per l'inverno" : st === "likely" ? "Di solito chiuso in questo periodo" : st === "maybe" ? "Possibile chiusura invernale" : "Chiusura invernale";
  const when = st === "closed"
    ? [ISO.test(n.since || "") ? t.since.replace("%a", dm(n.since)) : "", ISO.test(n.reopens || "") ? t.reopensOn.replace("%a", dm(n.reopens)) : p.opens ? t.usually.replace("%s", span(p.opens, lang)) : ""].filter(Boolean).join(" · ")
    : [p.closes ? t.closes.replace("%s", span(p.closes, lang)) : "", p.opens ? t.opens.replace("%s", span(p.opens, lang)) : ""].filter(Boolean).join(" · ");
  return { state: st, label, when, tone: st === "closed" || st === "likely" ? "bad" : st === "maybe" ? "warn" : "mu", note: p.note || "", source: n.source || (p.sources || [])[0] || "", checked: n.checked || "" };
}

/* closed or almost surely closed on that day: Oggi leaves it out, the Giro warns */
export function blocked(p, day) { const s = closureState(p, day); return s === "closed" || s === "likely"; }

export function loadClosures() {
  return fetch(new URL("../../data/winter_closures.json", import.meta.url), { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
    .then(normalizeClosures);
}
