/*
 * propose.mjs - "Proponi una salita" and the contributor levels, for v2. Same Firestore documents and
 * rules as the classic app (js/contribute.js, firestore.rules /proposals): a tester with
 * users/{uid}.canPropose draws the climb in the Giro (start -> summit) and sends it; the admin
 * approves; scripts/import_proposals.mjs moves approved ones into data/osm_passes_user.json.
 * Pure and tested (test/v2-propose.test.mjs).
 */
import { havKm } from "./climb.mjs?v=25";

export const MAXPTS = 800, MINKM = 1.5, MINGAIN = 100;
/* levels count ACCEPTED climbs (a second side of the same pass counts half), as the classic app */
export const LEVELS = [
  { min: 0, it: "Foresto", en: "Out-of-Towner", ic: "🧳" },
  { min: 1, it: "Turista del pedale", en: "Pedal Tourist", ic: "📸" },
  { min: 5, it: "Cane Sciolto", en: "Stray Dog", ic: "🐕" },
  { min: 15, it: "Local Rider", en: "Local Rider", ic: "🏅" }
];
export function levelOf(pts) { let lv = LEVELS[0]; for (const l of LEVELS) if (pts >= l.min) lv = l; return lv; }
export function nextLevel(pts) { return LEVELS.find((l) => l.min > pts) || null; }
export function points(rows) { return rows.reduce((a, r) => a + (r.status === "approved" ? (r.secondSide ? 0.5 : 1) : 0), 0); }

const DIRS = ["Nord", "Nord-Est", "Est", "Sud-Est", "Sud", "Sud-Ovest", "Ovest", "Nord-Ovest"];
function bearing(la1, lo1, la2, lo2) {
  const p = Math.PI / 180, y = Math.sin((lo2 - lo1) * p) * Math.cos(la2 * p);
  const x = Math.cos(la1 * p) * Math.sin(la2 * p) - Math.sin(la1 * p) * Math.cos(la2 * p) * Math.cos((lo2 - lo1) * p);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
/* max gradient over ~300 m windows, as the pipeline (build_osm_passes buildSide): the classic app used
   100 m, and router/DEM heights come in steps that turn 100 m windows into 40-70% "walls" */
export function maxGradient(tr) {
  let best = 0, i = 0;
  while (i < tr.length - 1) {
    let d = 0, j = i;
    while (j < tr.length - 1 && d < 0.3) { d += havKm(tr[j][0], tr[j][1], tr[j + 1][0], tr[j + 1][1]); j++; }
    if (d >= 0.25 && tr[j][2] != null && tr[i][2] != null) { const g = (tr[j][2] - tr[i][2]) / (d * 10); if (g > best) best = g; }
    i++;
  }
  return Math.round(best * 10) / 10;
}
/* facts of a drawn climb (track = [[lat, lon, ele], ...], start -> summit) */
export function facts(tr, km, gain) {
  const a = tr[0], b = tr[tr.length - 1], deg = bearing(b[0], b[1], a[0], a[1]);   // a side faces away from the summit
  return {
    km, gain, avgGradient: km > 0 ? +(gain / (km * 10)).toFixed(1) : 0, maxGradient: maxGradient(tr),
    exposure: DIRS[Math.round(deg / 45) % 8], exposureDeg: Math.round(deg),
    startLat: +(+a[0]).toFixed(5), startLon: +(+a[1]).toFixed(5), endLat: +(+b[0]).toFixed(5), endLon: +(+b[1]).toFixed(5),
    startElevation: a[2] == null ? null : Math.round(a[2]), endElevation: b[2] == null ? null : Math.round(b[2])
  };
}
export function flatTrack(tr) {
  const n = tr.length, step = n > MAXPTS ? (n - 1) / (MAXPTS - 1) : 1, out = [];
  for (let i = 0; i < (step > 1 ? MAXPTS : n); i++) {
    const p = tr[Math.round(i * step)] || tr[n - 1];
    out.push(+(+p[0]).toFixed(5), +(+p[1]).toFixed(5), p[2] == null ? 0 : Math.round(p[2]));
  }
  return out;
}
/* null if the drawn track can be a climb, else the reason (Italian) */
export function proposalProblem(f) {
  if (!(f.km >= MINKM) || !(f.gain >= MINGAIN)) return `Tracciato troppo corto: servono almeno ${MINKM} km e ${MINGAIN} m di dislivello.`;
  if (f.km >= 60) return "Troppo lungo per una salita (max 60 km): disegna solo dalla base alla cima.";
  return null;
}
/* the document the rules accept (firestore.rules /proposals create) */
export function proposalDoc(user, form, f, tr, now = Date.now()) {
  return {
    uid: user.uid, author: user.displayName || String(user.email || "").split("@")[0] || "anonimo",
    name: String(form.name || "").trim().slice(0, 70), side: String(form.side || "").trim().slice(0, 50) || "Versante unico",
    note: String(form.note || "").trim().slice(0, 400), status: "pending",
    lat: f.endLat, lon: f.endLon, elevation: f.endElevation,
    km: +(+f.km).toFixed(2), gain: Math.round(f.gain), avgGradient: f.avgGradient, maxGradient: f.maxGradient,
    exposure: f.exposure, exposureDeg: f.exposureDeg, startLat: f.startLat, startLon: f.startLon,
    startElevation: f.startElevation, endElevation: f.endElevation, flat: flatTrack(tr), createdAt: now
  };
}
export function unflat(flat) { const out = []; for (let i = 0; i + 2 < (flat || []).length; i += 3) out.push([flat[i], flat[i + 1], flat[i + 2]]); return out; }
