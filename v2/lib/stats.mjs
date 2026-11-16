/* stats.mjs - anonymous usage counts (Rick 16/11/2026), shared by the app (v2/app.mjs) and the Worker (cf/stats.js).
   No cookie, no id, no IP: the app keeps in memory what this visit did (climbs opened, searches typed, how long the
   page was on screen) and sends it with sendBeacon when the page is hidden; the Worker only adds +1 to daily totals.
   Pure functions, tested in test/stats.test.mjs. */

export const MAX_CLIMBS = 20, MAX_SEARCHES = 10, MAX_Q = 40, MAX_BODY = 4096;
export const LANGS = ["it", "en", "es"];
export const DUR_BUCKETS = ["0-30s", "30s-2m", "2-10m", "10m+"];
export const KINDS = ["visit", "lang", "country", "dur", "climb", "search", "search0"];

/* a search as we store it: lowercase, no accents, letters/digits/spaces only, at most 40 characters.
   Anything that looks personal goes: e-mail addresses, @handles, runs of 4+ digits (phones, house numbers). */
export function normQuery(s) {
  let t = String(s == null ? "" : s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  t = t.replace(/\S+@\S+/g, " ").replace(/@\S*/g, " ").replace(/\d{4,}/g, " ");
  t = t.replace(/[^a-z0-9' -]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_Q).trim();
  return t.length >= 2 ? t : "";
}

export function durBucket(ms) {
  const s = (+ms || 0) / 1000;
  return s < 30 ? DUR_BUCKETS[0] : s < 120 ? DUR_BUCKETS[1] : s < 600 ? DUR_BUCKETS[2] : DUR_BUCKETS[3];
}

const ID_RE = /^[A-Za-z0-9_.:-]{1,80}$/;
export function validId(id) { return typeof id === "string" && ID_RE.test(id); }

/* Do Not Track / Global Privacy Control: nothing is sent */
export function allowed(nav) {
  if (!nav) return false;
  return !(nav.doNotTrack === "1" || nav.msDoNotTrack === "1" || nav.globalPrivacyControl === true);
}

/* what one visit did; "first" marks the first batch of the visit (the only one that counts a visit) */
export function createSession(now = Date.now()) {
  return { first: true, shownAt: now, shownMs: 0, climbs: [], searches: [] };
}
export function addClimb(s, id) {
  if (!validId(id) || s.climbs.includes(id) || s.climbs.length >= MAX_CLIMBS) return;
  s.climbs.push(id);
}
/* a longer search typed after a pause replaces the shorter one it starts with ("stel" -> "stelvio") */
export function addSearch(s, raw, zero) {
  const q = normQuery(raw); if (!q) return;
  const i = s.searches.findIndex((x) => q.startsWith(x.q) || x.q.startsWith(q));
  if (i >= 0) { if (q.length >= s.searches[i].q.length) s.searches[i] = { q, zero: !!zero }; return; }
  if (s.searches.length < MAX_SEARCHES) s.searches.push({ q, zero: !!zero });
}
export function shown(s, now = Date.now()) { s.shownAt = now; }
export function hidden(s, now = Date.now()) { if (s.shownAt != null) s.shownMs += Math.max(0, now - s.shownAt); s.shownAt = null; }

/* the batch to send, or null when there is nothing worth a request; resets what it took */
export function takeBatch(s, lang) {
  const worth = s.first || s.climbs.length || s.searches.length || s.shownMs >= 10000;
  if (!worth) return null;
  const b = { v: 1, first: s.first, lang: LANGS.includes(lang) ? lang : "it", dur: durBucket(s.shownMs), climbs: s.climbs, searches: s.searches };
  s.first = false; s.shownMs = 0; s.climbs = []; s.searches = [];
  return b;
}

/* Worker side: a batch -> the [kind, key] pairs to add 1 to. Anything malformed is dropped, never trusted. */
export function countsOf(b, country) {
  if (!b || typeof b !== "object" || b.v !== 1) return [];
  const out = [];
  if (b.first === true) {
    out.push(["visit", "all"]);
    out.push(["lang", LANGS.includes(b.lang) ? b.lang : "other"]);
    out.push(["country", /^[A-Z]{2}$/.test(country || "") ? country : "XX"]);
  }
  if (DUR_BUCKETS.includes(b.dur)) out.push(["dur", b.dur]);
  const ids = Array.isArray(b.climbs) ? b.climbs : [];
  for (const id of [...new Set(ids.filter(validId))].slice(0, MAX_CLIMBS)) out.push(["climb", id]);
  const ss = Array.isArray(b.searches) ? b.searches : [], seen = new Set();
  for (const x of ss.slice(0, MAX_SEARCHES)) {
    const q = normQuery(x && x.q); if (!q || seen.has(q)) continue;
    seen.add(q); out.push([x.zero === true ? "search0" : "search", q]);
  }
  return out;
}
