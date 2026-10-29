/*
 * LocaRide v2 - app shell: map (MapLibre, dark basemap, hillshade + 3D terrain), climbs in view,
 * road book, "Oggi si sale", diary, ride mode. Hash routes: #/  #/s/<id>  #/oggi  #/diario
 * Data: the classic app's files (lib/data.mjs). Pure logic lives in lib/*.mjs (tested).
 */
import { loadIndex, search, inBounds, nearby, getClimb, geojson, cleanLabel } from "./lib/data.mjs";
import { GRADE_STOPS, gradeColor, difficultyColor, num, kmTable, hardestKm, profileShapes, trackWithEle, gpx, positionOnClimb, sideStats, eleAt, hairpins, climbMinutes, clock, traffic, TRUCKS, alongTrack } from "./lib/climb.mjs";
import { poisNear } from "./lib/poi.mjs";
import { dayVerdict, advice, fetchForecast, fetchDaily } from "./lib/weather.mjs";
import { currentUser, signIn, loadClimbs, diaryStats, bestOf, dur, loadRatings, signInEmail, signUpEmail, resetPassword, authError, submitVote, myVote, recentComments, sendReport, REV_MAX } from "./lib/diary.mjs";

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const panel = $("#panel");
const DESKTOP = () => matchMedia("(min-width: 900px)").matches;
const S = { filter: "all", sel: null, side: 0, day: 0, three: false, ride: null, oggi: null };

/* ------------------------------------------------------------------ map */
const TERRAIN = { type: "raster-dem", tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"], encoding: "terrarium", tileSize: 256, maxzoom: 14, attribution: "Rilievo: Mapzen / AWS Terrain Tiles" };
const map = new maplibregl.Map({
  container: "map", style: "https://tiles.openfreemap.org/styles/dark",
  center: [10.6, 45.6], zoom: 6.4, maxPitch: 75, attributionControl: { compact: true }, hash: false
});
/* our own control stack (zoom, north, 3D, locate) - MapLibre's NavigationControl overlapped it */
document.getElementById("bzin").addEventListener("click", () => map.zoomIn());
document.getElementById("bzout").addEventListener("click", () => map.zoomOut());
const bnorth = document.getElementById("bnorth");
bnorth.addEventListener("click", () => map.easeTo({ bearing: 0, pitch: S.three ? 58 : 0, duration: 600 }));
map.on("rotate", () => { bnorth.firstElementChild.style.transform = `rotate(${-map.getBearing()}deg)`; });
/* basemap unreachable (offline, blocked network): the app must still work - plain dark ground */
let mapLoaded = false;
map.once("load", () => { mapLoaded = true; });
setTimeout(() => {
  if (mapLoaded) return;
  map.setStyle({ version: 8, glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf", sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#0B0F14" } }] });
}, 8000);

const DIFF_COLOR = ["step", ["get", "d"], "#5B8DEF", 4, "#F2C14E", 6, "#F28C38", 8, "#E5484D", 10, "#C04BD6"];
function tuneBasemap() {
  // darker, cooler basemap so the climbs glow (layer ids differ between styles: match loosely)
  for (const l of map.getStyle().layers) {
    try {
      if (l.type === "background") map.setPaintProperty(l.id, "background-color", "#0B0F14");
      else if (/water/.test(l.id) && l.type === "fill") map.setPaintProperty(l.id, "fill-color", "#0A1724");
      else if (/landcover|landuse|park|wood/.test(l.id) && l.type === "fill") map.setPaintProperty(l.id, "fill-opacity", 0.35);
    } catch { /* not every layer takes every property */ }
  }
}
function firstSymbolId() { const l = map.getStyle().layers.find((x) => x.type === "symbol"); return l && l.id; }

map.on("load", async () => {
  tuneBasemap();
  map.addSource("dem", TERRAIN);
  map.addLayer({ id: "hillshade", type: "hillshade", source: "dem", paint: { "hillshade-shadow-color": "#05080C", "hillshade-highlight-color": "#3A4D63", "hillshade-accent-color": "#1A2531", "hillshade-exaggeration": 0.55 } }, firstSymbolId());
  const st = await loadIndex();
  const gj = geojson(st.climbs);
  gj.features.forEach((f) => { f.properties.disc = /^osm-rt/.test(f.properties.id) ? 1 : 0; });
  map.addSource("climbs", { type: "geojson", data: gj });
  map.addSource("sel", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({ id: "sel-glow", type: "line", source: "sel", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "c"], "line-width": ["case", ["==", ["get", "sel"], 1], 14, 8], "line-opacity": ["case", ["==", ["get", "sel"], 1], 0.28, 0.08], "line-blur": 4 } });
  map.addLayer({ id: "sel-line", type: "line", source: "sel", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "c"], "line-width": ["case", ["==", ["get", "sel"], 1], 4.5, 2.5], "line-opacity": ["case", ["==", ["get", "sel"], 1], 1, 0.45] } });
  map.addLayer({ id: "c-glow", type: "circle", source: "climbs", paint: { "circle-color": DIFF_COLOR, "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 4, 9, 9, 13, 16], "circle-opacity": 0.22, "circle-blur": 0.8 } });
  map.addLayer({ id: "c-dot", type: "circle", source: "climbs", paint: { "circle-color": DIFF_COLOR, "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 1.6, 9, 4, 13, 7], "circle-stroke-color": "#0B0F14", "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 5, 0, 9, 1.2] } });
  map.addLayer({ id: "c-lab", type: "symbol", source: "climbs", minzoom: 9.5, layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 12, "text-offset": [0, 1.1], "text-anchor": "top", "text-optional": true, "symbol-sort-key": ["-", 0, ["get", "d"]] }, paint: { "text-color": "#E8EDF2", "text-halo-color": "#0B0F14", "text-halo-width": 1.4 } });
  for (const id of ["c-dot", "c-glow"]) {
    map.on("click", id, (e) => { const f = e.features && e.features[0]; if (f) location.hash = "#/s/" + encodeURIComponent(f.properties.id); });
    map.on("mouseenter", id, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; });
  }
  applyFilter();
  route();
});
map.on("moveend", () => { if (panel.dataset.mode === "list") renderList(); });

function applyFilter() {
  const f = S.filter === "hard" ? [">=", ["get", "d"], 8] : S.filter === "top" ? [">=", ["get", "d"], 10] : S.filter === "new" ? ["==", ["get", "disc"], 1] : null;
  for (const id of ["c-dot", "c-glow", "c-lab"]) if (map.getLayer(id)) map.setFilter(id, f);
}
function passesFilter(c) {
  const d = c.difficulty || 0;
  return S.filter === "hard" ? d >= 8 : S.filter === "top" ? d >= 10 : S.filter === "new" ? /^osm-rt/.test(c.id) : true;
}
document.querySelectorAll(".chips button").forEach((b) => b.addEventListener("click", () => {
  S.filter = b.dataset.filter;
  document.querySelectorAll(".chips button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  applyFilter(); if (panel.dataset.mode === "list") renderList();
}));

$("#b3d").addEventListener("click", (e) => set3d(!S.three, e.currentTarget));
function set3d(on, btn = $("#b3d")) {
  S.three = on; btn.setAttribute("aria-pressed", String(on));
  if (!map.getSource("dem")) return;
  map.setTerrain(on ? { source: "dem", exaggeration: 1.35 } : null);
  map.easeTo({ pitch: on ? 58 : 0, duration: 900 });
}
$("#bloc").addEventListener("click", () => {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition((p) => map.flyTo({ center: [p.coords.longitude, p.coords.latitude], zoom: 10 }), () => {}, { enableHighAccuracy: false, timeout: 8000 });
});

/* ------------------------------------------------------------------ search */
const q = $("#q"), results = $("#results");
q.addEventListener("input", () => {
  const r = search(q.value);
  results.hidden = !r.length;
  results.innerHTML = r.map((c) => `<li><button type="button" data-id="${esc(c.id)}"><span>${esc(c.name)}</span><small>${c.elevation ? esc(c.elevation) + " m" : ""}</small></button></li>`).join("");
});
results.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-id]"); if (!b) return;
  results.hidden = true; q.value = ""; q.blur();
  location.hash = "#/s/" + encodeURIComponent(b.dataset.id);
});
$(".search").addEventListener("submit", (e) => { e.preventDefault(); const b = results.querySelector("button"); if (b) b.click(); });

