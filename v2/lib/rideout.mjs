/*
 * rideout.mjs - the ride outside the app: an image for social apps and a printable road book.
 * Same content as the v1 (js/sharecard.js, js/roadbook.js), redrawn in the v2 style.
 * Pure except drawCard(), which only calls the 2D-canvas API it is given (tested with a recorder).
 *
 * Input (built by app.mjs from the Giro): {
 *   title, date, lang, start "08:00", wkg, url,
 *   km, gain, minutes, side: { track [[lat,lon]], elevationProfile, distance_km }, eta [min per sample] | null,
 *   climbs [{ name, km, elevation, difficulty }], water [{ km, name }], stops [{ name, lat, lon }],
 *   weather [{ name, km, temp, wind, pp }] | null
 * }
 * The image does not use map tiles on purpose (as v1): no CORS-tainted canvas, nothing to download.
 */
import { gradeColor, difficultyColor, profileShapes } from "./climb.mjs?v=23";

export const CARD_W = 1080, CARD_H = 1350;   // 4:5, the portrait size Instagram and WhatsApp show whole

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const n0 = (x, d = 0, lang = "it") => (x == null || !isFinite(x)) ? "–" : Number(x).toLocaleString(lang === "en" ? "en-GB" : "it-IT", { minimumFractionDigits: d, maximumFractionDigits: d });
export function hm(min) { if (min == null || !isFinite(min)) return "–"; const m = Math.round(min); return Math.floor(m / 60) + ":" + String(m % 60).padStart(2, "0"); }

const TXT = {
  it: { ride: "Il mio giro", km: "km", m: "metri", time: "in sella", top: "quota max", climbs: "Salite", water: "Acqua", route: "Il percorso", start: "Partenza", end: "Arrivo", hi: "Punto più alto",
    when: "Ora", where: "Dove", ele: "Quota", wx: "Meteo", noWater: "Nessun punto acqua mappato entro 100 m: borracce piene.", gap: "tratto più lungo senza acqua", print: "Stampa o salva PDF",
    est: (w) => `Tempi stimati a ${w} W/kg, soste escluse.`, depart: "partenza", diff: "difficoltà", src: "Dati © OpenStreetMap contributors · quote: modello del terreno · meteo: Open-Meteo" },
  en: { ride: "My ride", km: "km", m: "metres", time: "riding", top: "highest", climbs: "Climbs", water: "Water", route: "The route", start: "Start", end: "Finish", hi: "Highest point",
    when: "Time", where: "Where", ele: "Elev.", wx: "Weather", noWater: "No water point mapped within 100 m: fill your bottles.", gap: "longest stretch without water", print: "Print or save as PDF",
    est: (w) => `Times estimated at ${w} W/kg, stops excluded.`, depart: "start", diff: "difficulty", src: "Data © OpenStreetMap contributors · elevation: terrain model · weather: Open-Meteo" }
};
const tx = (d) => TXT[d.lang === "en" ? "en" : "it"];

/* lat/lon -> x/y in a w*h box, north up, true proportions (cos of the mean latitude), centred */
export function routeShape(track, w, h, pad = 0) {
  if (!track || track.length < 2) return [];
  let a = Infinity, b = -Infinity, c = Infinity, e = -Infinity;
  for (const q of track) { if (q[0] < a) a = q[0]; if (q[0] > b) b = q[0]; if (q[1] < c) c = q[1]; if (q[1] > e) e = q[1]; }
  const k = Math.cos(((a + b) / 2) * Math.PI / 180), dx = (e - c) * k || 1e-9, dy = (b - a) || 1e-9;
  const s = Math.min((w - 2 * pad) / dx, (h - 2 * pad) / dy), ox = (w - dx * s) / 2, oy = (h - dy * s) / 2;
  return track.map((q) => [+(ox + (q[1] - c) * k * s).toFixed(1), +(oy + (b - q[0]) * s).toFixed(1)]);
}

/* gradient (%) at every sample of the profile, smoothed over ~0.6 km so the colours read as climbs, not noise */
export function sampleGrades(side) {
  const p = side.elevationProfile || [], n = p.length, step = (side.distance_km || 0) / Math.max(1, n - 1) * 1000;
  if (n < 2 || !(step > 0)) return p.map(() => 0);
  const k = Math.max(1, Math.round(300 / step));
  return p.map((_, i) => { const a = Math.max(0, i - k), b = Math.min(n - 1, i + k); return (p[b] - p[a]) / ((b - a) * step) * 100; });
}

