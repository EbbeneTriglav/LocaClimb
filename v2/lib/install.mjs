/*
 * install.mjs - "LocaRide sul telefono": which install path this browser offers, and when to suggest it.
 * Pure: the page passes in what it sees (standalone, the captured beforeinstallprompt, user agent).
 *   prompt   Chrome/Edge/Samsung offered the install dialog (beforeinstallprompt): one tap
 *   ios      Safari on iPhone/iPad: no install API, the user adds it from the Share sheet
 *   menu     a Chromium browser that did not offer the dialog (already installed, or not yet eligible):
 *            the browser menu still has "Installa app" / "Apri app"
 *   none     installed and running as an app, or a browser that cannot install
 */
export const SNOOZE_DAYS = 30, MIN_VISITS = 2, SEEN_DAYS = 3;   // "Non ora" = 30 days; left alone until it hides by itself = 3

export function installMode({ standalone = false, prompt = false, ua = "" } = {}) {
  if (standalone) return "none";
  if (prompt) return "prompt";
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && /Mobile\//.test(ua));
  if (ios) return "ios";                                                 // Safari, and Chrome/Edge on iOS 16.4+: Share -> Add to Home Screen
  if (/Chrome\/|Chromium\/|Edg\/|SamsungBrowser\//.test(ua) && !/Firefox\//.test(ua)) return "menu";
  return "none";
}

/* The card shows itself only to someone who came back (visits on >= 2 different days) or who is
   using the app right now (opened a climb), never twice in 30 days after "Non ora". */
export function shouldNudge(mode, st = {}, now = Date.now(), engaged = false) {
  if (mode !== "prompt" && mode !== "ios") return false;
  if (st.snoozedUntil && now < st.snoozedUntil) return false;
  return engaged || (st.days || 0) >= MIN_VISITS;
}

/* one visit per calendar day */
export function countVisit(st = {}, now = Date.now()) {
  const day = new Date(now).toISOString().slice(0, 10);
  return st.last === day ? st : { ...st, last: day, days: (st.days || 0) + 1 };
}

export function snooze(st = {}, now = Date.now(), days = SNOOZE_DAYS) {
  return { ...st, snoozedUntil: now + days * 864e5 };
}

/* Updates without reinstalling (Rick 11/11/2026). The installed app already loads the newest page on every cold
   start (sw.js: network-first, cache:"reload"); the gap is an app left open in the background for days, which
   resumes the old version. On return the page reads the published index.html: a higher ?v= on app.mjs = a new
   release. -> the release number, or null */
export function releaseOf(text) {
  const m = /app\.mjs\?v=(\d+)/.exec(String(text || ""));
  return m ? +m[1] : null;
}
export const UPDATE_AFTER_MS = 20 * 60 * 1000;   // look only after 20 minutes in the background
export function newerRelease(html, current) {
  const v = releaseOf(html), c = releaseOf(current);
  return v != null && c != null && v > c;
}