/* ------------------------------------------------------------------ router */
window.addEventListener("hashchange", route);
function route() {
  const h = location.hash || "#/";
  document.querySelectorAll(".tabs a").forEach((a) => a.removeAttribute("aria-current"));
  const tab = h.startsWith("#/oggi") ? "oggi" : h.startsWith("#/diario") ? "diario" : "map";
  const t = document.querySelector(`.tabs a[data-tab="${tab}"]`); if (t) t.setAttribute("aria-current", "page");
  if (h.startsWith("#/s/")) return openClimb(decodeURIComponent(h.slice(4)));
  clearSel();
  if (tab === "oggi") return renderOggi();
  if (tab === "diario") return renderDiario();
  renderList();
}

function setMode(m) { panel.dataset.mode = m; panel.scrollTop = 0; }

/* ------------------------------------------------------------------ climbs in view */
function renderList() {
  setMode("list");
  const b = map.getBounds(), r = inBounds({ s: b.getSouth(), n: b.getNorth(), w: b.getWest(), e: b.getEast() }, 400);
  const list = (r.list || []).filter(passesFilter).slice(0, 30);
  const total = r.total || 0;
  panel.innerHTML = `<div class="handle"></div>
    <div class="ph"><h2>${total ? esc(total.toLocaleString("it-IT")) + " salite qui" : "Nessuna salita qui"}</h2><small>${list.length ? "le più dure" : "sposta o allarga la mappa"}</small></div>
    ${list.length ? `<div class="cards">${list.map(card).join("")}</div>` : `<p class="empty">Zoom indietro o cambia filtro.</p>`}`;
}
function card(c) {
  const d = c.difficulty || 0;
  return `<a class="card" href="#/s/${esc(encodeURIComponent(c.id))}" style="text-decoration:none;color:inherit">
    <span class="badge" style="background:${difficultyColor(d)}">${d ? d + "/10" : "–"}</span>
    <span class="nm">${esc(c.name)}</span>
    <span class="mt">${c.elevation ? esc(c.elevation) + " m" : ""}${c.cat ? " · cat. " + esc(c.cat) : ""}</span></a>`;
}

/* ------------------------------------------------------------------ climb */
async function openClimb(id) {
  setMode("climb");
  panel.innerHTML = `<div class="loading">Carico la salita…</div>`;
  let c;
  try { await loadIndex(); c = await getClimb(id); } catch { c = null; }
  if (!c) { panel.innerHTML = `<div class="loading">Salita non trovata. <a href="#/">Torna alla mappa</a></div>`; return; }
  if (S.sel !== c) { S.sel = c; S.side = 0; }
  renderClimb();
  loadVerdict(c);
}

