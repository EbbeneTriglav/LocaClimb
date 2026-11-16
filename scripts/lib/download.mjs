/*
 * download.mjs - fetch an OSM extract with mirrors and retries (16/11/2026).
 * The osm-expand / discover runs for usa-maine, usa-new-hampshire, usa-vermont and usa-west-virginia
 * failed with "download exhausted" in ~4 minutes: Geofabrik "fetch failed" (transient network error)
 * x4, and the osm.fr mirror answered 404 x6 because it has no US extracts - the retries were spent on
 * a mirror that can never work. Now: a mirror that answers 404/410 is dropped, the waits grow to
 * ~10 minutes in total, the log says the network cause, and requests carry a User-Agent.
 */
export const UA = "LocaRide-osm/1.0 (+https://locaride.app)";
export const WAITS = [8, 16, 32, 64, 120, 120, 120, 120];   // seconds between attempts (~10 min)

/* the URL plus the osm.fr mirror paths derived from a Geofabrik URL */
export function mirrors(url) {
  const out = [url], m = String(url).match(/geofabrik\.de\/(.+?)-latest\.osm\.pbf$/);
  if (m) {
    out.push("https://download.openstreetmap.fr/extracts/" + m[1] + ".osm.pbf");
    const u = "https://download.openstreetmap.fr/extracts/" + m[1].replace(/-/g, "_") + ".osm.pbf";
    if (!out.includes(u)) out.push(u);
  }
  return out;
}

/* "fetch failed" hides the real reason in e.cause (ECONNRESET, UND_ERR_CONNECT_TIMEOUT, ...) */
export function why(e) {
  const c = e && e.cause;
  return (e && e.message || String(e)) + (c ? " (" + (c.code || c.message || c) + ")" : "");
}

/* fetches until one candidate answers 2xx; save(response) writes the body. Injected fetch/sleep/log for tests. */
export async function fetchWithRetry(url, save, { fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = console.warn, waits = WAITS } = {}) {
  let cands = mirrors(url);
  for (let attempt = 0; attempt <= waits.length && cands.length; attempt++) {
    const u = cands[attempt % cands.length];
    try {
      const r = await fetchImpl(u, { redirect: "follow", headers: { "User-Agent": UA } });
      if (r.status === 404 || r.status === 410) { log("  ! " + u + ": HTTP " + r.status + ", mirror dropped"); cands = cands.filter((x) => x !== u); attempt--; continue; }
      if (!r.ok) throw new Error("HTTP " + r.status);
      await save(r);
      return u;
    } catch (e) {
      if (attempt >= waits.length) break;
      log("  ! " + u + " failed: " + why(e) + ", retry in " + waits[attempt] + "s");
      await sleep(waits[attempt] * 1000);
    }
  }
  throw new Error("download exhausted: " + url);
}
