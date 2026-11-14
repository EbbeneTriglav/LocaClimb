/* Turn-by-turn navigation along the Giro (Rick 11/11/2026: "come Google Maps, ma per bici").
   BRouter gives the turns with &timode=2: voicehints = [[track index, command, roundabout exit, distance, angle], ...].
   Pure helpers, tested in test/v2-nav.test.mjs; the screen, the GPS and the camera live in app.mjs. */
import { havKm } from "./climb.mjs?v=63";

/* BRouter VoiceHint commands */
const CMD = {
  1: { k: "straight", t: "Continua dritto" }, 2: { k: "left", t: "Gira a sinistra" }, 3: { k: "slight-left", t: "Gira leggermente a sinistra" },
  4: { k: "sharp-left", t: "Gira decisamente a sinistra" }, 5: { k: "right", t: "Gira a destra" }, 6: { k: "slight-right", t: "Gira leggermente a destra" },
  7: { k: "sharp-right", t: "Gira decisamente a destra" }, 8: { k: "keep-left", t: "Tieni la sinistra" }, 9: { k: "keep-right", t: "Tieni la destra" },
  10: { k: "uturn", t: "Fai inversione a U" }, 11: { k: "uturn", t: "Fai inversione a U" }, 12: { k: "uturn", t: "Fai inversione a U" },
  13: { k: "roundabout", t: "Alla rotonda" }, 14: { k: "roundabout", t: "Alla rotonda" },   // 15 = beeline: no road, no hint
  16: { k: "exit-left", t: "Esci a sinistra" }, 17: { k: "exit-right", t: "Esci a destra" }
};

/* voicehints -> maneuvers on the track: { i, k, text, exit, angle } (beeline / off-route / unknown dropped) */
export function maneuvers(hints, n) {
  const out = [];
  for (const h of Array.isArray(hints) ? hints : []) {
    if (!Array.isArray(h) || h.length < 2) continue;
    const i = +h[0], c = CMD[+h[1]];
    if (!c || !(i >= 0) || (n && i >= n)) continue;
    const exit = +h[2] || 0;
    out.push({ i, k: c.k, exit, angle: +h[4] || 0, text: c.k === "roundabout" && exit ? `Alla rotonda prendi la ${exit}ª uscita` : c.t });
  }
  return out.sort((a, b) => a.i - b.i);
}

/* cumulative km along the track */
export function cumKm(t) { const c = [0]; for (let i = 1; i < t.length; i++) c.push(c[i - 1] + havKm(t[i - 1][0], t[i - 1][1], t[i][0], t[i][1])); return c; }

/* metres of climbing left from each point (for "+m che mancano") */
export function gainLeft(t) {
  const g = new Array(t.length).fill(0);
  for (let i = t.length - 2; i >= 0; i--) { const a = t[i][2], b = t[i + 1][2]; g[i] = g[i + 1] + (a != null && b != null && b > a ? b - a : 0); }
  return g;
}

/* project p on segment a-b (flat, metres): { f (0..1), d (m) } */
function proj(p, a, b) {
  const k = Math.cos(p.lat * Math.PI / 180) * 111320, M = 110540;
  const ax = (a[1] - p.lon) * k, ay = (a[0] - p.lat) * M, bx = (b[1] - p.lon) * k, by = (b[0] - p.lat) * M;
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const f = L > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
  return { f, d: Math.hypot(ax + f * dx, ay + f * dy) };
}

/* where the rider is on the route: the nearest segment in a window from the last known one (a loop or an
   out-and-back never jumps to the other side); lost (> 150 m) -> search everything.
   -> { seg, along (km), off (m) } */
export function locate(t, c, p, last = 0) {
  if (!t || t.length < 2 || !p) return null;
  const scan = (from, to) => {
    let best = null;
    for (let i = Math.max(0, from); i < Math.min(t.length - 1, to); i++) {
      const q = proj(p, t[i], t[i + 1]);
      if (!best || q.d < best.off) best = { seg: i, along: c[i] + (c[i + 1] - c[i]) * q.f, off: q.d };
    }
    return best;
  };
  let r = scan(last - 3, last + 400);
  if (!r || r.off > 150) { const all = scan(0, t.length); if (all && (!r || all.off < r.off)) r = all; }
  return r;
}

/* the next maneuver after the rider (5 m of slack) and the one after it */
export function upcoming(ms, c, along) {
  const i = ms.findIndex((m) => c[m.i] > along + 0.005);
  if (i < 0) return { next: null, then: null, distM: Math.round((c[c.length - 1] - along) * 1000) };
  return { next: ms[i], then: ms[i + 1] || null, distM: Math.round((c[ms[i].i] - along) * 1000) };
}