function renderClimb() {
  const c = S.sel, vs = (c.versanti || []).filter((v) => v.distance_km > 0);
  const v = vs[S.side] || vs[0];
  const d = c.difficulty || 0;
  const top = esc(c.name);
  if (!v) {
    panel.innerHTML = `<div class="cl"><div class="cl-top"><a class="ib" href="#/" aria-label="Torna alla mappa">${ICON.back}</a></div><h1>${top}</h1><p class="sub">${c.elevation ? esc(c.elevation) + " m" : ""}</p><p class="note">Di questa salita non abbiamo ancora i versanti.</p></div>`;
    flyToClimb(c, null); return;
  }
  const st = sideStats(v), rows = kmTable(v), hard = hardestKm(rows), sh = profileShapes(v, 680, 220, 10);
  const maxG = Math.max(12, ...rows.map((r) => r.g));
  panel.innerHTML = `<div class="cl">
    <div class="cl-top"><a class="ib" href="#/" aria-label="Torna alla mappa">${ICON.back}</a>
      <div style="display:flex;gap:8px"><button type="button" class="ib" id="share" aria-label="Condividi">${ICON.share}</button></div></div>
    <div class="ov">${d ? "Difficoltà " + d + "/10" : "Salita"}${c.cat ? " · cat. " + esc(c.cat) : ""}${c.status === "seasonal" ? " · stagionale" : ""}</div>
    <h1>${top}</h1>
    <p class="sub">${esc(v.side || "")}${st.start != null ? " · " + esc(st.start) + " → " + esc(st.top) + " m" : ""}</p>
    ${vs.length > 1 ? `<div class="sides" role="group" aria-label="Versante">${vs.map((x, i) => `<button type="button" data-side="${i}" aria-pressed="${i === (vs.indexOf(v))}">${esc(x.side || "Versante " + (i + 1))}</button>`).join("")}</div>` : ""}
    <div class="strip">
      <div><b>${num(st.km)}</b><span>km</span></div>
      <div><b>${num(st.avg)}%</b><span>media</span></div>
      <div><b>+${esc(st.gain)}</b><span>metri</span></div>
      <div class="mx"><b>${num(st.max)}%</b><span>max</span></div>
    </div>
    <div class="verdict" id="verdict"><div class="k">IL VERDETTO DI OGGI</div><p>Carico il meteo in quota…</p></div>
    <figure class="prof">
      <svg viewBox="0 0 680 220" role="img" aria-label="Profilo altimetrico ${top}">${sh.segs.map((s) => `<path d="${s.d}" fill="${s.color}"/>`).join("")}<path d="${sh.line}" fill="none" stroke="#E8EDF2" stroke-width="2"/></svg>
      <figcaption><span>${esc(sh.lo)} m · 0 km</span><span>${num(st.km)} km · ${esc(sh.hi)} m</span></figcaption>
      <div class="gleg">${GRADE_STOPS.map((g) => `<span style="--c:${g.color}">${esc(g.label)}</span>`).join("")}</div>
    </figure>
    <table class="rb"><caption>Road book</caption>
      <thead><tr><th scope="col">KM</th><th scope="col">PENDENZA</th><th scope="col" style="text-align:right">QUOTA</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr class="${i === hard ? "hard" : ""}"><td>${num(r.k, r.k % 1 ? 1 : 0)}</td><td><div class="bar"><i style="width:${Math.max(4, Math.min(70, r.g / maxG * 70)).toFixed(0)}%;background:${gradeColor(r.g)}"></i><b>${num(r.g)}%</b></div></td><td>${esc(r.e)}</td></tr>`).join("")}
      <tr class="summit"><td>⛰</td><td>${top}</td><td>${esc(st.top ?? c.elevation)}</td></tr></tbody></table>
    ${timesHtml(c, vs)}
    <section class="sec" id="water"><h3>Acqua e ristori sulla salita</h3><p class="note">Cerco fontane e bar lungo la strada…</p></section>
    ${vs.length > 1 ? compareHtml(c, vs) : ""}
    <section class="sec" id="week"><h3>Meteo 7 giorni in cima</h3><p class="note">Carico…</p></section>
    <div class="facts">
      ${v.exposure ? `<div><span>Esposizione</span><b>${esc(v.exposure)}</b></div>` : ""}
      ${c.surfaceLabel ? `<div><span>Fondo</span><b>${esc(cleanLabel(c.surfaceLabel))}</b></div>` : ""}
      ${trafficFacts(v, c)}
      ${hard >= 0 ? `<div><span>Km più duro</span><b>${num(rows[hard].g)}% al km ${num(rows[hard].k, rows[hard].k % 1 ? 1 : 0)}</b></div>` : ""}
    </div>
    ${c.description || (c.tips && c.tips.length) ? `<section class="sec"><h3>Da sapere</h3>${c.description ? `<p class="note">${esc(c.description)}</p>` : ""}${c.tips && c.tips.length ? `<ul class="tips">${c.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}</section>` : ""}
    ${bikeDayHtml(c)}
    <section class="sec" id="news" hidden></section>
    <section class="sec" id="rating"><h3>Valutazioni della community</h3><p class="note">Carico…</p></section>
    ${stravaHtml(c)}
    <div class="actions"><button type="button" class="btn pri" id="rideBtn">Avvia modalità salita</button><button type="button" class="btn" id="gpxBtn">GPX</button></div>
  </div>`;
  panel.querySelectorAll("[data-side]").forEach((b) => b.addEventListener("click", () => { S.side = +b.dataset.side; renderClimb(); if (S.verdict) paintVerdict(S.verdict); }));
  $("#gpxBtn").addEventListener("click", () => downloadGpx(c, v));
  $("#rideBtn").addEventListener("click", () => startRide(c, v));
  $("#share").addEventListener("click", () => share(c));
  if (S.verdict && S.verdict.id === c.id) paintVerdict(S.verdict);
  wireTimes(c, vs);
  fillWater(c, v); fillWeek(c); fillRating(c); fillNews(c);
  flyToClimb(c, v);
}

