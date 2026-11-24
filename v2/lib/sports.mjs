/*
 * sports.mjs - the Giro for other sports (24/11/2026, Rick: "apriamoci ad altri sport: corsa, escursioni,
 * cammini di più giorni - il sistema di creazione del giro è il medesimo").
 *
 * Same builder (stops, drag the line, several days, GPX, weather, water); per sport only: the router profile
 * (BRouter: bike profiles or "hiking-mountain" for paths), the map, the time model and the set-ups of the
 * several-days section. Pure functions, test/v2-sports.test.mjs.
 */
export const SPORTS = [
  { k: "bici", label: "Bici da strada", foot: false, map: "ciclabile",
    profiles: [["fastbike", "Solo asfalto"], ["safety", "Più ciclabili"], ["trekking", "Anche sterrato"], ["shortest", "Più corto"]] },
  { k: "gravel", label: "Gravel / MTB", foot: false, map: "ciclabile",
    profiles: [["trekking", "Sterrato e strade bianche"], ["shortest", "Più corto"], ["fastbike", "Solo asfalto"]] },
  { k: "escursione", label: "Escursione", foot: true, map: "topo", pace: "hike",
    profiles: [["hiking-mountain", "Sentieri"]] },
  { k: "cammino", label: "Cammino", foot: true, map: "topo", pace: "walk",
    profiles: [["hiking-mountain", "Sentieri e strade"], ["shortest", "Più corto"]] },
  { k: "corsa", label: "Corsa / trail", foot: true, map: "topo", pace: "run",
    profiles: [["hiking-mountain", "Sentieri"], ["shortest", "Strade"]] }
];
export const sportOf = (k) => SPORTS.find((s) => s.k === k) || SPORTS[0];
export const FOOT_PROFILES = new Set(["hiking-mountain"]);

/* several days on foot: what you carry and how fit you are (hours a day, stops excluded) */
export const FOOT_SETUPS = [
  { k: "leggero", label: "Zainetto", note: "giornata, rientro ogni sera", kg: 4 },
  { k: "rifugi", label: "Zaino da rifugi", note: "sacco lenzuolo, ricambi", kg: 9 },
  { k: "tenda", label: "Zaino con tenda", note: "tenda, fornellino, cibo", kg: 16 }
];
export const FOOT_FITNESS = [
  { k: "tranquillo", label: "Tranquillo", note: "passeggiate, ritmo lento", speed: 0.85, h: 4 },
  { k: "allenato", label: "Allenato", note: "escursioni frequenti", speed: 1, h: 6 },
  { k: "sportivo", label: "Sportivo", note: "trail, lunghe giornate", speed: 1.2, h: 8 }
];

/* Minutes along an evenly sampled side on foot.
   Hiking and walking: Swiss hiking-time rule (4 km/h on the flat, 400 m/h up, 800 m/h down; the longer of the
   horizontal and the vertical time plus half of the shorter), per stretch; walking on the flat is 4.5 km/h.
   Running: 9.5 km/h on the flat, +1 min per 10 m up, +1 min per 40 m down (steep trail).
   speed: fitness factor; kg: load, 1% slower per kg over 4 (never on runs). */
export function footMinutes(side, pace = "hike", speed = 1, kg = 4) {
  const p = side.elevationProfile || [], n = p.length;
  if (n < 2 || !(side.distance_km > 0)) return [0];
  const step = side.distance_km / (n - 1), out = [0];
  const load = pace === "run" ? 1 : 1 + Math.max(0, kg - 4) * 0.01;
  for (let i = 1; i < n; i++) {
    const dz = p[i] - p[i - 1];
    let m;
    if (pace === "run") m = step / 9.5 * 60 + (dz > 0 ? dz / 10 : -dz / 40);
    else {
      const h = step / (pace === "walk" ? 4.5 : 4) * 60, v = dz > 0 ? dz / 400 * 60 : -dz / 800 * 60;
      m = Math.max(h, v) + Math.min(h, v) / 2;
    }
    out.push(out[i - 1] + m * load / speed);
  }
  return out;
}

/* "6 km/h" / "5:40 /km": the average the time model gives, for the summary line */
export function paceLabel(km, min, run) {
  if (!(km > 0) || !(min > 0)) return "–";
  if (!run) return (km / (min / 60)).toFixed(1).replace(".", ",") + " km/h";
  const s = Math.round(min / km * 60);
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") + " /km";
}
