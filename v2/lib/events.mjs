/* Roads closed and events on the climbs: data/road_events.json (human-curated, like pass_news.json: a weekly
   agent proposes additions in a PR with their sources, Rick merges) + the classic app's BIKE_EVENTS
   (data/passes_data.js) until the classic app is switched off. Pure helpers, tested in test/v2-events.test.mjs.
   Event: { id, type: "chiusura" | "bikeday" | "granfondo" | "gara", name, date: "yyyy-mm-dd", end?, hours?,
            climbs: [climb ids], where?, note?, url, source } */
export const EVENT_TYPES = {
  chiusura: { label: "Strada chiusa", tone: "bad" },
  bikeday: { label: "Solo bici", tone: "good" },
  granfondo: { label: "Granfondo", tone: "warn" },
  gara: { label: "Corsa", tone: "warn" }
};
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/* yyyy-mm-dd of a Date in local time (the rider's calendar day, not UTC) */
export function isoDay(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
export function addDays(day, n) { const [y, m, d] = day.split("-").map(Number); return isoDay(new Date(y, m - 1, d + n)); }

/* one list from the curated file and the legacy BIKE_EVENTS; malformed entries are dropped */
export function normalizeEvents(json, legacy) {
  const out = [];
  for (const e of (json && Array.isArray(json.events) ? json.events : [])) {
    if (e && ISO.test(e.date) && EVENT_TYPES[e.type] && Array.isArray(e.climbs)) out.push({ ...e, end: ISO.test(e.end || "") ? e.end : e.date });
  }
  for (const e of Array.isArray(legacy) ? legacy : []) {
    if (!e || !ISO.test(e.date)) continue;
    const id = "legacy-" + e.date + "-" + String(e.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    if (!out.some((x) => x.id === id)) out.push({ id, type: "bikeday", name: e.name, date: e.date, end: e.date, hours: e.hours || "", climbs: e.passes || [], url: e.url || "", source: "" });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || String(a.name).localeCompare(String(b.name)));
}

/* events still to come (or running) between today and today + days */
export function upcoming(evs, today, days = 60) {
  const last = addDays(today, days);
  return evs.filter((e) => e.end >= today && e.date <= last);
}

/* the climb's own upcoming events; ids = the climb id plus its twins (curated <-> OSM) */
export function forClimb(evs, ids, today) {
  const set = new Set(ids.map(String));
  return evs.filter((e) => e.end >= today && e.climbs.some((c) => set.has(String(c))));
}

/* events on the given day touching any of the climbs (the Giro warning) */
export function onDay(evs, ids, day) {
  const set = new Set(ids.map(String));
  return evs.filter((e) => e.date <= day && e.end >= day && e.climbs.some((c) => set.has(String(c))));
}

/* the Eventi page (Rick 12/11/2026): the filters, the events grouped by month, the distance to the rider */
export const EVENT_FILTERS = {
  tutti: () => true,
  granfondo: (e) => e.type === "granfondo",
  chiuse: (e) => e.type === "chiusura" || e.type === "bikeday",
  corse: (e) => e.type === "gara"
};
/* [{ month: "yyyy-mm", events }] in date order (the input is already sorted by normalizeEvents) */
export function byMonth(evs) {
  const out = [];
  for (const e of evs) {
    const m = e.date.slice(0, 7), last = out[out.length - 1];
    if (last && last.month === m) last.events.push(e); else out.push({ month: m, events: [e] });
  }
  return out;
}
/* km from a point to the nearest climb of the event (coordsOf(id) -> {lat, lon} or null); null when none is known */
export function eventKm(e, here, coordsOf, km) {
  let best = null;
  for (const id of e.climbs || []) {
    const c = coordsOf(id); if (!c) continue;
    const d = km(here.lat, here.lon, c.lat, c.lon);
    if (best == null || d < best) best = d;
  }
  return best;
}

export function loadEvents() {
  return fetch(new URL("../../data/road_events.json", import.meta.url), { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
    .then((j) => normalizeEvents(j, globalThis.BIKE_EVENTS));
}