/* ------------------------------------------------------------------ climb sections (parity with v1) */
const WKG_KEY = "lr_wkg";                     // same key as the classic app: one setting for both
function myWkg() { try { const x = parseFloat(localStorage.getItem(WKG_KEY)); return x > 0.5 && x < 9 ? x : null; } catch { return null; } }
function timesHtml(c, vs) {
  const cols = vs.slice(0, 3), my = myWkg();
  const rows = [2, 3, 4, 5].map((w) => `<tr><td>${w} W/kg</td>${cols.map((v) => `<td>${esc(clock(climbMinutes(v, w)))}</td>`).join("")}</tr>`).join("");
  return `<section class="sec"><h3>Tornanti e tempi di salita</h3>
    <table class="vt"><thead><tr><th></th>${cols.map((v) => `<th>${esc(v.side || "")}</th>`).join("")}</tr></thead><tbody>
      <tr><td>Tornanti</td>${cols.map((v) => `<td>${v.track && v.track.length > 2 ? "≈" + hairpins(v.track) : "–"}</td>`).join("")}</tr>
      ${rows}
      <tr class="me"><td>Tu <input id="wkg" type="number" inputmode="decimal" step="0.1" min="1" max="8" value="${my ?? ""}" placeholder="3,0" aria-label="I tuoi W/kg"></td>${cols.map((v) => `<td data-my>${my ? esc(clock(climbMinutes(v, my))) : "–"}</td>`).join("")}</tr>
    </tbody></table>
    <p class="note small">Stima: VAM da W/kg (formula di Ferrari) e velocità tratto per tratto sul profilo. Vento, peso e stanchezza non contano.</p></section>`;
}
function wireTimes(c, vs) {
  const inp = $("#wkg"); if (!inp) return;
  inp.addEventListener("input", () => {
    const w = parseFloat(String(inp.value).replace(",", "."));
    if (w > 0.5 && w < 9) { try { localStorage.setItem(WKG_KEY, String(w)); } catch { /* private mode */ } }
    panel.querySelectorAll("td[data-my]").forEach((td, i) => { td.textContent = w > 0.5 && w < 9 ? clock(climbMinutes(vs[i], w)) : "–"; });
  });
}
function compareHtml(c, vs) {
  const cols = vs.slice(0, 3), row = (l, f) => `<tr><td>${l}</td>${cols.map((v) => `<td>${f(v)}</td>`).join("")}</tr>`;
  return `<section class="sec"><h3>Versanti a confronto</h3><table class="vt"><thead><tr><th></th>${cols.map((v) => `<th>${esc(v.side || "")}</th>`).join("")}</tr></thead><tbody>
    ${row("Distanza", (v) => num(v.distance_km) + " km")}
    ${row("Dislivello", (v) => esc(Math.round((v.endElevation ?? 0) - (v.startElevation ?? 0))) + " m")}
    ${row("Media", (v) => num(v.avgGradient) + "%")}
    ${row("Max", (v) => num(v.maxGradient) + "%")}
    ${row("Esposizione", (v) => esc(v.exposure || "–"))}
  </tbody></table></section>`;
}
function trafficFacts(v, c) {
  const t = traffic(v, c);
  if (!t) return "";
  return `<div><span>Traffico feriale / weekend</span><b>${esc(t.fer)} / ${esc(t.wkd)} su 10</b></div><div><span>Camion</span><b>${esc(TRUCKS[t.trucks] || TRUCKS.rari)}</b></div>`;
}
function bikeDayHtml(c) {
  const ev = (globalThis.BIKE_EVENTS || []).filter((e) => (e.passes || []).includes(c.id) && new Date(e.date) >= new Date(new Date().toDateString())).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
  if (!ev.length) return "";
  return `<section class="sec"><h3>Bike Day: strada solo per bici</h3><ul class="tips">${ev.map((e) => `<li><b>${esc(new Date(e.date).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "long" }))}</b> · ${esc(e.name)} · ${esc(e.hours || "")}${e.url ? ` · <a href="${esc(e.url)}" target="_blank" rel="noopener">sito</a>` : ""}</li>`).join("")}</ul></section>`;
}
/* known Strava segments per curated pass (same table as the classic app, js/state.js). Strava
   closed its public segment explorer page, so the old "Cerca segmenti" link is gone: segment search
   comes back with the Strava connection. */
