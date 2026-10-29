/*
 * weather.mjs - "Oggi si sale": from an hourly forecast at the summit to a verdict.
 * Open-Meteo (free, no key, CORS), several summits in ONE request. The verdict logic is pure
 * (test/v2-weather.test.mjs); fetchForecast() is the only network call.
 *
 * Hour states, worst first:  storm (temporali) > wet (pioggia) > wind (vento forte) > cold (freddo
 * in quota) > good. CAPE is used as the physical value at the hour (never averaged).
 */
export const RIDE_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
export const T = { STORM_PP: 50, STORM_CAPE: 800, STORM_CAPE_PP: 25, WET_PP: 30, WIND_KMH: 35, COLD_C: 3, MIN_WINDOW_H: 3 };

export function hourState(x) {
  const pp = x.pp ?? 0, cape = x.cape ?? 0;
  if (pp >= T.STORM_PP || (cape >= T.STORM_CAPE && pp >= T.STORM_CAPE_PP)) return "storm";
  if (pp >= T.WET_PP) return "wet";
  if ((x.wind ?? 0) >= T.WIND_KMH) return "wind";
  if ((x.temp ?? 99) < T.COLD_C) return "cold";
  return "good";
}

/* hourly = Open-Meteo "hourly" block of ONE location; day = 0 today, 1 tomorrow...
   -> { cells: [{ h, state, temp, wind, pp }], window: { from, to } | null, label, tone, score } */
export function dayVerdict(hourly, day = 0) {
  const times = hourly.time || [];
  if (!times.length) return { cells: [], window: null, label: "Meteo non disponibile", tone: "na", score: -1 };
  const d0 = times[0].slice(0, 10), date = new Date(Date.parse(d0 + "T00:00:00Z") + day * 864e5).toISOString().slice(0, 10);
  const cells = [];
  for (const h of RIDE_HOURS) {
    const key = date + "T" + String(h).padStart(2, "0") + ":00", i = times.indexOf(key);
    if (i < 0) continue;
    const x = { temp: hourly.temperature_2m?.[i], pp: hourly.precipitation_probability?.[i], wind: hourly.wind_speed_10m?.[i], cape: hourly.cape?.[i] };
    cells.push({ h, state: hourState(x), temp: x.temp, wind: x.wind, pp: x.pp });
  }
  // longest run of good hours
  let best = null, start = -1;
  cells.forEach((c, i) => {
    if (c.state === "good" && start < 0) start = i;
    if ((c.state !== "good" || i === cells.length - 1) && start >= 0) {
      const end = c.state === "good" ? i : i - 1;
      if (!best || end - start > best.end - best.start) best = { start, end };
      start = -1;
    }
  });
  const len = best ? best.end - best.start + 1 : 0;
  if (best && len >= T.MIN_WINDOW_H) {
    const from = cells[best.start].h, to = cells[best.end].h + 1;
    return { cells, window: { from, to }, label: len >= cells.length ? "Ideale tutto il giorno" : `Ideale ${from}–${to}`, tone: "good", score: 100 + len };
  }
  const firstStorm = cells.find((c) => c.state === "storm");
  const count = (s) => cells.filter((c) => c.state === s).length;
  let label, tone = "bad";
  if (firstStorm && count("storm") >= 2) label = firstStorm.h <= 8 ? "Temporali" : `Temporali dalle ${firstStorm.h}`;
  else if (count("wet") + count("storm") >= 3) label = "Pioggia";
  else if (count("wind") >= 3) label = "Vento forte";
  else if (count("cold") >= 3) { label = "Freddo in quota"; tone = "warn"; }
  else { label = len ? `Finestra breve ${cells[best.start].h}–${cells[best.end].h + 1}` : "Variabile"; tone = "warn"; }
  return { cells, window: null, label, tone, score: len * 10 - count("storm") * 5 };
}

/* "Parti entro le 10:30"-style advice for the climb page */
export function advice(v) {
  if (!v || !v.cells.length) return null;
  if (v.window) {
    const stormAfter = v.cells.find((c) => c.h >= v.window.to && c.state === "storm");
    if (v.window.to <= 19 && stormAfter) return { head: `Parti entro le ${v.window.to - 2}:00`, sub: `Dalle ${stormAfter.h} sale il rischio temporali.` };
    return { head: v.label, sub: "Niente temporali, vento e temperatura nella norma in quota." };
  }
  return { head: v.label, sub: "Guarda la fascia oraria qui sotto prima di partire." };
}

/* points: [{ lat, lon, ele }] (summits). Returns one hourly block per point, same order. */
export async function fetchForecast(points, days = 3) {
  if (!points.length) return [];
  const q = new URLSearchParams({
    latitude: points.map((p) => p.lat.toFixed(4)).join(","),
    longitude: points.map((p) => p.lon.toFixed(4)).join(","),
    elevation: points.map((p) => Math.round(p.ele ?? 0)).join(","),
    hourly: "temperature_2m,precipitation_probability,wind_speed_10m,cape",
    timezone: "auto", forecast_days: String(days)
  });
  const r = await fetch("https://api.open-meteo.com/v1/forecast?" + q.toString());
  if (!r.ok) throw new Error("meteo " + r.status);
  const j = await r.json();
  return (Array.isArray(j) ? j : [j]).map((x) => x.hourly || {});
}
