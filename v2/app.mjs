/*
 * LocaRide v2 - app shell: map (MapLibre, dark basemap, hillshade + 3D terrain), climbs in view,
 * road book, "Oggi si sale", diary, ride mode. Hash routes: #/  #/s/<id>  #/oggi  #/diario
 * Data: the classic app's files (lib/data.mjs). Pure logic lives in lib/*.mjs (tested).
 */
import { loadIndex, search, inBounds, nearby, getClimb, geojson, cleanLabel } from "./lib/data.mjs";
import { GRADE_STOPS, gradeColor, difficultyColor, num, kmTable, hardestKm, profileShapes, trackWithEle, gpx, positionOnClimb, sideStats, eleAt } from "./lib/climb.mjs";
import { dayVerdict, advice, fetchForecast } from "./lib/weather.mjs";
import { currentUser, signIn, loadClimbs, diaryStats, bestOf, dur } from "./lib/diary.mjs";

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
map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), "bottom-right");
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
  map.addLayer({ id: "sel-glow", type: "line", source: "sel", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "c"], "line-width": 14, "line-opacity": 0.28, "line-blur": 4 } });
  map.addLayer({ id: "sel-line", type: "line", source: "sel", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "c"], "line-width": 4.5 } });
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
    <div class="facts">
      ${v.exposure ? `<div><span>Esposizione</span><b>${esc(v.exposure)}</b></div>` : ""}
      ${c.surfaceLabel ? `<div><span>Fondo</span><b>${esc(cleanLabel(c.surfaceLabel))}</b></div>` : ""}
      ${v.traffic && v.traffic !== "n/d" ? `<div><span>Traffico</span><b>${esc(v.traffic)}</b></div>` : ""}
      ${hard >= 0 ? `<div><span>Km più duro</span><b>${num(rows[hard].g)}% al km ${num(rows[hard].k, rows[hard].k % 1 ? 1 : 0)}</b></div>` : ""}
    </div>
    <div class="actions"><button type="button" class="btn pri" id="rideBtn">Avvia modalità salita</button><button type="button" class="btn" id="gpxBtn">GPX</button></div>
  </div>`;
  panel.querySelectorAll("[data-side]").forEach((b) => b.addEventListener("click", () => { S.side = +b.dataset.side; renderClimb(); if (S.verdict) paintVerdict(S.verdict); }));
  $("#gpxBtn").addEventListener("click", () => downloadGpx(c, v));
  $("#rideBtn").addEventListener("click", () => startRide(c, v));
  $("#share").addEventListener("click", () => share(c));
  if (S.verdict && S.verdict.id === c.id) paintVerdict(S.verdict);
  flyToClimb(c, v);
}

function flyToClimb(c, v) {
  const src = map.getSource("sel");
  if (!v || !src) { map.flyTo({ center: [c.lon, c.lat], zoom: 12 }); return; }
  const t = trackWithEle(v);
  const L = +v.distance_km || 1, feats = [];
  if (t.length > 1) {
    let cum = 0; const tot = t.reduce((a, q2, i) => i ? a + Math.hypot(q2[0] - t[i - 1][0], (q2[1] - t[i - 1][1]) * Math.cos(q2[0] * Math.PI / 180)) : 0, 0) || 1;
    for (let i = 1; i < t.length; i++) {
      const seg = Math.hypot(t[i][0] - t[i - 1][0], (t[i][1] - t[i - 1][1]) * Math.cos(t[i][0] * Math.PI / 180));
      const a = cum / tot * L, b = (cum + seg) / tot * L; cum += seg;
      const g = b > a ? (eleAt(v, b) - eleAt(v, a)) / ((b - a) * 10) : 0;
      feats.push({ type: "Feature", properties: { c: gradeColor(g) }, geometry: { type: "LineString", coordinates: [[t[i - 1][1], t[i - 1][0]], [t[i][1], t[i][0]]] } });
    }
  }
  src.setData({ type: "FeatureCollection", features: feats });
  if (t.length > 1) {
    const lons = t.map((x) => x[1]), lats = t.map((x) => x[0]);
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
      <div class="actions" style="position:static"><button type="button" class="btn pri" id="login">Accedi con Google</button></div>
      <p class="note">Hai già l'account nell'app classica? È lo stesso: se sei collegato lì, lo sei anche qui.</p>`;
    $("#login").addEventListener("click", async () => { try { await signIn(); renderDiario(); } catch (e) { toast("Accesso non riuscito"); } });
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