const STRAVA_SEGMENTS = { stelvio: { "Prato allo Stelvio": 614103, "Bormio": 614115 }, gavia: { "Ponte di Legno": 1084024 }, mortirolo: { "Mazzo di Valtellina": 617404 }, zoncolan: { "Ovaro": 1253584 } };
function stravaHtml(c) {
  const seg = STRAVA_SEGMENTS[c.id];
  if (!seg) return "";
  return `<section class="sec"><h3>Segmenti Strava</h3><div class="links">${Object.entries(seg).map(([side, id]) => `<a class="chip" href="https://www.strava.com/segments/${esc(id)}" target="_blank" rel="noopener">${esc(side)} ↗</a>`).join("")}</div></section>`;
}
async function fillWater(c, v) {
  const el = $("#water"); if (!el) return;
  let r;
  try { r = await poisNear(v.track || []); } catch { r = null; }
  if (S.sel !== c || !$("#water")) return;
  if (!r || (!r.covered && !r.points.length)) { el.innerHTML = `<h3>Acqua e ristori sulla salita</h3><p class="note">Dati non ancora disponibili in questa zona.</p>`; return; }
  const water = alongTrack(v, r.points.filter((p) => p.kind === "water"), 100);
  const foodAll = alongTrack(v, r.points.filter((p) => p.kind === "food"), 150);
  const town = Math.min(2, 0.15 * (+v.distance_km || 0));   // the start town has bars anyway: counted apart
  const atStart = foodAll.filter((x) => x.km < town).length, food = foodAll.filter((x) => x.km >= town);
  const li = (x) => `<li><b>km ${num(x.km)}</b> · ${esc(x.p.name || x.p.label)}${x.p.name ? ` <span class="mu">${esc(x.p.label)}</span>` : ""} <span class="mu">· ${esc(x.m)} m dalla strada</span></li>`;
  el.innerHTML = `<h3>Acqua e ristori sulla salita</h3>
    <p class="note">${water.length ? `<b>${water.length}</b> punti acqua entro 100 m` : "Nessun punto acqua mappato entro 100 m: parti con le borracce piene."}${food.length ? ` · <b>${food.length}</b> bar o ristori lungo la salita` : " · nessun bar lungo la salita"}${atStart ? ` (più ${atStart} in partenza)` : ""}</p>
    ${water.length ? `<ul class="tips water">${water.slice(0, 12).map(li).join("")}</ul>` : ""}
    ${food.length ? `<ul class="tips food">${food.slice(0, 8).map(li).join("")}</ul>` : ""}`;
}
async function fillWeek(c) {
  const el = $("#week"); if (!el) return;
  let rows;
  try { rows = await fetchDaily({ lat: c.lat, lon: c.lon, ele: c.elevation }); } catch { rows = null; }
  if (S.sel !== c || !$("#week")) return;
  if (!rows || !rows.length) { el.innerHTML = `<h3>Meteo 7 giorni in cima</h3><p class="note">Meteo non disponibile ora.</p>`; return; }
  el.innerHTML = `<h3>Meteo 7 giorni in cima</h3><div class="week">${rows.map((d) => `<div class="day ${d.pp >= 50 ? "wet" : ""}"><span class="dn">${esc(new Date(d.date + "T12:00:00").toLocaleDateString("it-IT", { weekday: "short", day: "numeric" }))}</span><span class="wl">${esc(d.label)}</span><b>${num(d.tmax, 0)}°</b><span class="mu">${num(d.tmin, 0)}°</span><span class="pp">${esc(d.pp ?? "–")}%</span><span class="mu">${num(d.wind, 0)} km/h</span></div>`).join("")}</div>`;
}
const AXES = [["e", "Emozione"], ["p", "Paesaggio"], ["t", "Traffico"], ["a", "Asfalto"]];
async function fillRating(c) {
  const el = $("#rating"); if (!el) return;
  await new Promise((r) => (document.readyState === "complete" ? r() : addEventListener("load", r, { once: true })));
  let s = null, u = null, mine = null, comments = [];
  try { [s, u] = await Promise.all([loadRatings(c.id), currentUser()]); } catch { s = null; }
  if (u) { try { mine = await myVote(c.id, u); } catch { mine = null; } }
  try { comments = await recentComments(c.id, 5); } catch { comments = []; }
  if (S.sel !== c || !$("#rating")) return;
  if (!s) { el.innerHTML = `<h3>Valutazioni della community</h3><p class="note">Non disponibili ora.</p>`; return; }
  const canVote = u && (u.emailVerified || (u.providerData || []).some((x) => x.providerId === "google.com"));
  const sel = (k, l) => `<div class="vote"><span>${l}</span><div role="radiogroup" aria-label="${l}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" data-ax="${k}" data-n="${n}" aria-checked="${mine && mine[k] === n}">${n}</button>`).join("")}</div></div>`;
  el.innerHTML = `<h3>Valutazioni della community</h3>
    ${s.n ? `<p class="note"><b class="big">${num(s.overall)}</b> /5 · ${esc(s.n)} ${s.n === 1 ? "voto" : "voti"}</p><div class="axes">${s.axes.map(([l, x]) => `<div><span>${esc(l)}</span><i><u style="width:${(x / 5 * 100).toFixed(0)}%"></u></i><b>${num(x)}</b></div>`).join("")}</div>` : `<p class="note">Ancora nessun voto: il primo è tuo.</p>`}
    ${comments.length ? `<ul class="comments">${comments.map((v) => `<li><b>${esc(v.by || "Ciclista")}</b> <span class="mu">· ${esc(new Date(v.ts).toLocaleDateString("it-IT"))}</span><br>${esc(String(v.txt).slice(0, REV_MAX))}</li>`).join("")}</ul>` : ""}
    ${canVote ? `<form class="voteform" id="voteForm"><div class="k">${mine ? "Il tuo voto (puoi cambiarlo)" : "Il tuo voto"}</div>${AXES.map(([k, l]) => sel(k, l)).join("")}
        <label class="sr" for="vtxt">Commento</label><textarea id="vtxt" maxlength="${REV_MAX}" rows="2" placeholder="Com'è andata, in due righe (facoltativo)">${esc(mine && mine.txt || "")}</textarea>
        <button type="submit" class="btn pri">Invia voto</button><p class="note small" id="vmsg"></p></form>`
      : `<button type="button" class="btn" id="voteLogin">${u ? "Conferma la tua email per votare" : "Accedi per votare"}</button>`}
    <button type="button" class="linkbtn" id="reportBtn">Segnala un errore su questa salita</button>`;
  const vals = mine ? { e: mine.e, p: mine.p, t: mine.t, a: mine.a } : {};
  el.querySelectorAll("[data-ax]").forEach((b) => b.addEventListener("click", () => {
    vals[b.dataset.ax] = +b.dataset.n;
    el.querySelectorAll(`[data-ax="${b.dataset.ax}"]`).forEach((x) => x.setAttribute("aria-checked", String(x === b)));
  }));
  const vf = $("#voteForm");
  if (vf) vf.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#vmsg");
    if (AXES.some(([k]) => !(vals[k] >= 1))) { msg.textContent = "Dai un voto da 1 a 5 a tutte e quattro le voci."; return; }
    try { await submitVote(c.id, c.name, { ...vals, txt: $("#vtxt").value }, u); msg.textContent = "Grazie, voto salvato."; fillRating(c); }
    catch (err) { msg.textContent = "Voto non salvato: " + (err && err.message ? err.message : err); }
  });
  const vl = $("#voteLogin"); if (vl) vl.addEventListener("click", () => openAccount(() => fillRating(c)));
  $("#reportBtn").addEventListener("click", () => openReport(c));
}

/* ------------------------------------------------------------------ dialogs: account, report */
const dlg = $("#dlg");
function openDialog(html) { dlg.innerHTML = html; if (!dlg.open) dlg.showModal(); return dlg; }
function closeDialog() { if (dlg.open) dlg.close(); }
dlg.addEventListener("click", (e) => { if (e.target === dlg || e.target.closest("[data-close]")) closeDialog(); });

function openAccount(onDone, mode = "in") {
  const title = mode === "up" ? "Crea un account" : mode === "reset" ? "Password dimenticata" : "Accedi";
  openDialog(`<form class="dform" id="acct">
    <div class="dh"><h2>${title}</h2><button type="button" class="ib" data-close aria-label="Chiudi">${ICON.close}</button></div>
    ${mode === "in" ? `<button type="button" class="btn pri" id="gIn" style="width:100%">Accedi con Google</button><p class="or">oppure con la tua email</p>` : ""}
    ${mode === "up" ? `<label>Nome (si vede accanto ai tuoi voti)<input id="aName" autocomplete="nickname" maxlength="40"></label>` : ""}
    <label>Email<input id="aEmail" type="email" autocomplete="email" required></label>
    ${mode !== "reset" ? `<label>Password<input id="aPw" type="password" autocomplete="${mode === "up" ? "new-password" : "current-password"}" minlength="6" required></label>` : ""}
    <button type="submit" class="btn ${mode === "in" ? "" : "pri"}" style="width:100%">${mode === "up" ? "Crea account" : mode === "reset" ? "Mandami il link" : "Accedi con email"}</button>
    <p class="note small" id="aMsg" role="status"></p>
    <p class="note small">${mode === "in" ? `<button type="button" class="linkbtn" data-mode="up">Crea un account</button> · <button type="button" class="linkbtn" data-mode="reset">Password dimenticata?</button>` : `<button type="button" class="linkbtn" data-mode="in">Torna all'accesso</button>`}</p>
  </form>`);
  const msg = $("#aMsg");
  dlg.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => openAccount(onDone, b.dataset.mode)));
  const g = $("#gIn"); if (g) g.addEventListener("click", async () => { try { await signIn(); closeDialog(); onDone && onDone(); } catch (e) { msg.textContent = authError(e); } });
  $("#acct").addEventListener("submit", async (e) => {
    e.preventDefault();
    const em = $("#aEmail").value.trim(), pw = $("#aPw") ? $("#aPw").value : "";
    try {
      if (mode === "reset") { await resetPassword(em); msg.textContent = "Ti abbiamo mandato un link per scegliere una nuova password."; return; }
      if (mode === "up") { await signUpEmail(em, pw, $("#aName").value.trim()); msg.textContent = "Account creato: conferma la mail dal link che ti abbiamo mandato, poi potrai votare."; onDone && onDone(); return; }
      await signInEmail(em, pw); closeDialog(); onDone && onDone();
    } catch (err) { msg.textContent = authError(err); }
  });
}

const REPORT_KINDS = [["tracciato", "Il tracciato è sbagliato"], ["versante", "Manca un versante"], ["strada", "Strada chiusa o rovinata"], ["dati", "Numeri sbagliati (km, quota, pendenza)"], ["altro", "Altro"]];
async function openReport(c) {
  const u = await currentUser();
  if (!u) { openAccount(() => openReport(c)); return; }
  openDialog(`<form class="dform" id="rep">
    <div class="dh"><h2>Segnala un errore</h2><button type="button" class="ib" data-close aria-label="Chiudi">${ICON.close}</button></div>
    <p class="note">${esc(c.name)}${S.sel === c && (c.versanti || [])[S.side] ? " · " + esc(c.versanti[S.side].side || "") : ""}</p>
    <fieldset><legend class="k">Cosa non va</legend>${REPORT_KINDS.map(([k, l], i) => `<label class="radio"><input type="radio" name="kind" value="${k}" ${i === 0 ? "checked" : ""}> ${l}</label>`).join("")}</fieldset>
    <label>Dettagli<textarea id="rTxt" rows="4" maxlength="1000" required placeholder="Es.: da Mazzo la salita parte dal paese e sale diretta, qui passa da Grosio."></textarea></label>
    <button type="submit" class="btn pri" style="width:100%">Invia segnalazione</button><p class="note small" id="rMsg" role="status"></p>
  </form>`);
  $("#rep").addEventListener("submit", async (e) => {
    e.preventDefault();
    const kind = (dlg.querySelector('input[name="kind"]:checked') || {}).value;
    const side = (c.versanti || [])[S.side];
    try { await sendReport(c.id, c.name + (side ? " · " + (side.side || "") : ""), kind, $("#rTxt").value, u); $("#rMsg").textContent = "Grazie: segnalazione inviata, la controlliamo."; setTimeout(closeDialog, 1600); }
    catch (err) { $("#rMsg").textContent = /permission/i.test(String(err && err.code || err && err.message)) ? "Invio non ancora attivo (manca una regola sul server). Riprova tra poco." : "Non inviata: " + (err && err.message ? err.message : err); }
  });
}

let NEWS = null;
async function fillNews(c) {
  if (!NEWS) NEWS = fetch("../data/pass_news.json", { cache: "no-cache" }).then((r) => r.json()).catch(() => ({}));
  const all = await NEWS, items = all[c.id] || all[c.name] || [];
  const el = $("#news"); if (!el || S.sel !== c || !Array.isArray(items) || !items.length) return;
  el.hidden = false;
  el.innerHTML = `<h3>News e stato della strada</h3><ul class="tips">${items.slice(0, 5).map((n) => `<li><b>${esc(n.date || "")}</b> · ${n.url ? `<a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a>` : esc(n.title)}${n.source ? ` <span class="mu">${esc(n.source)}</span>` : ""}</li>`).join("")}</ul>`;
}

/* every side of the climb on the map, coloured by gradient; the selected one bright, the others
   dimmed (the classic app showed all sides too: drawing only one looked like missing sides) */
function sideFeatures(v, sel) {
  const t = trackWithEle(v), L = +v.distance_km || 1, feats = [];
  if (t.length < 2) return feats;
  let cum = 0; const tot = t.reduce((a, q2, i) => i ? a + Math.hypot(q2[0] - t[i - 1][0], (q2[1] - t[i - 1][1]) * Math.cos(q2[0] * Math.PI / 180)) : 0, 0) || 1;
  for (let i = 1; i < t.length; i++) {
    const seg = Math.hypot(t[i][0] - t[i - 1][0], (t[i][1] - t[i - 1][1]) * Math.cos(t[i][0] * Math.PI / 180));
    const a = cum / tot * L, b = (cum + seg) / tot * L; cum += seg;
    const g = b > a ? (eleAt(v, b) - eleAt(v, a)) / ((b - a) * 10) : 0;
    feats.push({ type: "Feature", properties: { c: gradeColor(g), sel: sel ? 1 : 0 }, geometry: { type: "LineString", coordinates: [[t[i - 1][1], t[i - 1][0]], [t[i][1], t[i][0]]] } });
  }
  return feats;
}
function flyToClimb(c, v) {
  const src = map.getSource("sel");
  if (!v || !src) { map.flyTo({ center: [c.lon, c.lat], zoom: 12 }); return; }
  const all = (c.versanti || []).filter((x) => x.track && x.track.length > 1);
  const feats = all.filter((x) => x !== v).flatMap((x) => sideFeatures(x, false)).concat(sideFeatures(v, true));
  src.setData({ type: "FeatureCollection", features: feats });
  const t = v.track || [];
  if (t.length > 1) {
    const pts = all.flatMap((x) => x.track), lons = pts.map((x) => x[1]), lats = pts.map((x) => x[0]);
    const pad = DESKTOP() ? { top: 80, bottom: 60, left: 480, right: 60 } : { top: 120, bottom: Math.round(innerHeight * 0.6), left: 30, right: 30 };
    if (!S.three) set3d(true);
    map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: pad, pitch: 58, bearing: bearingOf(t), duration: 1400, maxZoom: 14 });
  } else map.flyTo({ center: [c.lon, c.lat], zoom: 12 });
}
/* look up the climb: camera from the start towards the summit */
function bearingOf(t) {
  const a = t[0], b = t[t.length - 1], y = Math.sin((b[1] - a[1]) * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180);
  const x = Math.cos(a[0] * Math.PI / 180) * Math.sin(b[0] * Math.PI / 180) - Math.sin(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.cos((b[1] - a[1]) * Math.PI / 180);
  return Math.atan2(y, x) * 180 / Math.PI;
}
function clearSel() { const s = map.getSource && map.getSource("sel"); if (s) s.setData({ type: "FeatureCollection", features: [] }); S.sel = null; }

async function loadVerdict(c) {
  try {
    const [h] = await fetchForecast([{ lat: c.lat, lon: c.lon, ele: c.elevation }], 1);
    S.verdict = { id: c.id, v: dayVerdict(h, 0) };
  } catch { S.verdict = { id: c.id, v: null }; }
  if (S.sel === c) paintVerdict(S.verdict);
}
function paintVerdict(sv) {
  const el = $("#verdict"); if (!el) return;
  const v = sv.v;
  if (!v || !v.cells.length) { el.className = "verdict"; el.innerHTML = `<div class="k">IL VERDETTO DI OGGI</div><p>Meteo non disponibile in questo momento.</p>`; return; }
  const a = advice(v);
  el.className = "verdict " + v.tone;
  el.innerHTML = `<div class="k">IL VERDETTO DI OGGI · IN CIMA</div><div class="h">${esc(a.head)}</div><p>${esc(a.sub)}</p>${hoursHtml(v)}
    <div class="hleg"><span style="--c:var(--acc)">Ideale</span><span style="--c:var(--g1)">Pioggia</span><span style="--c:var(--g4)">Temporali</span><span style="--c:var(--g3)">Vento</span><span style="--c:#7B8794">Freddo</span></div>`;
}
function hoursHtml(v) {
  return `<div class="hours" aria-label="Condizioni ora per ora dalle 7 alle 19">${v.cells.map((x) => `<i class="${x.state}" title="${x.h}:00 · ${num(x.temp, 0)}° · vento ${num(x.wind, 0)} km/h · pioggia ${esc(x.pp ?? "–")}%"></i>`).join("")}</div><div class="hlab"><span>7</span><span>10</span><span>13</span><span>16</span><span>19</span></div>`;
}

function downloadGpx(c, v) {
  const name = c.name + (v.side ? " - " + v.side : "");
  const blob = new Blob([gpx(name, trackWithEle(v))], { type: "application/gpx+xml" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = name.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().replace(/\s+/g, "_") + ".gpx";
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
async function share(c) {
  const url = location.origin + location.pathname + "#/s/" + encodeURIComponent(c.id);
  try { if (navigator.share) await navigator.share({ title: c.name + " · LocaRide", url }); else { await navigator.clipboard.writeText(url); toast("Link copiato"); } } catch { /* cancelled */ }
}
function toast(t) { const d = document.createElement("div"); d.textContent = t; d.style.cssText = "position:fixed;left:50%;top:76px;transform:translateX(-50%);z-index:30;background:#E8EDF2;color:#0B0F14;padding:8px 14px;border-radius:18px;font-weight:600"; document.body.appendChild(d); setTimeout(() => d.remove(), 1600); }

/* ------------------------------------------------------------------ modalità salita */
function startRide(c, v) {
  const box = $("#ride"); box.hidden = false;
  S.ride = { c, v, watch: null, sim: null };
  const paint = (pos, note) => {
    const p = pos ? positionOnClimb(v, pos.lat, pos.lon) : null;
    const on = p && p.offKm < 0.3;
    box.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
        <div><div class="lbl">Modalità salita</div><div style="font-family:var(--cond);font-weight:800;font-size:26px;text-transform:uppercase">${esc(c.name)}</div></div>
        <button type="button" class="ib" id="rideX" aria-label="Chiudi">${ICON.close}</button></div>
      ${on ? `<div><div class="lbl">Alla cima</div><div class="big">${num(p.toGoKm)}<span style="font-size:40px"> km</span></div></div>
      <div class="grid">
        <div class="cell"><div class="lbl">Dislivello che manca</div><b>${esc(p.toGoM)} m</b></div>
        <div class="cell" style="box-shadow:inset 0 -6px 0 ${gradeColor(p.gAhead)}"><div class="lbl">Prossimo km</div><b>${num(p.gAhead)}%</b></div>
        <div class="cell"><div class="lbl">Fatti</div><b>${num(p.km)} km</b></div>
        <div class="cell"><div class="lbl">Cima</div><b>${esc(v.endElevation ?? c.elevation)} m</b></div>
      </div>` : `<p class="msg">${esc(note || (p ? "Non sei su questa salita: sei a " + num(p.offKm, 1) + " km dalla strada." : "Cerco la tua posizione…"))}</p>`}
      <div style="margin-top:auto"><label class="lbl" for="sim">Prova senza GPS: sposta il cursore lungo la salita</label>
      <input id="sim" type="range" min="0" max="1000" value="${S.ride.sim == null ? 0 : S.ride.sim}"></div>`;
    $("#rideX").addEventListener("click", stopRide);
    $("#sim").addEventListener("input", (e) => {
      S.ride.sim = +e.target.value;
      const t = v.track || [], i = Math.round(S.ride.sim / 1000 * (t.length - 1));
      if (t[i]) paint({ lat: t[i][0], lon: t[i][1] });
    });
  };
  paint(null);
  if (navigator.geolocation) {
    S.ride.watch = navigator.geolocation.watchPosition((p) => { if (S.ride && S.ride.sim == null) paint({ lat: p.coords.latitude, lon: p.coords.longitude }); },
      () => paint(null, "Posizione non disponibile: attiva il GPS o usa il cursore qui sotto."), { enableHighAccuracy: true, maximumAge: 5000 });
  }
  try { if (navigator.wakeLock) navigator.wakeLock.request("screen").then((w) => { if (S.ride) S.ride.lock = w; }).catch(() => {}); } catch { /* optional */ }
}
function stopRide() {
  if (S.ride) { if (S.ride.watch != null) navigator.geolocation.clearWatch(S.ride.watch); if (S.ride.lock) S.ride.lock.release().catch(() => {}); }
  S.ride = null; $("#ride").hidden = true;
}

