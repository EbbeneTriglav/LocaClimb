/*
 * transit.mjs - "Treno + bici" in the Giro (18/11/2026): take a regional train towards the climbs, ride from the
 * station. Pure helpers, tested in test/v2-transit.test.mjs. Timetables come from our Worker (cf/transit.js:
 * Transitous, HERE as the fallback), already in one shape; whether a bike may ride along comes from
 * data/rail_bike_rules.json, because no timetable says it (Italian feeds leave bikes_allowed empty).
 */
import { havKm } from "./climb.mjs?v=69";

export const TRANSIT = "/api/transit";
export const MIN_KM = 25;          // shorter than this from home to the first stop: no train offered
const RANK = { no: 3, reserve: 2, check: 1, yes: 0 };

export function stopsUrl(lat, lon, km = 45) { return `${TRANSIT}/stops?lat=${(+lat).toFixed(4)}&lon=${(+lon).toFixed(4)}&km=${Math.round(km)}`; }
/* rideHome: the trip back, the last stretch from the station is ridden (the Worker's post=bike) */
export function planUrl(from, to, iso, n = 3, rideHome = false) {
  return `${TRANSIT}/plan?from=${(+from.lat).toFixed(5)},${(+from.lon).toFixed(5)}&to=${(+to.lat).toFixed(5)},${(+to.lon).toFixed(5)}&time=${encodeURIComponent(iso)}&n=${n}${rideHome ? "&post=bike" : ""}`;
}