/* the profile with colours from the smoothed gradient (raw 50-m steps flicker on a 100-km ride) */
export function smoothProfile(side, w, h, pad) {
  const sh = profileShapes(side, w, h, pad), gr = sampleGrades(side), p = side.elevationProfile || [];
  if (sh.segs.length === p.length - 1) sh.segs.forEach((sg, i) => { sg.color = gradeColor(gr[i + 1]); });
  return sh;
}

/* the km of each stop along the ride (nearest sample) */
export function stopKms(side, stops) {
  const t = side.track || [], n = t.length, L = side.distance_km || 0;
  return (stops || []).map((s) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i < n; i++) { const d = (t[i][0] - s.lat) ** 2 + ((t[i][1] - s.lon) * Math.cos(s.lat * Math.PI / 180)) ** 2; if (d < bd) { bd = d; best = i; } }
    return n > 1 ? best / (n - 1) * L : 0;
  });
}

/* every point worth a line in the road book, in riding order, with the time you get there */
export function bookRows(d) {
  const T = tx(d), sd = d.side, n = sd.elevationProfile.length, L = sd.distance_km || d.km || 0;
  const idx = (km) => Math.max(0, Math.min(n - 1, Math.round(km / (L || 1) * (n - 1))));
  const [hh, mm] = String(d.start || "08:00").split(":").map(Number), t0 = (hh || 0) * 60 + (mm || 0);
  const clockAt = (km) => (d.eta ? hm(t0 + d.eta[idx(km)]) : "");
  const rows = [], add = (km, kind, name, note = "") => rows.push({ km, kind, name, note, ele: sd.elevationProfile[idx(km)], time: clockAt(km) });
  const sk = stopKms(sd, d.stops);
  (d.stops || []).forEach((s, i) => { if (i === 0) add(0, "start", s.name || T.start); else if (i === d.stops.length - 1) add(L, "end", s.name || T.end); else if (s.name) add(sk[i], "stop", s.name); });
  if (!(d.stops || []).length) { add(0, "start", T.start); add(L, "end", T.end); }
  for (const c of d.climbs || []) {
    const note = c.difficulty ? `${T.diff} ${c.difficulty}/10` : "", same = rows.find((r) => r.name === c.name && Math.abs(r.km - c.km) < 1);
    if (same) { same.note = note; same.climb = true; } else add(c.km, "climb", c.name, note);   // a stop named after the climb: one line
  }
  let hi = 0; sd.elevationProfile.forEach((e, i) => { if (e > sd.elevationProfile[hi]) hi = i; });
  const hiKm = hi / Math.max(1, n - 1) * L;
  if (!rows.some((r) => Math.abs(r.km - hiKm) < 1.5)) add(hiKm, "hi", T.hi);
  for (const w of (d.water || []).slice(0, 20)) add(w.km, "water", w.name || T.water);
  const order = { start: 0, stop: 1, climb: 1, hi: 1, water: 2, end: 3 };
  return rows.sort((a, b) => (a.kind === "end") - (b.kind === "end") || (a.kind === "start" ? -1 : b.kind === "start" ? 1 : a.km - b.km || order[a.kind] - order[b.kind]));
}

export function waterGap(d) {
  let gap = 0, prev = 0;
  for (const w of d.water || []) { gap = Math.max(gap, w.km - prev); prev = w.km; }
  return Math.max(gap, (d.km || 0) - prev);
}