/* ------------------------------------------------------------------ oggi */
async function renderOggi() {
  setMode("oggi");
  const days = ["Oggi", "Domani", "Dopodomani"];
  panel.innerHTML = `<div class="og"><div class="handle"></div><h1>Dove salire ${S.day === 0 ? "oggi" : S.day === 1 ? "domani" : "dopodomani"}</h1>
    <p class="note" id="ogWhere">Le salite più belle vicino a te, ordinate per meteo in cima: temporali, pioggia, vento e freddo.</p>
    <div class="days" role="group" aria-label="Giorno">${days.map((d, i) => `<button type="button" data-day="${i}" aria-pressed="${i === S.day}">${d}</button>`).join("")}</div>
    <div id="ogList" class="loading">Cerco le salite intorno a te…</div></div>`;
  panel.querySelectorAll("[data-day]").forEach((b) => b.addEventListener("click", () => { S.day = +b.dataset.day; if (S.oggi) paintOggi(); else renderOggi(); }));
  await loadIndex();
  const here = await new Promise((res) => {
    const c = map.getCenter(), fallback = { lat: c.lat, lon: c.lng, src: "mappa" };
    if (!navigator.geolocation) return res(fallback);
    navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lon: p.coords.longitude, src: "gps" }), () => res(fallback), { timeout: 6000, maximumAge: 600000 });
  });
  let list = nearby(here.lat, here.lon, 60, 12);
  if (list.length < 4) list = nearby(here.lat, here.lon, 120, 12);
  if (!list.length) { $("#ogList").textContent = "Nessuna salita dura entro 120 km: sposta la mappa su una zona di montagna e riapri Oggi."; return; }
  try {
    const hs = await fetchForecast(list.map((c) => ({ lat: c.lat, lon: c.lon, ele: c.elevation })), 3);
    S.oggi = { here, list, hs };
  } catch { $("#ogList").textContent = "Meteo non disponibile ora. Riprova tra poco."; return; }
  paintOggi();
}
function paintOggi() {
  const { here, list, hs } = S.oggi;
  const rows = list.map((c, i) => ({ c, v: dayVerdict(hs[i] || {}, S.day) })).sort((a, b) => b.v.score - a.v.score || (b.c.difficulty || 0) - (a.c.difficulty || 0));
  const w = $("#ogWhere"); if (w) w.textContent = (here.src === "gps" ? "Entro 60 km da te" : "Intorno al centro della mappa") + ", ordinate per meteo in cima.";
  panel.querySelectorAll("[data-day]").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.day === S.day)));
  const h1 = panel.querySelector("h1"); if (h1) h1.textContent = "Dove salire " + (S.day === 0 ? "oggi" : S.day === 1 ? "domani" : "dopodomani");
  $("#ogList").className = "";
  $("#ogList").innerHTML = rows.map((r, i) => `<a class="row" href="#/s/${esc(encodeURIComponent(r.c.id))}" style="text-decoration:none;color:inherit">
      <span class="n">${String(i + 1).padStart(2, "0")}</span>
      <span class="t">${esc(r.c.name)}<small>${r.c.elevation ? esc(r.c.elevation) + " m · " : ""}difficoltà ${esc(r.c.difficulty || "–")}/10</small></span>
      <span class="pill ${r.v.tone}">${esc(r.v.label)}</span>${r.v.cells.length ? `<div class="hw">${hoursHtml(r.v)}</div>` : ""}</a>`).join("");
}