/* the moment the rider leaves home: day offset (0 today) + "HH:MM", local time -> ISO (UTC) */
export function departIso(day, hhmm, now = new Date()) {
  const [h, m] = String(hhmm || "08:00").split(":").map(Number), d = new Date(now);
  d.setHours(h || 0, m || 0, 0, 0); d.setDate(d.getDate() + (+day || 0));
  return d.toISOString();
}
/* minutes after local midnight of an ISO time (the Giro counts its clock that way) */
export function minuteOfDay(iso) { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); }
export function hm(iso) { const d = new Date(iso); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
export function dur(min) { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`; }

/* stations worth a train: clearly closer to the climb than home is, at most maxKm from it; small halts lose
   against a real station a few km further (importance from the timetable); of two stations within 6 km only the more
   important one stays */
export function pickStations(stations, home, target, max = 3, maxKm = 60) {
  const direct = havKm(home.lat, home.lon, target.lat, target.lon);
  const ok = (stations || []).map((s) => ({ ...s, toT: havKm(s.lat, s.lon, target.lat, target.lon), toH: havKm(s.lat, s.lon, home.lat, home.lon) }))
    .filter((s) => s.toT <= maxKm && s.toT < direct - MIN_KM / 2 && s.toH > 5)
    .map((s) => ({ ...s, score: s.toT + ((s.imp || 0) < 1e-4 ? 8 : 0) }))
    .sort((a, b) => a.score - b.score);
  const out = [];
  for (const s of ok) {
    // the same place twice (RhB and FS at Tirano) or a halt next to a real station (Campocologno, Villa di Tirano
    // next to Tirano): one of them, the more important - the halt comes first in distance but is the worse train stop
    const k = out.findIndex((o) => havKm(o.lat, o.lon, s.lat, s.lon) < 6);
    if (k >= 0) { if ((s.imp || 0) > (out[k].imp || 0)) out[k] = s; continue; }
    out.push(s);
  }
  return out.slice(0, max);
}

/* the operator rule for one train leg; unknown operators and kinds: "check" */
export function bikeRule(leg, rules) {
  const cat = leg && leg.cat;
  for (const o of (rules && rules.operators) || []) {
    let re; try { re = new RegExp(o.match, "i"); } catch { continue; }
    if (!re.test((leg && leg.agency) || "")) continue;
    const r = cat === "long" ? o.long || { bike: "no", price: "", note: "" } : cat === "regional" ? o.regional : null;
    if (r) return { ...r, op: o.name, ticket: o.ticket, source: o.source, checked: o.checked };
  }
  if (cat === "long") return { bike: "check", price: "", note: "Treno a lunga percorrenza: di solito la bici montata non sale o va prenotata.", op: (leg && leg.agency) || "", ticket: "" };
  return { bike: "check", price: "", note: "Controlla sull'orario se il treno porta bici montate.", op: (leg && leg.agency) || "", ticket: "" };
}

export const rides = (it) => ((it && it.legs) || []).filter((l) => l.cat !== "self");
/* an itinerary as the Giro shows it: the worst bike rule of its trains decides; a bus in the middle = no bike */
export function itinView(it, rules) {
  const rs = rides(it), trains = rs.filter((l) => l.cat === "regional" || l.cat === "long");
  const bus = rs.some((l) => l.cat === "other");
  const per = trains.map((l) => bikeRule(l, rules));
  let worst = per.reduce((w, r) => (RANK[r.bike] > RANK[w.bike] ? r : w), per[0] || { bike: "check" });
  if (bus) worst = { ...worst, bike: "no", note: "Nel viaggio c'è un autobus: la bici di solito non sale." };
  const first = trains[0] || rs[0], last = trains[trains.length - 1] || rs[rs.length - 1];
  return {
    dep: first ? first.dep : it.dep, arr: last ? last.arr : it.arr, from: first ? first.from.name : "", to: last ? last.to.name : "",
    names: trains.map((l) => [l.name, l.agency].filter(Boolean).join(" ")).filter((x, i, a) => a.indexOf(x) === i).join(" + "),
    changes: Math.max(0, rs.length - 1), bike: worst.bike, rule: worst,
    prices: per.map((r) => r.price).filter((x, i, a) => x && a.indexOf(x) === i),
    tickets: per.filter((r) => r.ticket).map((r) => ({ op: r.op, url: r.ticket })).filter((x, i, a) => a.findIndex((y) => y.url === x.url) === i)
  };
}
/* the itineraries a rider with a bike can take, earliest arrival first */
export function bikeable(its, rules) { return (its || []).filter((it) => itinView(it, rules).bike !== "no").sort((a, b) => Date.parse(a.arr) - Date.parse(b.arr)); }

/* the train part on the map: one dashed line per ride */
export function trainFeatures(it) {
  return rides(it).filter((l) => (l.geom || []).length > 1).map((l) => ({ type: "Feature", properties: { cat: l.cat }, geometry: { type: "LineString", coordinates: l.geom.map(([la, lo]) => [lo, la]) } }));
}

/* data/rail_bike_rules.json, once (from this file: the page may move) */
let RULES = null;
export function loadBikeRules() {
  if (!RULES) RULES = fetch(new URL("../../data/rail_bike_rules.json", import.meta.url), { cache: "no-cache" }).then((r) => (r.ok ? r.json() : { operators: [] })).catch(() => ({ operators: [] }));
  return RULES;
}

/* OSRM table (one call): road km from every station to the first stop. Distance by road, not in a straight line:
   from the Engadin the Stelvio is 34 km away as the crow flies but behind two passes. null = use the straight line */
export function roadTableUrl(stations, target) {
  const pts = [...stations, target].map((p) => (+p.lon).toFixed(5) + "," + (+p.lat).toFixed(5)).join(";");
  return `https://router.project-osrm.org/table/v1/driving/${pts}?sources=${stations.map((_, i) => i).join(";")}&destinations=${stations.length}&annotations=distance`;
}
export function roadKm(j, n) {
  const d = j && j.code === "Ok" && j.distances;
  return Array.from({ length: n }, (_, i) => (d && d[i] && d[i][0] != null ? d[i][0] / 1000 : null));
}
/* which stations to ask the timetable for: the quickest guess of the day, train (straight line from home at 60 km/h)
   + ride (road km, else straight x1.4, at 18 km/h), in hours */
export function guessHours(s) { return s.toH / 60 + (s.road != null ? s.road : s.toT * 1.4) / 18; }