/* ------------------------------------------------------------------ printable road book (A4, light) */
export function roadbookHtml(d) {
  const T = tx(d), L = d.lang === "en" ? "en" : "it";
  const sh = smoothProfile(d.side, 1000, 190, 6), pts = routeShape(d.side.track, 300, 300, 14), gr = sampleGrades(d.side);
  const route = pts.slice(1).map((p, i) => `<path d="M${pts[i][0]} ${pts[i][1]}L${p[0]} ${p[1]}" stroke="${gradeColor(gr[i + 1])}"/>`).join("");
  const L0 = d.side.distance_km || d.km || 1;
  const marks = (d.climbs || []).map((c) => { const x = +(c.km / L0 * 1000).toFixed(1); return `<g><line x1="${x}" x2="${x}" y1="0" y2="190" stroke="#0B0F14" stroke-dasharray="3 3" stroke-width="1"/><text x="${Math.min(990, Math.max(10, x))}" y="12" text-anchor="${x > 900 ? "end" : x < 100 ? "start" : "middle"}">${esc(c.name)}</text></g>`; }).join("");
  const wx = new Map((d.weather || []).map((w) => [Math.round(w.km), w]));
  const rows = bookRows(d).map((r) => {
    const w = r.kind !== "water" ? wx.get(Math.round(r.km)) : null;
    return `<tr class="${r.kind}${r.climb ? " climb" : ""}"><td class="n">${n0(r.km, 0, L)}</td><td class="n">${esc(r.time)}</td><td><b>${esc(r.name)}</b>${r.note ? ` <span class="mu">${esc(r.note)}</span>` : ""}</td><td class="n">${r.ele != null ? esc(r.ele) + " m" : ""}</td><td>${w && w.temp != null ? `${n0(w.temp, 0, L)}° · ${n0(w.wind, 0, L)} km/h · ${esc(w.pp ?? "–")}%` : ""}</td></tr>`;
  }).join("");
  const climbList = (d.climbs || []).length ? `<ul class="cl">${d.climbs.map((c) => `<li>${c.difficulty ? `<span class="d" style="background:${difficultyColor(c.difficulty)}">${esc(c.difficulty)}/10</span>` : ""}<b>${esc(c.name)}</b> <span class="mu">km ${n0(c.km, 0, L)}${c.elevation ? ` · ${esc(c.elevation)} m` : ""}</span></li>`).join("")}</ul>` : `<p class="mu">–</p>`;
  const water = (d.water || []).length ? `${(d.water || []).length} · ${T.gap}: <b>${n0(waterGap(d), 0, L)} km</b>` : esc(T.noWater);
  return `<!doctype html><html lang="${L}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Road book · ${esc(d.title || T.ride)}</title>
<style>
@page { size: A4; margin: 12mm; }
* { box-sizing: border-box; }
body { margin: 0 auto; max-width: 190mm; padding: 16px; font: 11pt/1.4 "Barlow", "Segoe UI", system-ui, sans-serif; color: #0B0F14; background: #fff; }
.top { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 3px solid #0B0F14; padding-bottom: 6px; }
.brand { font: italic 800 15pt "Barlow Condensed", "Arial Narrow", sans-serif; letter-spacing: .02em; }
.brand i { display: inline-block; width: 12px; height: 12px; background: #C8F560; border: 2px solid #0B0F14; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
h1 { font: italic 800 28pt/1 "Barlow Condensed", "Arial Narrow", sans-serif; text-transform: uppercase; margin: 10px 0 2px; }
h2 { font: 800 14pt "Barlow Condensed", "Arial Narrow", sans-serif; text-transform: uppercase; margin: 14px 0 6px; }
.mu { color: #56616D; font-size: 9.5pt; }
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0; }
.stats div { border: 1.5px solid #0B0F14; border-radius: 8px; padding: 6px 10px; }
.stats b { display: block; font: 800 22pt/1 "Barlow Condensed", "Arial Narrow", sans-serif; }
.stats span { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .08em; color: #56616D; }
.fig { display: grid; grid-template-columns: 62mm 1fr; gap: 10px; align-items: start; }
.cl { margin: 0; padding: 0; list-style: none; }
.cl li { padding: 6px 0; border-bottom: 1px solid #E3E7EB; }
.cl li b { font: 800 13pt "Barlow Condensed", "Arial Narrow", sans-serif; text-transform: uppercase; }
.cl .d { display: inline-block; min-width: 34px; text-align: center; margin-right: 6px; padding: 1px 5px; border-radius: 5px; color: #fff; font: 700 9pt "Barlow", sans-serif; }
svg.prof { width: 100%; height: auto; display: block; margin-top: 10px; }
.fig svg { width: 100%; height: auto; display: block; }
.map { border: 1px solid #D5DBE1; border-radius: 8px; background: #F5F7F9; }
.map path { fill: none; stroke-width: 4; stroke-linecap: round; }
.prof text { font: 600 13px "Barlow Condensed", "Arial Narrow", sans-serif; fill: #0B0F14; }
table { width: 100%; border-collapse: collapse; font-size: 10pt; }
th { text-align: left; font: 600 8.5pt "Barlow", sans-serif; text-transform: uppercase; letter-spacing: .06em; color: #56616D; border-bottom: 1.5px solid #0B0F14; padding: 4px 6px; }
td { padding: 4px 6px; border-bottom: 1px solid #E3E7EB; vertical-align: top; }
td.n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
tr.climb td { background: #F4FBE3; } tr.water td { color: #1F5FA8; } tr.start td, tr.end td { font-weight: 600; }
tr { break-inside: avoid; }
footer { margin-top: 12px; padding-top: 6px; border-top: 1px solid #D5DBE1; font-size: 8.5pt; color: #56616D; display: flex; justify-content: space-between; gap: 10px; }
.noprint { position: fixed; right: 16px; bottom: 16px; padding: 12px 18px; border-radius: 24px; border: 0; background: #C8F560; color: #0B0F14; font: 800 13pt "Barlow Condensed", "Arial Narrow", sans-serif; text-transform: uppercase; box-shadow: 0 4px 14px rgba(0,0,0,.25); cursor: pointer; }
@media print { .noprint { display: none; } body { padding: 0; } }
@media (max-width: 600px) { .fig { grid-template-columns: 1fr; } .stats { grid-template-columns: repeat(2, 1fr); } }
</style></head><body>
<div class="top"><span class="brand"><i></i>LocaRide · Road book</span><span class="mu">${esc(d.date || "")}${d.eta ? ` · ${T.depart} ${esc(d.start)}` : ""}</span></div>
<h1>${esc(d.title || T.ride)}</h1>
<div class="stats"><div><b>${n0(d.km, d.km < 100 ? 1 : 0, L)}</b><span>${T.km}</span></div><div><b>${d.gain != null ? "+" + n0(d.gain, 0, L) : "–"}</b><span>${T.m}</span></div><div><b>${hm(d.minutes)}</b><span>${T.time}</span></div><div><b>${sh.hi != null ? n0(sh.hi, 0, L) : "–"}</b><span>${T.top}</span></div></div>
<div class="fig"><svg class="map" viewBox="0 0 300 300" role="img" aria-label="${esc(T.route)}">${route}${pts.length ? `<circle cx="${pts[0][0]}" cy="${pts[0][1]}" r="7" fill="#fff" stroke="#0B0F14" stroke-width="3"/><circle cx="${pts[pts.length - 1][0]}" cy="${pts[pts.length - 1][1]}" r="6" fill="#0B0F14"/>` : ""}</svg>
<div><h2 style="margin-top:0">${T.climbs}</h2>${climbList}</div></div>
<svg class="prof" viewBox="0 0 1000 210" role="img" aria-label="Profilo">${sh.segs.map((s) => `<path d="${s.d}" fill="${s.color}"/>`).join("")}<path d="${sh.line}" fill="none" stroke="#0B0F14" stroke-width="2"/>${marks}<text x="0" y="206">${esc(sh.lo)} m · 0 km</text><text x="1000" y="206" text-anchor="end">${n0(d.km, 0, L)} km</text></svg>
${d.eta && d.wkg ? `<p class="mu">${esc(T.est(n0(d.wkg, 1, L)))}</p>` : ""}
<h2>${T.route}</h2>
<table><thead><tr><th style="text-align:right">km</th><th style="text-align:right">${T.when}</th><th>${T.where}</th><th style="text-align:right">${T.ele}</th><th>${d.weather ? T.wx : ""}</th></tr></thead><tbody>${rows}</tbody></table>
<h2>${T.water}</h2><p>${water}</p>
<footer><span>${esc(T.src)}</span><span>${d.url ? `<b>${esc(d.url.replace(/^https?:\/\//, "").slice(0, 60))}${d.url.length > 68 ? "…" : ""}</b>` : "locaride.app"}</span></footer>
<button class="noprint" type="button" onclick="print()">${T.print}</button>
<script>addEventListener("load", function () { setTimeout(function () { try { print(); } catch (e) {} }, 600); });</script>
</body></html>`;
}

/* ------------------------------------------------------------------ the image (1080 x 1350, dark) */
export function drawCard(ctx, d, fonts = { cond: "'Barlow Condensed', 'Arial Narrow', sans-serif", body: "Barlow, system-ui, sans-serif" }) {
  const T = tx(d), L = d.lang === "en" ? "en" : "it", W = CARD_W, H = CARD_H;
  const BG = "#0B0F14", TXc = "#E8EDF2", MU = "#93A1B0", ACC = "#C8F560", LINE = "#243344";
  const font = (w, px, fam, it = false) => `${it ? "italic " : ""}${w} ${px}px ${fam}`;
  const fit = (s, max, w, px, fam, it) => { let p = px; ctx.font = font(w, p, fam, it); while (ctx.measureText(s).width > max && p > 28) { p -= 2; ctx.font = font(w, p, fam, it); } return p; };
  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
  // header
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = ACC; ctx.fillRect(72, 58, 26, 26);
  ctx.fillStyle = TXc; ctx.font = font(800, 40, fonts.cond, true); ctx.textAlign = "left"; ctx.fillText("LOCARIDE", 112, 84);
  ctx.fillStyle = MU; ctx.font = font(500, 30, fonts.body); ctx.textAlign = "right"; ctx.fillText(d.date || "", W - 72, 84);
  const title = String(d.title || T.ride).toUpperCase();
  ctx.fillStyle = TXc; ctx.textAlign = "left"; fit(title, W - 144, 800, 84, fonts.cond, true); ctx.fillText(title, 72, 178);
  // route, coloured by gradient, on a dark outline
  const bx = 90, by = 220, bw = W - 180, bh = 600, pts = routeShape(d.side.track, bw, bh, 20).map((p) => [p[0] + bx, p[1] + by]), gr = sampleGrades(d.side);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  if (pts.length > 1) {
    ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = 24; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
    ctx.lineWidth = 12;
    for (let i = 1; i < pts.length; i++) { ctx.strokeStyle = gradeColor(gr[i]); ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); }
    const a = pts[0], z = pts[pts.length - 1];
    ctx.fillStyle = BG; ctx.strokeStyle = TXc; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(a[0], a[1], 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (Math.hypot(a[0] - z[0], a[1] - z[1]) > 30) { ctx.fillStyle = ACC; ctx.strokeStyle = BG; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(z[0], z[1], 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  }
  // numbers
  const sh = smoothProfile(d.side, W - 144, 170, 6);
  const stats = [[n0(d.km, d.km < 100 ? 1 : 0, L), T.km], [d.gain != null ? "+" + n0(d.gain, 0, L) : "–", T.m], [hm(d.minutes), T.time], [sh.hi != null ? n0(sh.hi, 0, L) : "–", T.top]];
  ctx.strokeStyle = LINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(72, 862); ctx.lineTo(W - 72, 862); ctx.stroke();
  const cw = (W - 144) / 4;
  stats.forEach(([v, l], i) => {
    const x = 72 + i * cw;
    ctx.textAlign = "left"; ctx.fillStyle = i === 1 ? ACC : TXc; fit(v, cw - 16, 800, 92, fonts.cond); ctx.fillText(v, x, 958);
    ctx.fillStyle = MU; ctx.font = font(600, 24, fonts.body); ctx.fillText(l.toUpperCase(), x, 996);
  });
  // profile
  ctx.save(); ctx.translate(72, 1040);
  if (typeof Path2D === "function") {
    for (const s of sh.segs) { ctx.fillStyle = s.color; ctx.fill(new Path2D(s.d)); }
    ctx.strokeStyle = TXc; ctx.lineWidth = 3; ctx.stroke(new Path2D(sh.line));
  }
  ctx.restore();
  // climbs + footer
  const cl = (d.climbs || []).map((c) => c.name).filter(Boolean);
  if (cl.length) {
    ctx.textAlign = "left"; ctx.fillStyle = TXc; ctx.font = font(600, 30, fonts.body);
    let s = T.climbs.toUpperCase() + "  ", shown = 0;
    for (const c of cl) { const nx = s + (shown ? " · " : "") + c; if (ctx.measureText(nx + " +9").width > W - 144) break; s = nx; shown++; }
    if (shown < cl.length) s += "  +" + (cl.length - shown);
    ctx.fillText(s, 72, 1262);
  }
  ctx.fillStyle = MU; ctx.font = font(500, 22, fonts.body); ctx.textAlign = "left"; ctx.fillText("© OpenStreetMap", 72, 1306);
  ctx.fillStyle = ACC; ctx.font = font(800, 34, fonts.cond, true); ctx.textAlign = "right"; ctx.fillText("locaride.app", W - 72, 1308);
}