/* "300 m", "1,2 km"; rounded like a car navigator */
export function fmtDistNav(m, dec = ",") {
  if (m >= 1000) return (m / 1000).toFixed(m >= 10000 ? 0 : 1).replace(".", dec) + " km";
  if (m >= 100) return Math.round(m / 50) * 50 + " m";
  return Math.max(0, Math.round(m / 10) * 10) + " m";
}

/* heading of the route a few tens of metres ahead (the camera follows the road, not the GPS jitter) */
export function routeBearing(t, c, along, aheadKm = 0.04) {
  const target = along + aheadKm;
  let j = 0; while (j < c.length - 1 && c[j] < target) j++;
  let i = j; while (i > 0 && c[i] > along - 0.005) i--;
  const a = t[i], b = t[Math.max(j, i + 1)] || t[t.length - 1];
  const r = Math.PI / 180, y = Math.sin((b[1] - a[1]) * r) * Math.cos(b[0] * r);
  const x = Math.cos(a[0] * r) * Math.sin(b[0] * r) - Math.sin(a[0] * r) * Math.cos(b[0] * r) * Math.cos((b[1] - a[1]) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}

/* off the route: more than offM away on `need` fixes in a row */
/* Reroute pacing (Rick 14/11/2026, by car near San Pellegrino Terme: off the line it re-routed every 3 s, the
   banner always said "Ricalcolo" and the app felt stuck). A new route starts where the rider WAS when it was
   asked for, so at car speed the next fixes are off it again: after a reroute the rider gets some seconds to
   join the new line before the next one, longer if the request failed; the voice says it once in a while. */
export const REROUTE = { calmOk: 10000, calmFail: 15000, sayEvery: 45000 };
export function rerouteDue(st, off, now) {
  if (now < (st.calm || 0)) { st.bad = 0; return false; }
  return offRoute(st, off);
}
export function rerouteDone(st, now, ok) { st.calm = now + (ok ? REROUTE.calmOk : REROUTE.calmFail); st.bad = 0; }
export function sayReroute(st, now) {
  if (st.said != null && now - st.said < REROUTE.sayEvery) return false;
  st.said = now; return true;
}

/* "Naviga" on a climb with more sides (Rick 14/11/2026: to Alino it took San Giovanni Bianco, he wanted San
   Pellegrino): the sides that have a road drawn, in the sheet's order, with the km from the rider to each base
   and the nearest marked. here = null (no GPS) -> no distances. [{ i, side, km, near }] */
export function sidesByDistance(vs, here) {
  const out = (vs || []).map((v, i) => ({ v, i })).filter((x) => x.v.track && x.v.track.length > 1)
    .map(({ v, i }) => ({ i, side: v.side || "", km: here ? +havKm(here.lat, here.lon, v.track[0][0], v.track[0][1]).toFixed(1) : null, near: false }));
  if (here && out.length) out.reduce((a, b) => (b.km < a.km ? b : a)).near = true;
  return out;
}

export function offRoute(state, off, offM = 50, need = 3) {
  state.bad = off > offM ? (state.bad || 0) + 1 : 0;
  return state.bad >= need;
}

/* voice prompts: one "in 300 m, turn right" and one "turn right" per maneuver.
   st = { i, far, near } kept by the caller; -> "far" | "near" | null */
export function voiceCue(st, next, distM, far = 300, near = 50) {
  if (!next) return null;
  if (st.i !== next.i) { st.i = next.i; st.far = st.near = false; }
  if (distM <= near && !st.near) { st.near = st.far = true; return "near"; }
  if (distM <= far && distM > near + 70 && !st.far) { st.far = true; return "far"; }
  return null;
}

/* distances read aloud: words, not "m"/"km" (speech engines read the symbols badly) */
const UNITS = { it: ["metri", "chilometri", "un chilometro"], en: ["metres", "kilometres", "one kilometre"], es: ["metros", "kilómetros", "un kilómetro"] };
export function spokenDist(m, lang = "it") {
  const u = UNITS[lang] || UNITS.it;
  if (m >= 950 && m < 1050) return u[2];
  if (m >= 1000) return String(Math.round(m / 100) / 10).replace(".", lang === "en" ? "." : ",") + " " + u[1];
  return (m >= 100 ? Math.round(m / 50) * 50 : Math.max(10, Math.round(m / 10) * 10)) + " " + u[0];
}

/* the sentence: the maneuver text is already in the page language */
export function voiceText(text, distM, lang = "it") {
  if (distM == null) return text;
  const d = spokenDist(distM, lang), low = text.charAt(0).toLowerCase() + text.slice(1);
  return lang === "en" ? `In ${d}, ${low}` : lang === "es" ? `En ${d}, ${low}` : `Tra ${d}, ${low}`;
}

/* a finger on the map has really moved (not a tap): more than px from where it went down */
export function fingerMoved(down, e, px = 6) { return Math.hypot(e.clientX - down.x, e.clientY - down.y) > px; }
