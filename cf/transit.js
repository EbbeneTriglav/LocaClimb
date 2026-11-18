/*
 * /api/transit/* - trains for the Giro ("Treno + bici", 18/11/2026), behind our own origin.
 *
 *   GET /api/transit/stops?lat=..&lon=..&km=40          rail stations around a point
 *   GET /api/transit/plan?from=lat,lon&to=lat,lon&time=ISO&n=3   regional-train journeys
 *
 * 1) Transitous (MOTIS 2, https://transitous.org/api/): Europe-wide, free, NOT for commercial use; it asks for
 *    an identifying User-Agent, a visible link to its sources (the app shows "Orari: Transitous") and a word on
 *    Matrix above ~720 plans a day - the cache below keeps us far from that.
 * 2) HERE Public Transit v8 as the fallback (Rick 18/11/2026): only when Transitous fails or finds nothing, and
 *    only if the Worker has the secret HERE_API_KEY (wrangler secret put HERE_API_KEY). 5,000 requests/month free.
 * Both answers are normalised to ONE shape (normPlace/normMotis/normHere), so the app never knows the source:
 *   { source, itineraries: [{ dep, arr, min, transfers, legs: [{ mode, cat, name, agency, from, to, dep, arr, geom }] }] }
 * Only regional trains are asked for: high-speed trains and buses do not carry a ridden bike (lib/transit.mjs adds
 * the bike rules per operator, data/rail_bike_rules.json). Pure helpers are exported for test/transit-proxy.test.mjs.
 */
const MOTIS = "https://api.transitous.org/api";
const HERE_ROUTES = "https://transit.router.hereapi.com/v8/routes";
const HERE_STATIONS = "https://transit.hereapi.com/v8/stations";
const UA = "LocaRide/1.0 (+https://locaride.app; info@locaride.app)";
const MOTIS_MODES = "REGIONAL_RAIL,REGIONAL_FAST_RAIL,SUBURBAN";
const HERE_MODES = "regionalTrain,interRegionalTrain,cityTrain";
const TTL_PLAN = 1800, TTL_STOPS = 7 * 86400;

/* what kind of vehicle a leg is: "regional" trains carry bikes (with rules), "long" ones mostly not */
const CAT = {
  REGIONAL_RAIL: "regional", REGIONAL_FAST_RAIL: "regional", SUBURBAN: "regional", RAIL: "regional", METRO: "regional",
  HIGHSPEED_RAIL: "long", LONG_DISTANCE: "long", NIGHT_RAIL: "long",
  regionalTrain: "regional", interRegionalTrain: "regional", cityTrain: "regional",
  highSpeedTrain: "long", intercityTrain: "long"
};
export function legCat(mode) {
  if (CAT[mode]) return CAT[mode];
  if (/^(WALK|BIKE|pedestrian|bicycle)$/i.test(mode || "")) return "self";
  return "other";   // bus, coach, subway, ferry...
}

/* Google polyline (MOTIS: precision 5..7) -> [[lat, lon]] */
export function decodePolyline(str, precision = 5) {
  const f = Math.pow(10, precision), out = [];
  let i = 0, lat = 0, lon = 0;
  while (i < (str || "").length) {
    for (let k = 0; k < 2; k++) {
      let b, sh = 0, r = 0;
      do { b = str.charCodeAt(i++) - 63; r += (b & 31) * Math.pow(2, sh); sh += 5; } while (b >= 32);
      const v = r % 2 ? -(r + 1) / 2 : r / 2;
      if (k === 0) lat += v; else lon += v;
    }
    out.push([lat / f, lon / f]);
  }
  return out;
}

/* HERE flexible polyline (https://github.com/heremaps/flexible-polyline) -> [[lat, lon]] */
const FLEX = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
export function decodeFlexPolyline(str) {
  const vals = [];
  let r = 0, sh = 0;
  for (const ch of str || "") {
    const v = FLEX.indexOf(ch);
    if (v < 0) throw new Error("bad flexible polyline");
    r += (v & 31) * Math.pow(2, sh);
    if (v & 32) sh += 5; else { vals.push(r); r = 0; sh = 0; }
  }
  if (vals.length < 2 || vals[0] !== 1) throw new Error("unknown flexible polyline version");
  const h = vals[1], prec = h & 15, third = (h >> 4) & 7, f = Math.pow(10, prec), step = third ? 3 : 2;
  const signed = (u) => (u % 2 ? -(u + 1) / 2 : u / 2);
  const out = [];
  let lat = 0, lon = 0;
  for (let i = 2; i + 1 < vals.length; i += step) {
    lat += signed(vals[i]); lon += signed(vals[i + 1]);
    out.push([lat / f, lon / f]);
  }
  return out;
}

