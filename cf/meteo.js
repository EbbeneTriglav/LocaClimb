/*
 * /api/meteo - weather for the app, behind our own origin (02/11/2026).
 * 1) Open-Meteo, same query the app used to send directly (5 s timeout);
 * 2) if it fails (it answered 503 "The service is overloaded" for everybody on 02/11/2026),
 *    MET Norway Locationforecast (the data behind Yr), converted to Open-Meteo's shape so the
 *    app does not change; no CAPE there (null), and the response says source "met.no";
 * 3) every answer is cached ~30 min per ~1 km cell, so many riders looking at the same climb
 *    make one upstream call.
 * Pure helpers are exported for test/meteo-proxy.test.mjs.
 */
const OM = "https://api.open-meteo.com/v1/forecast";
const MET = "https://api.met.no/weatherapi/locationforecast/2.0/complete";
const UA = "LocaRide/1.0 (+https://locaride.app; info@locaride.app)"; // MET Norway's terms: identify the app
const TTL = 1800;

/* cache key: same query, coordinates rounded to 0.01 deg (~1 km) */
export function cacheKey(url) {
  const u = new URL(url), q = new URLSearchParams(u.search);
  for (const k of ["latitude", "longitude"]) if (q.has(k)) q.set(k, q.get(k).split(",").map((v) => (+v).toFixed(2)).join(","));
  q.sort();
  return u.origin + u.pathname + "?" + q.toString();
}

/* MET symbol_code -> WMO weather code (the app's labels use WMO) */
export function symbolToWmo(s) {
  s = String(s || "").replace(/_(day|night|polartwilight)$/, "");
  if (/thunder/.test(s)) return 95;
  if (/snowshowers/.test(s)) return 85;
  if (/snow/.test(s)) return /heavy/.test(s) ? 75 : 73;
  if (/sleet/.test(s)) return 67;
  if (/rainshowers/.test(s)) return /heavy/.test(s) ? 82 : 80;
  if (/rain/.test(s)) return /heavy/.test(s) ? 65 : /light/.test(s) ? 61 : 63;
  if (s === "fog") return 45;
  if (s === "cloudy") return 3;
  if (s === "partlycloudy") return 2;
  if (s === "fair") return 1;
  return 0;
}

/* "2026-11-02T13:00:00Z" -> local "2026-11-02T14:00" in time zone tz (as Open-Meteo with timezone=auto) */
export function localTime(iso, tz) {
  const f = new Intl.DateTimeFormat("sv-SE", { timeZone: tz || "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return f.format(new Date(iso)).replace(" ", "T");
}

/* one MET Locationforecast answer -> { hourly, daily } in Open-Meteo's units (°C, %, km/h) */
export function metToOpenMeteo(met, tz, days = 3) {
  const H = { time: [], temperature_2m: [], precipitation_probability: [], wind_speed_10m: [], cape: [] };
  const byDay = new Map();
  for (const s of (met && met.properties && met.properties.timeseries) || []) {
    const d = s.data || {}, inst = (d.instant && d.instant.details) || {};
    const nx = d.next_1_hours || d.next_6_hours || {}, nd = nx.details || {};
    const amount = nd.precipitation_amount;
    const pp = nd.probability_of_precipitation ?? (amount == null ? null : amount >= 0.5 ? 70 : amount >= 0.1 ? 40 : 5);
    const t = localTime(s.time, tz), day = t.slice(0, 10);
    if (!byDay.has(day) && byDay.size >= Math.max(days, 1)) break;
    const wind = inst.wind_speed == null ? null : Math.round(inst.wind_speed * 3.6 * 10) / 10;
    H.time.push(t); H.temperature_2m.push(inst.air_temperature ?? null); H.precipitation_probability.push(pp);
    H.wind_speed_10m.push(wind); H.cape.push(null);
    const g = byDay.get(day) || { tmax: -99, tmin: 99, pp: 0, wind: 0, code: 0 };
    if (inst.air_temperature != null) { g.tmax = Math.max(g.tmax, inst.air_temperature); g.tmin = Math.min(g.tmin, inst.air_temperature); }
    if (pp != null) g.pp = Math.max(g.pp, pp);
    if (wind != null) g.wind = Math.max(g.wind, wind);
    g.code = Math.max(g.code, symbolToWmo(nx.summary && nx.summary.symbol_code));
    byDay.set(day, g);
  }
  const D = { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_probability_max: [], wind_speed_10m_max: [] };
  for (const [day, g] of byDay) {
    D.time.push(day); D.weather_code.push(g.code); D.temperature_2m_max.push(g.tmax); D.temperature_2m_min.push(g.tmin);
    D.precipitation_probability_max.push(g.pp); D.wind_speed_10m_max.push(g.wind);
  }
  return { hourly: H, daily: D, source: "met.no" };
}

const json = (body, status, extra) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=900", ...extra } });

async function fromMet(q, tz) {
  const lats = (q.get("latitude") || "").split(","), lons = (q.get("longitude") || "").split(","), eles = (q.get("elevation") || "").split(",");
  const days = +(q.get("forecast_days") || 3);
  const n = Math.min(lats.length, 40), out = new Array(n);
  for (let i = 0; i < n; i += 6) { // a few at a time: MET asks for gentle clients
    await Promise.all(Array.from({ length: Math.min(6, n - i) }, async (_, k) => {
      const j = i + k, u = new URL(MET);
      u.searchParams.set("lat", (+lats[j]).toFixed(4)); u.searchParams.set("lon", (+lons[j]).toFixed(4));
      if (eles[j] !== undefined && eles[j] !== "") u.searchParams.set("altitude", String(Math.round(+eles[j])));
      const r = await fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error("met " + r.status);
      out[j] = metToOpenMeteo(await r.json(), tz, days);
    }));
  }
  return n === 1 ? out[0] : out;
}

export async function handleMeteo(request, ctx) {
  const url = new URL(request.url), q = new URLSearchParams(url.search);
  const tz = q.get("tz") || "Europe/Rome"; q.delete("tz");
  if (!q.get("latitude") || !q.get("longitude")) return json({ error: true, reason: "latitude/longitude" }, 400);
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(cacheKey(url.origin + url.pathname + "?" + q.toString() + "&tz=" + encodeURIComponent(tz)));
  const hit = cache && (await cache.match(key));
  if (hit) return hit;
  let res = null;
  try {
    const r = await fetch(OM + "?" + q.toString(), { signal: AbortSignal.timeout(5000) });
    if (r.ok) res = json(await r.json(), 200, { "X-Meteo-Source": "open-meteo" });
  } catch { /* fall back */ }
  if (!res) {
    try { res = json(await fromMet(q, tz), 200, { "X-Meteo-Source": "met.no" }); } catch { /* both down */ }
  }
  if (!res) return json({ error: true, reason: "weather services unavailable" }, 503, { "Cache-Control": "no-store" });
  if (cache) {
    const c = res.clone(); const h = new Headers(c.headers); h.set("Cache-Control", "public, max-age=" + TTL);
    const put = cache.put(key, new Response(c.body, { status: 200, headers: h }));
    if (ctx && ctx.waitUntil) ctx.waitUntil(put); else await put;
  }
  return res;
}