/* ------------------------------------------------------------------ diario */
async function renderDiario() {
  setMode("diario");
  panel.innerHTML = `<div class="di"><div class="handle"></div><div class="ov">Stagione ${new Date().getFullYear()}</div><h1>Le tue salite</h1><div id="diBody" class="loading">Controllo l'accesso…</div></div>`;
  const body = $("#diBody");
  await new Promise((r) => (document.readyState === "complete" ? r() : addEventListener("load", r, { once: true })));
  const u = await currentUser();
  if (!u) {
    body.className = "";
    body.innerHTML = `<p class="note">Qui compaiono le salite che hai fatto davvero, con i tempi registrati dal tuo dispositivo.</p>
      <div class="actions" style="position:static"><button type="button" class="btn pri" id="login">Accedi</button></div>
      <p class="note">Hai già l'account nell'app classica? È lo stesso: se sei collegato lì, lo sei anche qui.</p>`;
    $("#login").addEventListener("click", () => openAccount(() => renderDiario()));
    return;
  }
  let list = [];
  try { list = await loadClimbs(u.uid); } catch { body.textContent = "Non riesco a leggere le tue salite ora."; return; }
  await loadIndex();
  const s = diaryStats(list);
  list.sort((a, b) => String(b.lastAt || "").localeCompare(String(a.lastAt || "")));
  body.className = "";
  body.innerHTML = `<div class="challenge"><div><b>${s.climbs}</b><span>salite</span></div><div><b>${s.efforts}</b><span>passaggi</span></div><div><b>${s.top && s.top.elevation ? esc(s.top.elevation) : "–"}</b><span>m la più alta</span></div></div>
    ${list.length ? `<div class="stamps">${list.map(stamp).join("")}</div>` : `<p class="note">Ancora nessuna. Carica i tuoi giri: un GPX o FIT, oppure lo zip dell'export completo di Strava o Garmin Connect.</p>`}
    <p class="note" style="margin-top:16px">Per caricare i giri usa per ora l'app classica: menu <b>+</b> → <i>Salite dai tuoi giri (GPX, FIT, zip)</i>. <a href="../">Apri l'app classica</a></p>`;
}
function stamp(d) {
  const meta = loadIndexSync(d.passId), diff = meta ? meta.difficulty || 0 : 0, b = bestOf(d);
  const bg = difficultyColor(diff), dark = diff >= 10;
  return `<a class="stamp" href="#/s/${esc(encodeURIComponent(d.passId))}" style="text-decoration:none;background:${dark ? "#141414" : bg};color:${dark ? "#FFD23F" : "#0B0F14"}">
    <span class="tm" style="color:${dark ? "#E8EDF2" : "inherit"}">${b ? "⏱ " + esc(dur(b.sec)) : esc((d.dates || []).length + "×")}</span>
    <span class="e">${esc(d.elevation || "")}</span>
    <span class="nm" style="color:${dark ? "#E8EDF2" : "inherit"}">${esc(d.name)}</span></a>`;
}
let _idx = null;
function loadIndexSync(id) { if (!_idx) loadIndex().then((s) => { _idx = s; }); return _idx ? _idx.byId.get(String(id)) : null; }
loadIndex().then((s) => { _idx = s; });

/* ------------------------------------------------------------------ icons */
const ICON = {
  back: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>`,
  share: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v13M7 8l5-5 5 5M5 14v6h14v-6"/></svg>`,
  close: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`
};