/* fewer points for the map (the train is drawn, not navigated): every k-th point + the last, 5 decimals */
export function thin(pts, max = 150) {
  const k = Math.max(1, Math.ceil((pts || []).length / max));
  return (pts || []).filter((_, i, a) => i % k === 0 || i === a.length - 1).map(([a, b]) => [Math.round(a * 1e5) / 1e5, Math.round(b * 1e5) / 1e5]);
}

const place = (name, lat, lon) => ({ name: String(name || ""), lat: +(+lat).toFixed(5), lon: +(+lon).toFixed(5) });

/* one MOTIS itinerary -> our shape */
export function normMotis(it) {
  const legs = (it.legs || []).filter((l) => l.mode !== "WALK" || (l.distance || 0) > 300).map((l) => {
    const g = l.legGeometry || {};
    let geom = [];
    try { geom = thin(decodePolyline(g.points || "", g.precision || 5)); } catch { geom = []; }
    return {
      mode: l.mode, cat: legCat(l.mode), name: l.routeShortName || l.displayName || "", agency: l.agencyName || "",
      from: place(l.from && l.from.name, l.from && l.from.lat, l.from && l.from.lon), to: place(l.to && l.to.name, l.to && l.to.lat, l.to && l.to.lon),
      dep: l.startTime, arr: l.endTime, geom
    };
  });
  const rides = legs.filter((l) => l.cat !== "self");
  return { dep: it.startTime, arr: it.endTime, min: Math.round((it.duration || 0) / 60), transfers: Math.max(0, rides.length - 1), legs };
}

/* one HERE route -> our shape */
export function normHere(rt) {
  const legs = (rt.sections || []).map((s) => {
    const t = s.transport || {}, mode = s.type === "pedestrian" ? "WALK" : t.mode || s.type || "";
    let geom = [];
    try { geom = s.polyline ? thin(decodeFlexPolyline(s.polyline)) : []; } catch { geom = []; }
    const p = (x) => place(x && x.place && x.place.name, x && x.place && x.place.location && x.place.location.lat, x && x.place && x.place.location && x.place.location.lng);
    return {
      mode, cat: legCat(mode), name: t.shortName || t.name || "", agency: (s.agency && s.agency.name) || "",
      from: p(s.departure), to: p(s.arrival), dep: s.departure && s.departure.time, arr: s.arrival && s.arrival.time, geom
    };
  });
  const rides = legs.filter((l) => l.cat !== "self"), first = legs[0], last = legs[legs.length - 1];
  const dep = first && first.dep, arr = last && last.arr;
  return { dep, arr, min: dep && arr ? Math.round((Date.parse(arr) - Date.parse(dep)) / 60000) : 0, transfers: Math.max(0, rides.length - 1), legs };
}

/* MOTIS map/stops -> rail stations, one per name (the most important), within km of the point */
const hav = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
export function railStations(stops, lat, lon, km) {
  const best = new Map();
  for (const s of stops || []) {
    const modes = s.modes || [];
    if (!modes.some((m) => legCat(m) === "regional" || legCat(m) === "long")) continue;
    const d = hav(lat, lon, s.lat, s.lon);
    if (d > km) continue;
    const k = String(s.name || "").trim().toLowerCase(), o = best.get(k);
    if (!o || (s.importance || 0) > o.imp) best.set(k, { ...place(s.name, s.lat, s.lon), imp: s.importance || 0, km: Math.round(d * 10) / 10, modes });
  }
  return [...best.values()].sort((a, b) => a.km - b.km);
}
/* HERE stations -> the same shape */
export function hereStations(j, lat, lon, km) {
  return railStations((j && j.stations || []).map((s) => ({ name: s.place && s.place.name, lat: s.place && s.place.location && s.place.location.lat,
    lon: s.place && s.place.location && s.place.location.lng, importance: (s.transports || []).length / 1000, modes: (s.transports || []).map((t) => t.mode) })), lat, lon, km);
}

/* cache keys: places rounded to ~500 m, time to the quarter hour */
const r3 = (v) => (Math.round(+v * 200) / 200).toFixed(3);
export function planKey(origin, q) {
  const ll = (s) => String(s || "").split(",").map(r3).join(",");
  const t = Date.parse(q.get("time") || "") || 0, quarter = new Date(Math.floor(t / 9e5) * 9e5).toISOString();
  return origin + "/api/transit/plan?from=" + ll(q.get("from")) + "&to=" + ll(q.get("to")) + "&time=" + quarter + "&n=" + (q.get("n") || 3);
}
export function stopsKey(origin, q) {
  return origin + "/api/transit/stops?lat=" + (+q.get("lat")).toFixed(2) + "&lon=" + (+q.get("lon")).toFixed(2) + "&km=" + Math.round(+q.get("km") || 40);
}
const LL = /^-?\d{1,2}(\.\d+)?,-?\d{1,3}(\.\d+)?$/;
export function validPlan(q) {
  return LL.test(q.get("from") || "") && LL.test(q.get("to") || "") && !Number.isNaN(Date.parse(q.get("time") || ""));
}

const json = (body, status, extra) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=600", ...extra } });

async function motisPlan(q) {
  const n = Math.min(4, Math.max(1, +(q.get("n") || 3)));
  const p = new URLSearchParams({ fromPlace: q.get("from"), toPlace: q.get("to"), time: new Date(Date.parse(q.get("time"))).toISOString(), numItineraries: String(n),
    transitModes: MOTIS_MODES, preTransitModes: "BIKE", maxPreTransitTime: "1800", postTransitModes: "WALK", maxPostTransitTime: "900" });
  const r = await fetch(MOTIS + "/v1/plan?" + p, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(7000) });
  if (!r.ok) throw new Error("transitous " + r.status);
  const j = await r.json();
  return (j.itineraries || []).slice(0, n).map(normMotis);
}
async function herePlan(q, key) {
  const n = Math.min(4, Math.max(1, +(q.get("n") || 3)));
  const p = new URLSearchParams({ origin: q.get("from"), destination: q.get("to"), departureTime: new Date(Date.parse(q.get("time"))).toISOString(),
    alternatives: String(n - 1), modes: HERE_MODES, return: "polyline", "pedestrian[maxDistance]": "4000", apiKey: key });
  const r = await fetch(HERE_ROUTES + "?" + p, { signal: AbortSignal.timeout(7000) });
  if (!r.ok) throw new Error("here " + r.status);
  const j = await r.json();
  return (j.routes || []).slice(0, n).map(normHere);
}
async function motisStops(lat, lon, km) {
  const dlat = km / 111, dlon = km / (111 * Math.cos(lat * Math.PI / 180));
  const u = `${MOTIS}/v1/map/stops?min=${(lat - dlat).toFixed(4)},${(lon - dlon).toFixed(4)}&max=${(lat + dlat).toFixed(4)},${(lon + dlon).toFixed(4)}`;
  const r = await fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(7000) });
  if (!r.ok) throw new Error("transitous " + r.status);
  return railStations(await r.json(), lat, lon, km);
}
async function hereStops(lat, lon, km, key) {
  const u = `${HERE_STATIONS}?in=${lat.toFixed(5)},${lon.toFixed(5)};r=${Math.round(Math.min(km, 50) * 1000)}&return=transport&maxPlaces=50&apiKey=${encodeURIComponent(key)}`;
  const r = await fetch(u, { signal: AbortSignal.timeout(7000) });
  if (!r.ok) throw new Error("here " + r.status);
  return hereStations(await r.json(), lat, lon, km);
}

export async function handleTransit(request, env, ctx) {
  const url = new URL(request.url), q = url.searchParams, here = env && env.HERE_API_KEY;
  const isPlan = url.pathname === "/api/transit/plan", isStops = url.pathname === "/api/transit/stops";
  if (!isPlan && !isStops) return json({ error: true, reason: "not found" }, 404, { "Cache-Control": "no-store" });
  if (isPlan && !validPlan(q)) return json({ error: true, reason: "from/to/time" }, 400, { "Cache-Control": "no-store" });
  const lat = +q.get("lat"), lon = +q.get("lon"), km = Math.min(80, Math.max(5, +q.get("km") || 40));
  if (isStops && !(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return json({ error: true, reason: "lat/lon" }, 400, { "Cache-Control": "no-store" });
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(isPlan ? planKey(url.origin, q) : stopsKey(url.origin, q));
  const hit = cache && (await cache.match(key));
  if (hit) return hit;
  let body = null;
  try {
    const list = isPlan ? await motisPlan(q) : await motisStops(lat, lon, km);
    if (list.length) body = isPlan ? { source: "transitous", itineraries: list } : { source: "transitous", stations: list };
  } catch { /* fall back */ }
  if (!body && here) {
    try {
      const list = isPlan ? await herePlan(q, here) : await hereStops(lat, lon, km, here);
      body = isPlan ? { source: "here", itineraries: list } : { source: "here", stations: list };
    } catch { /* both down */ }
  }
  if (!body) body = isPlan ? { source: null, itineraries: [] } : { source: null, stations: [] };
  const res = json(body, 200);
  if (cache && body.source) {
    const h = new Headers(res.headers); h.set("Cache-Control", "public, max-age=" + (isPlan ? TTL_PLAN : TTL_STOPS));
    const put = cache.put(key, new Response(JSON.stringify(body), { status: 200, headers: h }));
    if (ctx && ctx.waitUntil) ctx.waitUntil(put); else await put;
  }
  return res;
}
