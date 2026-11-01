/*
 * LocaRide v2 - app shell: map (MapLibre, dark basemap, hillshade + 3D terrain), climbs in view,
 * road book, "Oggi si sale", profile + diary, ride mode, route builder. Hash routes: #/  #/s/<id>  #/oggi  #/profilo (#/diario)  #/giro
 * Data: the classic app's files (lib/data.mjs). Pure logic lives in lib/*.mjs (tested).
 */
import { loadIndex, search, inBounds, nearby, getClimb, geojson, cleanLabel, isGravel, placeHit, fewTrucks, COUNTRIES } from "./lib/data.mjs?v=26";
import { GRADE_STOPS, gradeColor, difficultyColor, num, kmTable, hardestKm, profileShapes, trackWithEle, gpx, positionOnClimb, implausible, sideStats, eleAt, hairpins, climbMinutes, clock, traffic, TRUCKS, alongTrack } from "./lib/climb.mjs?v=26";
import { poisNear } from "./lib/poi.mjs?v=26";
import { dayVerdict, advice, fetchForecast, fetchDaily, hourState } from "./lib/weather.mjs?v=26";
import { PROFILES, MAX_STOPS, brouterUrl, osrmUrl, parseBrouter, asSide, etaMinutes, climbsOnRoute, routeFeatures, surfaceFeatures, surfaceShares, encodeStops, decodeStops, routeGpx, highestIdx, rideDoc, decodeTrack } from "./lib/route.mjs?v=26";
import { getLang, setLang, startI18n } from "./lib/i18n.mjs?v=26";
import { BASEMAPS, basemap, DEFAULT_MAP, GIRO_MAP, notteRoads, GLYPHS, TRAFFIC_CLASSES, TRAFFIC_SOURCE, trafficLayer } from "./lib/maps.mjs?v=26";
import { currentUser, signIn, loadClimbs, diaryStats, bestOf, dur, loadRatings, signInEmail, signUpEmail, resetPassword, authError, submitVote, myVote, recentComments, sendReport, REV_MAX, saveRoute, listRoutes, deleteRoute, whoAmI, sendProposal, myProposals, withdrawProposal, pendingProposals, reviewProposal, onUser, signOut } from "./lib/diary.mjs?v=26";
import { levelOf, nextLevel, points, facts, proposalProblem, proposalDoc, unflat } from "./lib/propose.mjs?v=26";
import { installMode, shouldNudge, countVisit, snooze, SEEN_DAYS } from "./lib/install.mjs?v=26";
import { CARD_W, CARD_H, drawCard, roadbookHtml } from "./lib/rideout.mjs?v=26";
import { AXIS_W, yTicks, kmAtX, pointAt, kmNear } from "./lib/profile.mjs?v=26";
import { loadShade, shadeFor, shadeWord, shadeTone, shadeCauses } from "./lib/shade.mjs?v=26";

const LANG = getLang(), LOC = LANG === "en" ? "en-GB" : "it-IT";
globalThis.LR_DEC = LANG === "en" ? "." : ",";   // decimal separator for num() (lib/climb.mjs)
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const panel = $("#panel");
const DESKTOP = () => matchMedia("(min-width: 900px)").matches;
const S = { paved: false, trucks: false, cc: "", poi: false, filter: "all", sel: null, side: 0, day: 0, three: false, ride: null, oggi: null };

/* ------------------------------------------------------------------ map */
const TERRAIN = { type: "raster-dem", tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"], encoding: "terrarium", tileSize: 256, maxzoom: 14, attribution: "Rilievo: Mapzen / AWS Terrain Tiles" };
const MAP_KEY = "lr_map";
let mapPref = DEFAULT_MAP; try { mapPref = basemap(localStorage.getItem(MAP_KEY)).id; } catch { /* private mode */ }
let BASE = basemap(mapPref);
const EMPTY = { type: "FeatureCollection", features: [] };
let GJ = null, SEL = EMPTY;                       // our data, re-added after every basemap switch
const map = new maplibregl.Map({
  container: "map", style: BASE.style,
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
  map.setStyle({ version: 8, glyphs: GLYPHS, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#0B0F14" } }] });
}, 8000);

const DIFF_COLOR = ["step", ["get", "d"], "#5B8DEF", 4, "#F2C14E", 6, "#F28C38", 8, "#E5484D", 10, "#C04BD6"];
function tuneBasemap() {
  // "Notte+": the dark style with readable roads (layer ids differ between styles: match loosely)
  if (BASE.id !== "notte") return;
  for (const l of map.getStyle().layers) {
    const paint = notteRoads(l);
    if (paint) for (const [k, v] of Object.entries(paint)) { try { map.setPaintProperty(l.id, k, v); } catch { /* not every layer takes every property */ } }
  }
}
function firstSymbolId() { const l = map.getStyle().layers.find((x) => x.type === "symbol"); return l && l.id; }

/* our sources and layers: added on the first style and again after every basemap switch */
function addOurLayers() {
  if (!map.getSource("dem")) map.addSource("dem", TERRAIN);
  if (BASE.hillshade && !map.getLayer("hillshade")) map.addLayer({ id: "hillshade", type: "hillshade", source: "dem", paint: { "hillshade-shadow-color": "#05080C", "hillshade-highlight-color": "#3A4D63", "hillshade-accent-color": "#1A2531", "hillshade-exaggeration": BASE.id === "notte" ? 0.55 : 0.3 } }, firstSymbolId());
  if (map.getSource("climbs")) return;
  map.addSource("climbs", { type: "geojson", data: GJ || EMPTY });
  map.addSource("sel", { type: "geojson", data: SEL });
  map.addLayer({ id: "sel-glow", type: "line", source: "sel", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "c"], "line-width": ["case", ["==", ["get", "sel"], 1], 14, 8], "line-opacity": ["case", ["==", ["get", "sel"], 1], 0.28, 0.08], "line-blur": 4 } });
  map.addLayer({ id: "sel-line", type: "line", source: "sel", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "c"], "line-width": ["case", ["==", ["get", "sel"], 1], 4.5, 2.5], "line-opacity": ["case", ["==", ["get", "sel"], 1], 1, 0.45] } });
  map.addSource("route", { type: "geojson", data: EMPTY });
  map.addSource("route-surf", { type: "geojson", data: EMPTY });
  map.addLayer({ id: "route-case", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#0B0F14", "line-width": 8, "line-opacity": 0.85 } });
  map.addLayer({ id: "route-line", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "c"], "line-width": 4.5 } });
  map.addLayer({ id: "route-surf", type: "line", source: "route-surf", paint: { "line-color": "#E8EDF2", "line-width": 2, "line-dasharray": [1, 2.5] } });
  map.addSource("poi", { type: "geojson", data: EMPTY });
  map.addLayer({ id: "poi-dot", type: "circle", source: "poi", minzoom: POI_ZOOM, layout: { visibility: S.poi ? "visible" : "none" }, paint: { "circle-color": ["match", ["get", "k"], "water", "#38BDF8", "#E8EDF2"], "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 3, 15, 6], "circle-stroke-color": "#0B0F14", "circle-stroke-width": 1.2 } });
  map.addLayer({ id: "c-glow", type: "circle", source: "climbs", paint: { "circle-color": DIFF_COLOR, "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 4, 9, 9, 13, 16], "circle-opacity": 0.22, "circle-blur": 0.8 } });
  map.addLayer({ id: "c-dot", type: "circle", source: "climbs", paint: { "circle-color": DIFF_COLOR, "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 1.6, 9, 4, 13, 7], "circle-stroke-color": "#0B0F14", "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 5, 0, 9, 1.2] } });
  map.addLayer({ id: "c-lab", type: "symbol", source: "climbs", minzoom: 9.5, layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 12, "text-offset": [0, 1.1], "text-anchor": "top", "text-optional": true, "symbol-sort-key": ["-", 0, ["get", "d"]] }, paint: { "text-color": "#E8EDF2", "text-halo-color": "#0B0F14", "text-halo-width": 1.4 } });
  setTraffic(trafficOn);
  map.addSource("cur", { type: "geojson", data: EMPTY });
  map.addLayer({ id: "cur-dot", type: "circle", source: "cur", paint: { "circle-radius": 7, "circle-color": "#E8EDF2", "circle-stroke-color": "#0B0F14", "circle-stroke-width": 3 } });
  applyFilter(); paintRoute(); rideVisible(panel.dataset.mode === "giro"); if (S.poi) loadPoi();
  if (S.three) map.setTerrain({ source: "dem", exaggeration: 1.35 });
}
map.on("style.load", () => { tuneBasemap(); addOurLayers(); });
/* basemap switch: the user's pick is remembered; the Giro switches to Ciclabile by itself (auto) */
function setBase(id, auto = false) {
  const b = basemap(id);
  if (!auto) { mapPref = b.id; try { localStorage.setItem(MAP_KEY, b.id); } catch { /* private mode */ } }
  if (b.id === BASE.id) return;
  BASE = b; map.setStyle(b.style, { diff: false });
}
/* main roads over any basemap (lib/maps.mjs trafficLayer), remembered like the basemap */
const TRAFFIC_KEY = "lr_traffic";
let trafficOn = (() => { try { return localStorage.getItem(TRAFFIC_KEY) === "1"; } catch { return false; } })();
function setTraffic(on) {
  trafficOn = on;
  try { localStorage.setItem(TRAFFIC_KEY, on ? "1" : "0"); } catch { /* private mode */ }
  if (!map.isStyleLoaded() && !map.getSource("climbs")) return;            // addOurLayers() calls it again
  if (on && !map.getLayer("traffic")) {
    if (!map.getSource("traffic")) map.addSource("traffic", TRAFFIC_SOURCE);
    map.addLayer(trafficLayer(), map.getLayer("sel-glow") ? "sel-glow" : undefined);   // under the climbs and the ride
  } else if (!on && map.getLayer("traffic")) map.removeLayer("traffic");
  const lg = $("#trafLeg"); if (lg) lg.hidden = !on;
}
{ const lg = $("#trafLeg"); if (lg) lg.hidden = !trafficOn; }
$("#bmaps").addEventListener("click", () => {
  const d = openDialog(`<form method="dialog" class="dform maps"><h2>Mappe</h2>
    <div class="mlist">${BASEMAPS.map((b) => `<button type="button" data-map="${b.id}" aria-pressed="${b.id === BASE.id}"><i style="background:${b.swatch}"></i><b>${esc(b.label)}</b><span>${esc(b.sub)}</span></button>`).join("")}</div>
    <label class="tgl"><input type="checkbox" id="trafChk" ${trafficOn ? "checked" : ""}><span><b>Strade trafficate</b><small>Autostrade, statali e provinciali principali in evidenza, su ogni mappa: di solito più auto e camion. È la classe della strada, non un conteggio del traffico.</small></span></label>
    <p class="note small mu">Nel Giro la mappa passa da sola a Ciclabile; uscendo torna la tua.</p>
    <button class="btn" value="x">Chiudi</button></form>`);
  d.querySelectorAll("[data-map]").forEach((b) => b.addEventListener("click", () => { setBase(b.dataset.map); closeDialog(); }));
  $("#trafChk").addEventListener("change", (e) => setTraffic(e.target.checked));
});

map.on("load", async () => {
  const st = await loadIndex();
  // the classic ride importer (classic-bridge.js) matches rides against these globals
  window.PASSES_DATA = st.climbs.filter((c) => c.curated);
  window.osmPasses = st.climbs.filter((c) => !c.curated);
  GJ = geojson(st.climbs);
  GJ.features.forEach((f) => { f.properties.disc = /^osm-rt/.test(f.properties.id) ? 1 : 0; });
  if (map.getSource("climbs")) map.getSource("climbs").setData(GJ);
  // delegated handlers: registered once, they follow the layer ids through every basemap switch
  map.on("click", "poi-dot", (e) => {
    const f = e.features && e.features[0]; if (!f || giroOn()) return;
    new maplibregl.Popup({ closeButton: false, className: "pop" }).setLngLat(e.lngLat).setHTML(`<b>${esc(f.properties.n)}</b>${f.properties.n !== f.properties.l ? `<br><span>${esc(f.properties.l)}</span>` : ""}`).addTo(map);
  });
  for (const id of ["c-dot", "c-glow"]) {
    map.on("click", id, (e) => { if (giroOn()) return; const f = e.features && e.features[0]; if (f) location.hash = "#/s/" + encodeURIComponent(f.properties.id); });
    map.on("mouseenter", id, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; });
  }
  map.on("click", giroClick);
  applyFilter();
  route();
});
let listT = null;
map.on("moveend", () => { if (panel.dataset.mode !== "list") return; clearTimeout(listT); listT = setTimeout(renderList, 120); });
/* The panel needs the data, not the map: render as soon as the index is in, even when the map is slow
   to fire "load" (slow tile server, a tab opened in the background, headless CI). The map's load
   handler runs route() again to draw the climb and the layers. Seen on 31/10: an empty page while the
   map waited. */
loadIndex().then(() => { if (!mapLoaded) route(); }).catch(() => {});

function applyFilter() {
  let f = S.filter === "hard" ? ["all", [">=", ["get", "d"], 8], ["!=", ["get", "q"], 1]] : S.filter === "top" ? ["all", [">=", ["get", "d"], 10], ["!=", ["get", "q"], 1]] : S.filter === "new" ? ["==", ["get", "disc"], 1] : null;
  const all = [f, S.paved && ["==", ["get", "gr"], 0], S.trucks && ["==", ["get", "tk"], 0], S.cc && ["==", ["get", "cc"], S.cc]].filter(Boolean);
  f = all.length > 1 ? ["all", ...all] : all[0] || null;
  for (const id of ["c-dot", "c-glow", "c-lab"]) if (map.getLayer(id)) map.setFilter(id, f);
}
function passesFilter(c) {
  const d = c.difficulty || 0;
  if (S.paved && isGravel(c)) return false;
  if (S.trucks && !fewTrucks(c)) return false;
  if (S.cc && c.cc !== S.cc) return false;
  if ((S.filter === "hard" || S.filter === "top") && c.q) return false;   // implausible gradients are not "hard"
  return S.filter === "hard" ? d >= 8 : S.filter === "top" ? d >= 10 : S.filter === "new" ? /^osm-rt/.test(c.id) : true;
}
document.querySelectorAll(".chips button[data-filter]").forEach((b) => b.addEventListener("click", () => {
  S.filter = b.dataset.filter;
  document.querySelectorAll(".chips button[data-filter]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  applyFilter(); if (panel.dataset.mode === "list") renderList();
}));

$("#bpaved").addEventListener("click", (e) => {
  S.paved = !S.paved; e.currentTarget.setAttribute("aria-pressed", String(S.paved));
  applyFilter(); if (panel.dataset.mode === "list") renderList();
});
$("#btrucks").addEventListener("click", (e) => {
  S.trucks = !S.trucks; e.currentTarget.setAttribute("aria-pressed", String(S.trucks));
  applyFilter(); if (panel.dataset.mode === "list") renderList();
});
/* zone = the data zone a climb comes from (one per country; climbs near a border may sit in the
   neighbour's zone): a menu with the counts, the map flies to the chosen zone */
$("#bzone").addEventListener("click", async () => {
  const st = await loadIndex(), n = new Map();
  for (const c of st.climbs) if (c.cc) n.set(c.cc, (n.get(c.cc) || 0) + 1);
  const list = [...n.entries()].sort((a, b) => (COUNTRIES[a[0]] || a[0]).localeCompare(COUNTRIES[b[0]] || b[0], "it"));
  const d = openDialog(`<form method="dialog" class="dform zones"><h2>Zona</h2>
    <button type="button" class="zr" data-cc="" aria-pressed="${!S.cc}"><span>Tutte le zone</span><small>${esc(st.climbs.length.toLocaleString(LOC))}</small></button>
    ${list.map(([k, v]) => `<button type="button" class="zr" data-cc="${esc(k)}" aria-pressed="${S.cc === k}"><span>${esc(COUNTRIES[k] || k)}</span><small>${esc(v.toLocaleString(LOC))}</small></button>`).join("")}
    <p class="note small mu">Le salite vicino a un confine possono stare nella zona del Paese accanto.</p>
    <button class="btn" value="x">Chiudi</button></form>`);
  d.querySelectorAll("[data-cc]").forEach((b) => b.addEventListener("click", () => {
    S.cc = b.dataset.cc; closeDialog();
    const bz = $("#bzone"); bz.setAttribute("aria-pressed", String(!!S.cc)); bz.textContent = S.cc ? (COUNTRIES[S.cc] || S.cc) + " ▾" : "Zona ▾";
    applyFilter();
    if (S.cc) {
      const pts = st.climbs.filter((c) => c.cc === S.cc), la = pts.map((c) => c.lat).sort((a, b2) => a - b2), lo = pts.map((c) => c.lon).sort((a, b2) => a - b2);
      const q = (a, x) => a[Math.min(a.length - 1, Math.max(0, Math.round(x * (a.length - 1))))];   // 2nd-98th percentile: one stray point does not zoom out to Europe
      if (pts.length) map.fitBounds([[q(lo, 0.02), q(la, 0.02)], [q(lo, 0.98), q(la, 0.98)]], { padding: DESKTOP() ? { top: 80, bottom: 40, left: 480, right: 60 } : { top: 140, bottom: 260, left: 20, right: 20 }, duration: 900 });
    }
    if (panel.dataset.mode === "list") renderList();
  }));
});
$("#blang").textContent = LANG === "en" ? "IT" : "EN";
$("#blang").setAttribute("aria-label", LANG === "en" ? "Passa all'italiano" : "Switch to English");
$("#blang").addEventListener("click", () => { setLang(LANG === "en" ? "it" : "en"); location.reload(); });
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
let placeT = null, placeCtl = null, placeHits = [];
q.addEventListener("input", () => {
  placeHits = []; paintResults();
  clearTimeout(placeT); if (placeCtl) placeCtl.abort();
  const txt = q.value.trim();
  if (txt.length < 3) return;
  // places (towns, valleys, roads) from Nominatim, as the classic app: ~1 request/s, so debounced
  placeT = setTimeout(async () => {
    placeCtl = new AbortController();
    try {
      const r = await fetch("https://nominatim.openstreetmap.org/search?" + new URLSearchParams({ q: txt, format: "jsonv2", limit: "5", "accept-language": "it" }), { signal: placeCtl.signal, headers: { Accept: "application/json" } });
      const j = await r.json();
      if (q.value.trim() !== txt) return;
      placeHits = (Array.isArray(j) ? j : []).map(placeHit).filter(Boolean); paintResults();
    } catch { /* aborted or offline: climbs only */ }
  }, 450);
});
function paintResults() {
  const r = search(q.value);
  results.hidden = !r.length && !placeHits.length;
  results.innerHTML = r.map((c) => `<li><button type="button" data-id="${esc(c.id)}"><span>${esc(c.name)}</span><small>${c.elevation ? esc(c.elevation) + " m" : ""}</small></button></li>`).join("")
    + (placeHits.length ? `<li class="rh">Località</li>` + placeHits.map((p, i) => `<li><button type="button" data-pl="${i}"><span>${esc(p.name)}</span><small>${esc(p.sub)}</small></button></li>`).join("") : "");
}
results.addEventListener("click", (e) => {
  const pl = e.target.closest("button[data-pl]");
  if (pl) {
    const p = placeHits[+pl.dataset.pl]; results.hidden = true; q.value = ""; q.blur();
    if (location.hash.startsWith("#/s/") || !location.hash || location.hash === "#/") location.hash = "#/";
    if (p.bb) map.fitBounds(p.bb, { padding: 40, maxZoom: 12.5, duration: 900 }); else map.flyTo({ center: [p.lon, p.lat], zoom: 11.5 });
    return;
  }
  const b = e.target.closest("button[data-id]"); if (!b) return;
  results.hidden = true; q.value = ""; q.blur();
  location.hash = "#/s/" + encodeURIComponent(b.dataset.id);
});
$(".search").addEventListener("submit", (e) => { e.preventDefault(); const b = results.querySelector("button"); if (b) b.click(); });

/* ------------------------------------------------------------------ water and food on the map */
$("#bpoi").addEventListener("click", (e) => {
  S.poi = !S.poi; e.currentTarget.setAttribute("aria-pressed", String(S.poi));
  for (const id of ["poi-dot"]) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", S.poi ? "visible" : "none");
  if (S.poi) { if (map.getZoom() < POI_ZOOM) toast("Avvicinati per vedere acqua e bar"); loadPoi(); }
});
const POI_ZOOM = 11;
let poiSeq = 0;
async function loadPoi() {
  const src = map.getSource && map.getSource("poi");
  if (!S.poi || !src || map.getZoom() < POI_ZOOM) return;
  const b = map.getBounds(), seq = ++poiSeq;
  let r;
  try { r = await poisNear([[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]]); } catch { r = null; }
  if (seq !== poiSeq || !r) return;
  src.setData({ type: "FeatureCollection", features: r.points.map((p) => ({ type: "Feature", properties: { k: p.kind, n: p.name || p.label, l: p.label }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } })) });
}
map.on("moveend", () => { if (S.poi) loadPoi(); });

/* ------------------------------------------------------------------ router */
window.addEventListener("hashchange", route);
function route() {
  const h = location.hash || "#/";
  document.querySelectorAll(".tabs a").forEach((a) => a.removeAttribute("aria-current"));
  const tab = h.startsWith("#/oggi") ? "oggi" : h.startsWith("#/profilo") || h.startsWith("#/diario") ? "profilo" : h.startsWith("#/giro") ? "giro" : "map";
  const t = document.querySelector(`.tabs a[data-tab="${tab}"]`); if (t) t.setAttribute("aria-current", "page");
  if (h.startsWith("#/s/")) return openClimb(decodeURIComponent(h.slice(4)));
  clearSel();
  if (tab === "oggi") return renderOggi();
  if (tab === "profilo") return renderDiario();
  if (tab === "giro") return openGiro(h);
  renderList();
  if (S.engaged) setTimeout(() => nudgeInstall(true), 1500);
}

function setMode(m) {
  if (m !== "giro") S.giroOpen = false;
  if (m === "giro" && panel.dataset.mode !== "giro") setBase(GIRO_MAP, true);              // building a ride: roads first
  else if (m !== "giro" && panel.dataset.mode === "giro") setBase(mapPref, true);          // back to the rider's map
  if (m === "climb" || m === "giro") hideInstallCard();          // the card never sits on a climb or a ride
  panel.dataset.mode = m; panel.scrollTop = 0;
  document.body.classList.toggle("inner", m === "climb" || m === "giro");
  document.body.classList.toggle("ingiro", m === "giro"); rideVisible(m === "giro");
  if (m !== "climb" && m !== "giro") { panel.style.height = ""; delete panel.dataset.sheet; sheetVar(); clearPad(); }
}

/* ------------------------------------------------------------------ phone sheet: three heights
   On phones the climb page and the ride builder open LOW (name + four numbers, "peek"), so the map
   stays the main thing; drag the handle (or the title) to half and to full screen. Desktop: side
   panel as before. The map keeps the climb in view above the sheet (padding = sheet height). */
const SHEETS = ["peek", "half", "full"];
function sheetHeights() {
  const tabs = $(".tabs").getBoundingClientRect().height, full = innerHeight - tabs - 12;
  const mk = panel.querySelector("[data-peek]");
  const peek = mk ? Math.round(mk.getBoundingClientRect().bottom - panel.getBoundingClientRect().top + panel.scrollTop + 14) : 170;
  const p = Math.max(120, Math.min(peek, Math.round(full * 0.45)));
  return { peek: p, half: Math.max(p + 60, Math.round(full * 0.55)), full };
}
/* the sheet sets a persistent map padding while dragged; fitBounds adds its own on top, so clear first */
/* only when there is padding to clear: setPadding moves the camera and fires "moveend", which
   re-renders the list, which called clearPad again - an endless loop that froze the page (31/10) */
function clearPad() {
  try {
    if (!mapLoaded) return;
    const p = map.getPadding();
    if (p.top || p.bottom || p.left || p.right) map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
  } catch { /* old map */ }
}
function sheetPx() { return DESKTOP() ? 0 : (panel.getBoundingClientRect().height || 232); }
function sheetVar() { document.documentElement.style.setProperty("--sheet-h", (DESKTOP() ? 0 : Math.round(panel.getBoundingClientRect().height || 232)) + "px"); }
function setSheet(state, keepMap) {
  if (DESKTOP() || (panel.dataset.mode !== "climb" && panel.dataset.mode !== "giro")) { panel.style.height = ""; sheetVar(); return; }
  S.sheet = SHEETS.includes(state) ? state : "peek";
  panel.dataset.sheet = "peek";                      // the peek height is measured in its compact layout
  const h = sheetHeights()[S.sheet];
  panel.dataset.sheet = S.sheet; panel.style.height = h + "px";
  if (S.sheet !== "full") panel.scrollTop = 0;
  document.documentElement.style.setProperty("--sheet-h", h + "px");
  if (!keepMap && mapLoaded) map.easeTo({ padding: { top: 70, bottom: h + 10, left: 0, right: 0 }, duration: 350 });
}
(function sheetDrag() {
  let y0 = 0, h0 = 0, t0 = 0, drag = false, moved = false, onHandle = false;
  const grab = (t) => t.closest(".handle, .cl-top, .ph, .ov, .cl h1, .sub, .strip") && !t.closest("a, button, input, select, label");
  panel.addEventListener("pointerdown", (e) => {
    if (DESKTOP() || !panel.dataset.sheet || !grab(e.target)) return;
    if (panel.dataset.sheet === "full" && panel.scrollTop > 0 && !e.target.closest(".handle")) return;
    drag = true; moved = false; onHandle = !!e.target.closest(".handle"); y0 = e.clientY; h0 = panel.getBoundingClientRect().height; t0 = performance.now();
    panel.classList.add("dragging"); panel.setPointerCapture(e.pointerId);
  });
  panel.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dy = e.clientY - y0; if (Math.abs(dy) > 6) moved = true;
    const H = sheetHeights(); panel.style.height = Math.max(H.peek * 0.8, Math.min(H.full, h0 - dy)) + "px";
  });
  const end = (e) => {
    if (!drag) return;
    drag = false; panel.classList.remove("dragging");
    const i = SHEETS.indexOf(S.sheet);
    if (!moved) { if (onHandle) setSheet(SHEETS[(i + 1) % 3]); else setSheet(S.sheet, true); return; }
    const H = sheetHeights(), h = panel.getBoundingClientRect().height, v = (e.clientY - y0) / Math.max(1, performance.now() - t0);
    let next;
    if (v < -0.5) next = SHEETS[Math.min(2, SHEETS.indexOf(nearest(H, h)) + (nearest(H, h) === S.sheet ? 1 : 0))];
    else if (v > 0.5) next = SHEETS[Math.max(0, SHEETS.indexOf(nearest(H, h)) - (nearest(H, h) === S.sheet ? 1 : 0))];
    else next = nearest(H, h);
    setSheet(next);
  };
  const nearest = (H, h) => SHEETS.reduce((a, b) => (Math.abs(H[b] - h) < Math.abs(H[a] - h) ? b : a));
  panel.addEventListener("pointerup", end); panel.addEventListener("pointercancel", end);
  addEventListener("resize", () => { if (panel.dataset.sheet) setSheet(S.sheet, true); else sheetVar(); });
})();

/* ------------------------------------------------------------------ climbs in view */
function renderList() {
  setMode("list");
  const b = map.getBounds(), r = inBounds({ s: b.getSouth(), n: b.getNorth(), w: b.getWest(), e: b.getEast() }, Infinity);
  const all = (r.list || []).filter(passesFilter), list = all.slice(0, 30);
  const total = all.length;   // what the filters leave, not every climb in view
  panel.innerHTML = `<div class="handle"></div>
    <div class="ph"><h2>${total ? esc(total.toLocaleString(LOC)) + " salite qui" : "Nessuna salita qui"}</h2><small>${list.length ? "le più dure" : "sposta o allarga la mappa"}</small></div>
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
  S.engaged = true;                                 // someone reading a climb: suggest the app when back on the map, never on top of the climb
}

function renderClimb() {
  const c = S.sel, vs = (c.versanti || []).filter((v) => v.distance_km > 0);
  const v = vs[S.side] || vs[0];
  const d = c.difficulty || 0;
  const top = esc(c.name);
  if (!v) {
    panel.innerHTML = `<div class="handle"></div><div class="cl"><div class="cl-top"><a class="ib" href="#/" aria-label="Torna alla mappa">${ICON.back}</a></div><h1>${top}</h1><p class="sub" data-peek>${c.elevation ? esc(c.elevation) + " m" : ""}</p><p class="note">Di questa salita non abbiamo ancora i versanti.</p></div>`;
    setSheet("peek", true); flyToClimb(c, null); return;
  }
  const st = sideStats(v), rows = kmTable(v), hard = hardestKm(rows);
  const maxG = Math.max(12, ...rows.map((r) => r.g));
  panel.innerHTML = `<div class="handle"></div><div class="cl">
    <div class="cl-top"><a class="ib" href="#/" aria-label="Torna alla mappa">${ICON.back}</a>
      <div style="display:flex;gap:8px"><button type="button" class="ib" id="share" aria-label="Condividi">${ICON.share}</button></div></div>
    <div class="ov">${d ? "Difficoltà " + d + "/10" : "Salita"}${c.cat ? " · cat. " + esc(c.cat) : ""}${c.status === "seasonal" ? " · stagionale" : ""}</div>
    <h1>${top}</h1>
    <p class="sub">${esc(v.side || "")}${st.start != null ? " · " + esc(st.start) + " → " + esc(st.top) + " m" : ""}</p>
    ${vs.length > 1 ? `<div class="sides" role="group" aria-label="Versante">${vs.map((x, i) => `<button type="button" data-side="${i}" aria-pressed="${i === (vs.indexOf(v))}">${esc(x.side || "Versante " + (i + 1))}</button>`).join("")}</div>` : ""}
    <div class="strip" data-peek>
      <div><b>${num(st.km)}</b><span>km</span></div>
      <div><b>${num(st.avg)}%</b><span>media</span></div>
      <div><b>+${esc(st.gain)}</b><span>metri</span></div>
      <div class="mx"><b>${num(st.max)}%</b><span>max</span></div>
    </div>
    ${implausible(v) ? `<div class="warnbox"><b>Dati da verificare</b><p>Pendenze non credibili per una strada asfaltata (${v.maxGradient >= 30 ? "max " + num(v.maxGradient, 0) + "%" : "media " + num(v.avgGradient) + "% su " + num(v.distance_km) + " km"}): probabile errore del modello del terreno (galleria, ponte) o un tratto che non è una strada asfaltata. Per questo non compare tra le salite più dure.</p><button type="button" class="btn" id="warnRep">Segnala com'è davvero</button></div>` : ""}
    <div class="verdict" id="verdict"><div class="k">IL VERDETTO DI OGGI</div><p>Carico il meteo in quota…</p></div>
    <figure class="prof" id="climbProf">
      ${profSvg(v, 220, 10, "Profilo altimetrico " + c.name)}
      <figcaption><span>0 km</span><span>${num(st.km)} km</span></figcaption>
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
    <section class="sec" id="shade" hidden></section>
    ${bikeDayHtml(c)}
    <section class="sec" id="news" hidden></section>
    <section class="sec" id="rating"><h3>Valutazioni della community</h3><p class="note">Carico…</p></section>
    ${stravaHtml(c)}
    <div class="actions"><button type="button" class="btn pri" id="sendBtn">Manda al dispositivo</button><button type="button" class="btn" id="gpxBtn">GPX</button><button type="button" class="btn" id="giroAdd">+ Giro</button></div>
  </div>`;
  wireProfile($("#climbProf"), v, 220, 10);
  panel.querySelectorAll("[data-side]").forEach((b) => b.addEventListener("click", () => { S.side = +b.dataset.side; S.sideSwitch = true; renderClimb(); if (S.verdict) paintVerdict(S.verdict); }));
  $("#gpxBtn").addEventListener("click", () => downloadGpx(c, v));
  $("#sendBtn").addEventListener("click", () => { const f = climbGpx(c, v); sendToDevice(c.name + (v.side ? " · " + v.side : ""), f.name, f.text); });
  $("#share").addEventListener("click", () => share(c));
  const wr = $("#warnRep"); if (wr) wr.addEventListener("click", () => openReport(c));
  $("#giroAdd").addEventListener("click", () => { addStop({ lat: c.lat, lon: c.lon, id: String(c.id), name: c.name }); toast(`Aggiunta al giro · ${G.stops.length} ${G.stops.length === 1 ? "tappa" : "tappe"}`); });
  if (S.verdict && S.verdict.id === c.id) paintVerdict(S.verdict);
  wireTimes(c, vs);
  fillWater(c, v); fillWeek(c); fillRating(c); fillNews(c); fillShade(c, v);
  setSheet(S.sideSwitch ? S.sheet : "peek", true); S.sideSwitch = false;
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
  return `<section class="sec"><h3>Bike Day: strada solo per bici</h3><ul class="tips">${ev.map((e) => `<li><b>${esc(new Date(e.date).toLocaleDateString(LOC, { weekday: "short", day: "numeric", month: "long" }))}</b> · ${esc(e.name)} · ${esc(e.hours || "")}${e.url ? ` · <a href="${esc(e.url)}" target="_blank" rel="noopener">sito</a>` : ""}</li>`).join("")}</ul></section>`;
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
/* Sole e ombra (lib/shade.mjs): shown only where the pipeline has computed it - no "n/d" box */
const MONTHS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
async function fillShade(c, v) {
  const m = await loadShade(), el = $("#shade");
  if (!el || S.sel !== c) return;
  const rows = shadeFor(m, c, v.side);
  if (!rows) return;
  const mi = new Date().getMonth(), cur = rows[mi], cz = shadeCauses(cur);
  el.hidden = false;
  el.innerHTML = `<h3>Sole e ombra</h3>
    <div class="shx"><div class="shn" style="color:${shadeTone(cur.shade)}"><b>${esc(cur.shade)}%</b><span>di ombra a ${esc(MONTHS[mi].toLowerCase())}</span></div>
      <div class="shw"><b>${esc(shadeWord(cur.shade))}</b><span class="mu">${cz.length ? cz.map((x) => `${x.k} ${x.pct}%`).join(" · ") : "sole diretto " + num(cur.sun, 1) + " h"}</span></div></div>
    <div class="shy" role="img" aria-label="Ombra mese per mese">${rows.map((r, i) => `<i class="${i === mi ? "on" : ""}" style="height:${Math.max(4, Math.round(4 + r.shade * 0.4))}px;background:${shadeTone(r.shade)}" title="${MONTHS[i]}: ${r.shade}%"></i>`).join("")}</div>
    <div class="shm">${MONTHS.map((x, i) => `<span class="${i === mi ? "on" : ""}">${x[0]}</span>`).join("")}</div>
    <p class="note small mu">Ombra media sul tracciato nelle ore di luce: rilievi intorno, bosco (con le foglie della stagione) ed esposizione del versante.</p>`;
}
async function fillWeek(c) {
  const el = $("#week"); if (!el) return;
  let rows;
  try { rows = await fetchDaily({ lat: c.lat, lon: c.lon, ele: c.elevation }); } catch { rows = null; }
  if (S.sel !== c || !$("#week")) return;
  if (!rows || !rows.length) { el.innerHTML = `<h3>Meteo 7 giorni in cima</h3><p class="note">Meteo non disponibile ora.</p>`; return; }
  el.innerHTML = `<h3>Meteo 7 giorni in cima</h3><div class="week">${rows.map((d) => `<div class="day ${d.pp >= 50 ? "wet" : ""}"><span class="dn">${esc(new Date(d.date + "T12:00:00").toLocaleDateString(LOC, { weekday: "short", day: "numeric" }))}</span><span class="wl">${esc(d.label)}</span><b>${num(d.tmax, 0)}°</b><span class="mu">${num(d.tmin, 0)}°</span><span class="pp">${esc(d.pp ?? "–")}%</span><span class="mu">${num(d.wind, 0)} km/h</span></div>`).join("")}</div>`;
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
    ${comments.length ? `<ul class="comments" data-noi18n>${comments.map((v) => `<li><b>${esc(v.by || "Ciclista")}</b> <span class="mu">· ${esc(new Date(v.ts).toLocaleDateString(LOC))}</span><br>${esc(String(v.txt).slice(0, REV_MAX))}</li>`).join("")}</ul>` : ""}
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
  if (!NEWS) NEWS = fetch(new URL("../data/pass_news.json", import.meta.url), { cache: "no-cache" }).then((r) => r.json()).catch(() => ({}));
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
  clearPad();
  const src = map.getSource("sel");
  if (!v || !src) { map.flyTo({ center: [c.lon, c.lat], zoom: 12 }); return; }
  const all = (c.versanti || []).filter((x) => x.track && x.track.length > 1);
  const feats = all.filter((x) => x !== v).flatMap((x) => sideFeatures(x, false)).concat(sideFeatures(v, true));
  SEL = { type: "FeatureCollection", features: feats };
  src.setData(SEL);
  const t = v.track || [];
  if (t.length > 1) {
    const pts = all.flatMap((x) => x.track), lons = pts.map((x) => x[1]), lats = pts.map((x) => x[0]);
    const pad = DESKTOP() ? { top: 80, bottom: 60, left: 480, right: 60 } : { top: 70, bottom: sheetPx() + 20, left: 30, right: 30 };
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
function clearSel() { SEL = EMPTY; const s = map.getSource && map.getSource("sel"); if (s) s.setData(EMPTY); const c = map.getSource && map.getSource("cur"); if (c) c.setData(EMPTY); S.sel = null; }

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

function climbGpx(c, v) {
  const name = c.name + (v.side ? " - " + v.side : "");
  return { name: name.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().replace(/\s+/g, "_") + ".gpx", text: gpx(name, trackWithEle(v)) };
}
function saveFile(fname, text, type = "application/gpx+xml") {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = fname; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function downloadGpx(c, v) { const f = climbGpx(c, v); saveFile(f.name, f.text); }

/* ------------------------------------------------------------------ manda al dispositivo
   Replaces the parked "modalità salita" (startRide below, no longer reachable): on the bike people
   use their computer, so the useful thing is getting the climb or the ride ONTO it. Phones: the
   system share sheet with the GPX file (Garmin Connect, Wahoo, Karoo, Komoot... whatever is
   installed). Everywhere: download + a short how-to for the device the rider picked (remembered). */
/* [key, label, how-to, service to open after the download (or null), its label]. A web page cannot
   hand a file to Garmin Connect & co. directly (their apps accept files only from approved partners
   or through the share sheet), so each device gets two explicit steps: get the GPX, open the service. */
const DEVICES = [
  ["garmin", "Garmin", "Garmin non accetta file inviati da un sito: scarica il GPX, poi su Garmin Connect (meglio dal computer) apri Allenamento e pianificazione → Percorsi → Importa e scegli il file; infine «Invia al dispositivo». Più comodo: collega Garmin a Komoot o Strava, i percorsi arrivano da soli.", "https://connect.garmin.com/modern/courses", "Apri Garmin Connect"],
  ["wahoo", "Wahoo", "Dal telefono: «Condividi con un'app» e scegli Wahoo ELEMNT; il percorso arriva al ciclocomputer alla prossima sincronizzazione. In alternativa scarica il GPX e aprilo con l'app ELEMNT.", null, ""],
  ["karoo", "Hammerhead Karoo", "Scarica il GPX e caricalo nella dashboard Hammerhead (Percorsi → Importa): il Karoo lo scarica da solo.", "https://dashboard.hammerhead.io/", "Apri la dashboard"],
  ["komoot", "Komoot", "Scarica il GPX e importalo su Komoot: se il ciclocomputer è collegato a Komoot, il percorso arriva da solo.", "https://www.komoot.com/upload", "Apri Komoot"],
  ["strava", "Strava", "Scarica il GPX e importalo come percorso su Strava: se il ciclocomputer è collegato a Strava, il percorso arriva da solo.", "https://www.strava.com/athlete/routes", "Apri Strava"],
  ["altro", "Altro", "Bryton, Coros, Sigma, Apple Watch...: «Condividi con un'app» e scegli l'app del tuo dispositivo, oppure scarica il GPX e aprilo con lei.", null, ""]
];
const DEV_KEY = "lr_device";
function sendToDevice(title, fname, text) {
  let dev = "garmin"; try { dev = localStorage.getItem(DEV_KEY) || dev; } catch { /* private mode */ }
  if (!DEVICES.some((x) => x[0] === dev)) dev = "garmin";
  let file = null; try { file = new File([text], fname, { type: "application/gpx+xml" }); } catch { file = null; }
  const canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
  const d = openDialog(`<form method="dialog" class="dform send"><h2>Manda al dispositivo</h2>
    <p class="note">${esc(title)}</p>
    <div class="k">Il tuo dispositivo</div>
    <div class="sides" role="group" aria-label="Dispositivo">${DEVICES.map(([k, l]) => `<button type="button" data-dev="${k}" aria-pressed="${k === dev}">${l}</button>`).join("")}</div>
    <div class="steps" id="devSteps"></div>
    <button class="btn" value="x">Chiudi</button></form>`);
  const paint = () => {
    const [, label, how, url, urlLabel] = DEVICES.find((e) => e[0] === dev);
    const share = canShare && (dev === "wahoo" || dev === "altro");
    $("#devSteps").innerHTML = `<p class="note">${esc(how)}</p>
      ${share ? `<button type="button" class="btn pri" id="devShare">Condividi con un'app</button>` : ""}
      <button type="button" class="btn ${share ? "" : "pri"}" id="devSave">${url ? "1 · " : ""}Scarica il GPX</button>
      ${url ? `<a class="btn" id="devOpen" href="${esc(url)}" target="_blank" rel="noopener">2 · ${esc(urlLabel)}</a>` : ""}
      ${!share && canShare ? `<button type="button" class="btn" id="devShare">Condividi con un'app</button>` : ""}
      <p class="note small mu">${esc(label)}: ${share ? "il file va direttamente all'app che scegli." : "nessun sito può inviare il file da solo a questo servizio: servono questi due passaggi."}</p>`;
    $("#devSave").addEventListener("click", () => { saveFile(fname, text); toast("GPX scaricato"); });
    const sh = $("#devShare");
    if (sh) sh.addEventListener("click", async () => { try { await navigator.share({ files: [file], title }); } catch { /* cancelled */ } });
  };
  d.querySelectorAll("[data-dev]").forEach((b) => b.addEventListener("click", () => {
    dev = b.dataset.dev; try { localStorage.setItem(DEV_KEY, dev); } catch { /* private mode */ }
    d.querySelectorAll("[data-dev]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); paint();
  }));
  paint();
}
async function share(c) {
  const url = location.origin + location.pathname + "#/s/" + encodeURIComponent(c.id);
  try { if (navigator.share) await navigator.share({ title: c.name + " · LocaRide", url }); else { await navigator.clipboard.writeText(url); toast("Link copiato"); } } catch { /* cancelled */ }
}
function toast(t) { const d = document.createElement("div"); d.textContent = t; d.style.cssText = "position:fixed;left:50%;top:76px;transform:translateX(-50%);z-index:30;background:#E8EDF2;color:#0B0F14;padding:8px 14px;border-radius:18px;font-weight:600"; document.body.appendChild(d); setTimeout(() => d.remove(), 1600); }

/* ------------------------------------------------------------------ modalità salita */
/* PARKED (31/10/2026, Rick): live "modalità salita" on the phone. Not reachable from the UI any more -
   replaced by "Manda al dispositivo"; kept for a possible comeback. */
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
  if (panel.dataset.mode !== "oggi") return;   // the rider moved on while we waited for the GPS
  let list = nearby(here.lat, here.lon, 60, 12);
  if (list.length < 4) list = nearby(here.lat, here.lon, 120, 12);
  if (!list.length) { $("#ogList").textContent = "Nessuna salita dura entro 120 km: sposta la mappa su una zona di montagna e riapri Oggi."; return; }
  try {
    const hs = await fetchForecast(list.map((c) => ({ lat: c.lat, lon: c.lon, ele: c.elevation })), 3);
    S.oggi = { here, list, hs };
  } catch { const ol = $("#ogList"); if (ol) ol.textContent = "Meteo non disponibile ora. Riprova tra poco."; return; }
  if (panel.dataset.mode === "oggi") paintOggi();
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

/* ------------------------------------------------------------------ profilo (+ diario)
   One place for the account: who you are (or "Accedi"), your climbs, your rides, your proposals,
   then the settings that used to be scattered (language, W/kg, the app on the phone). #/diario
   (old links, the manifest shortcut of the first release) opens the same page. */
function avatarHtml(u, cls = "av") {
  const n = (u && (u.displayName || u.email)) || "";
  return u && u.photoURL ? `<img class="${cls}" src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer">` : `<span class="${cls} ini">${esc((n.trim()[0] || "?").toUpperCase())}</span>`;
}
function paintTabAvatar(u) {
  const t = $("#tabav"); if (!t) return;
  if (!t.dataset.icon) t.dataset.icon = t.innerHTML;
  t.innerHTML = u ? avatarHtml(u, "tav") : t.dataset.icon;
  t.classList.toggle("in", !!u);
}
function settingsHtml() {
  const w = myWkg();
  return `<section class="sec" id="setSec"><h3>Impostazioni</h3>
    <div class="setrow"><span>Lingua</span><div class="seg" role="group" aria-label="Lingua"><button type="button" data-lang="it" aria-pressed="${LANG === "it"}">Italiano</button><button type="button" data-lang="en" aria-pressed="${LANG === "en"}">English</button></div></div>
    <div class="setrow"><label for="setWkg">Watt per kg <small>per i tempi stimati in salita</small></label><input id="setWkg" type="number" inputmode="decimal" min="1" max="8" step="0.1" placeholder="3,0" value="${w ? esc(String(w)) : ""}"></div>
  </section>`;
}
function wireSettings() {
  document.querySelectorAll("#setSec [data-lang]").forEach((b) => b.addEventListener("click", () => { if (b.dataset.lang !== LANG) { setLang(b.dataset.lang); location.reload(); } }));
  const wk = $("#setWkg");
  if (wk) wk.addEventListener("change", () => { const x = parseFloat(String(wk.value).replace(",", ".")); if (x > 0.5 && x < 9) { try { localStorage.setItem(WKG_KEY, String(x)); } catch { /* private mode */ } toast("Salvato"); } });
}
async function renderDiario() {
  setMode("diario");
  panel.innerHTML = `<div class="di"><div class="handle"></div><div id="who" class="who loading">Controllo l'accesso…</div><div id="diBody"></div></div>`;
  const body = $("#diBody"), who = $("#who");
  await new Promise((r) => (document.readyState === "complete" ? r() : addEventListener("load", r, { once: true })));
  const u = await currentUser();
  paintTabAvatar(u);
  if (!$("#who")) return;                                     // the user left the tab meanwhile
  who.className = "who";
  if (!u) {
    who.innerHTML = `<div class="ov">Il tuo profilo</div><h1>${LANG === "en" ? "Join LocaRide" : "Entra in LocaRide"}</h1>
      <p class="note">Con un account ritrovi le salite che hai fatto davvero con i tuoi tempi, salvi i giri, voti le salite e ne proponi di nuove. Gratis.</p>
      <div class="actions" style="position:static"><button type="button" class="btn pri" id="login">Accedi o crea un account</button></div>`;
    body.innerHTML = settingsHtml() + installSec();
    $("#login").addEventListener("click", () => openAccount(() => renderDiario()));
    wireSettings(); wireInstallSec();
    return;
  }
  who.innerHTML = `<div class="me">${avatarHtml(u)}<div class="mi"><div class="ov">Stagione ${new Date().getFullYear()}</div><b data-noi18n>${esc(u.displayName || (u.email || "").split("@")[0])}</b><span class="mu" data-noi18n>${esc(u.email || "")}</span></div>
    <button type="button" class="linkbtn" id="logout">Esci</button></div>`;
  $("#logout").addEventListener("click", async () => { try { await signOut(); } catch { /* ignore */ } paintTabAvatar(null); renderDiario(); });
  body.innerHTML = `<section class="sec" id="mine"><h3>Le tue salite</h3><p class="note">Carico…</p></section>`;
  let list = [];
  try { list = await loadClimbs(u.uid); } catch { $("#mine").innerHTML = `<h3>Le tue salite</h3><p class="note">Non riesco a leggere le tue salite ora.</p>`; list = null; }
  if (!$("#diBody")) return;
  if (list) {
    await loadIndex();
    const s = diaryStats(list);
    list.sort((a, b) => String(b.lastAt || "").localeCompare(String(a.lastAt || "")));
    $("#mine").innerHTML = `<h3>Le tue salite</h3><div class="challenge"><div><b>${s.climbs}</b><span>salite</span></div><div><b>${s.efforts}</b><span>passaggi</span></div><div><b>${s.top && s.top.elevation ? esc(s.top.elevation) : "–"}</b><span>m la più alta</span></div></div>
      ${list.length ? `<div class="stamps">${list.map(stamp).join("")}</div>` : `<p class="note">Ancora nessuna. Carica i tuoi giri: un GPX o FIT, oppure lo zip dell'export completo di Strava o Garmin Connect.</p>`}
      <div class="actions" style="position:static;margin-top:14px"><button type="button" class="btn pri" id="importBtn">Carica i tuoi giri</button></div>
      <p class="note small">GPX, FIT o TCX, anche più file insieme, oppure lo <b>zip dell'export completo</b> di Strava (Impostazioni → Il mio account → Scarica i tuoi dati) o di Garmin Connect (Esporta dati): così entra tutto lo storico con i tempi. I file restano sul tuo dispositivo.</p>`;
    $("#importBtn").addEventListener("click", () => { window.LRC_V2.onSaved = () => { if (/^#\/(profilo|diario)/.test(location.hash || "")) renderDiario(); }; window.gcPick(); });
  }
  body.insertAdjacentHTML("beforeend", `<section class="sec" id="rides"><h3>I miei giri</h3><p class="note">Carico…</p></section>
    <section class="sec" id="props"><h3>Le mie proposte</h3><p class="note">Carico…</p></section>
    <section class="sec" id="queue" hidden></section>${settingsHtml()}${installSec()}`);
  fillRides(u); fillProposals(u); wireSettings(); wireInstallSec();
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

/* ------------------------------------------------------------------ il tuo giro (route builder) */
const GIRO_KEY = "lr_v2_giro";
const G = { stops: [], profile: "fastbike", res: null, side: null, eta: null, on: [], markers: [], seq: 0, err: "", day: 0, start: "08:00", wx: null, water: null };
try { const o = JSON.parse(localStorage.getItem(GIRO_KEY) || "null"); if (o && Array.isArray(o.stops)) { G.stops = o.stops.slice(0, MAX_STOPS); G.profile = o.profile || G.profile; } } catch { /* private mode */ }
function giroOn() { return panel.dataset.mode === "giro"; }
function saveGiro() {
  try { localStorage.setItem(GIRO_KEY, JSON.stringify({ stops: G.stops, profile: G.profile })); } catch { /* private mode */ }
  if (giroOn()) history.replaceState(null, "", G.stops.length ? "#/giro?p=" + encodeStops(G.stops) : "#/giro");
}
function stopName(s, i) { return s.name || (i === 0 ? "Partenza" : i === G.stops.length - 1 ? "Arrivo" : "Tappa " + (i + 1)); }
function addStop(s) {
  if (G.stops.length >= MAX_STOPS) { toast(`Massimo ${MAX_STOPS} tappe`); return; }
  G.stops.push({ lat: +(+s.lat).toFixed(5), lon: +(+s.lon).toFixed(5), id: s.id || null, name: s.name || null });
  giroChanged();
}
function giroChanged() { saveGiro(); syncMarkers(); if (giroOn()) renderGiro(); calcSoon(); }
function giroClick(e) {
  if (!giroOn()) return;
  const f = map.queryRenderedFeatures(e.point, { layers: ["c-dot", "c-glow"].filter((l) => map.getLayer(l)) })[0];
  if (f) { const c = loadIndexSync(f.properties.id); addStop({ lat: c ? c.lat : e.lngLat.lat, lon: c ? c.lon : e.lngLat.lng, id: f.properties.id, name: f.properties.name }); }
  else addStop({ lat: e.lngLat.lat, lon: e.lngLat.lng });
}
function openGiro(h) {
  const m = /[?&]p=([^&]+)/.exec(h);
  if (m) {
    const st = decodeStops(decodeURIComponent(m[1]));
    if (st.length && encodeStops(st) !== encodeStops(G.stops)) {
      G.stops = st.map((s) => { const c = s.id && loadIndexSync(s.id); return { ...s, name: c ? c.name : null }; });
      G.res = null; syncMarkers(); calcSoon();
    }
  }
  setMode("giro"); saveGiro(); renderGiro();
  if (G.res) fitRoute(); else if (G.stops.length >= 2 && !G.busy) calcSoon();
}

/* numbered, draggable stop markers */
function syncMarkers() {
  G.markers.forEach((m) => m.remove()); G.markers = [];
  G.stops.forEach((s, i) => {
    const el = document.createElement("div");
    el.className = "wp" + (i === 0 ? " a" : i === G.stops.length - 1 && i ? " z" : "");
    el.textContent = String(i + 1); el.title = stopName(s, i);
    const mk = new maplibregl.Marker({ element: el, draggable: true }).setLngLat([s.lon, s.lat]).addTo(map);
    mk.on("dragend", () => { const p = mk.getLngLat(); Object.assign(G.stops[i], { lat: +p.lat.toFixed(5), lon: +p.lng.toFixed(5), id: null, name: null }); giroChanged(); });
    G.markers.push(mk);
  });
}

let calcT = null;
function calcSoon() { clearTimeout(calcT); calcT = setTimeout(calcRoute, 350); }
async function calcRoute() {
  const seq = ++G.seq;
  if (G.stops.length < 2) { G.res = null; G.side = null; paintRoute(); if (giroOn()) renderGiro(); return; }
  G.busy = true; G.err = ""; if (giroOn()) renderGiro();
  let res = null;
  try { res = parseBrouter(await (await fetch(brouterUrl(G.stops, G.profile))).json()); } catch { res = null; }
  if (!res) {
    // BRouter down or no route with this profile: OSRM gives the geometry only (no heights, no surface)
    try {
      const j = await (await fetch(osrmUrl(G.stops))).json();
      const r = j.code === "Ok" && j.routes && j.routes[0];
      if (r) res = { track: r.geometry.coordinates.map((c) => [c[1], c[0], null]), km: r.distance / 1000, gain: null, surf: null, segs: [], noEle: true };
    } catch { res = null; }
  }
  if (seq !== G.seq) return;
  G.busy = false;
  if (!res) { G.res = null; G.side = null; G.err = "Percorso non trovato: sposta una tappa su una strada."; paintRoute(); if (giroOn()) renderGiro(); return; }
  applyRoute(res, seq);
}
function applyRoute(res, seq) {
  G.res = res; G.side = asSide(res.track, 300); G.eta = G.side && !res.noEle ? etaMinutes(G.side, myWkg() || 3) : null;
  G.on = climbsOnRoute(res.track, (_idx && _idx.climbs) || [], 0.25).filter((x) => !G.stops.some((s, i) => i === 0 && Math.abs(s.lat - x.c.lat) < 1e-4)).slice(0, 40);
  G.wx = null; G.water = null;
  paintRoute(); if (giroOn()) { renderGiro(); fitRoute(); }
  fillGiroWater(seq); fillGiroWeather(seq);
}

/* ------------------------------------------------------------------ i miei giri (saved rides)
   Same Firestore documents as the classic app: users/{uid}/routes. Saved from the Giro, listed in the
   Diario, reopened with their stored track (no new routing: the ride stays exactly as saved). */
async function saveGiroDialog() {
  if (!G.res) return;
  const u = await currentUser();
  if (!u) { openAccount(() => saveGiroDialog()); return; }
  const named = G.stops.filter((s) => s.name).map((s) => s.name);
  const suggested = (named.length ? named.join(" - ") : "Giro di " + num(G.res.km, 0) + " km").slice(0, 60);
  const d = openDialog(`<form method="dialog" class="dform" id="saveForm"><h2>Salva il giro</h2>
    <label class="k" for="rideName">Nome</label><input id="rideName" maxlength="80" value="${esc(suggested)}">
    <p class="note small mu">${num(G.res.km, 1)} km · +${esc(G.res.gain ?? 0)} m · lo ritrovi nel Diario, anche nell'app classica.</p>
    <button type="submit" class="btn pri" value="save">Salva</button><button class="btn" value="x">Annulla</button></form>`);
  $("#saveForm").addEventListener("submit", async (e) => {
    if (e.submitter && e.submitter.value !== "save") return;
    e.preventDefault();
    try { await saveRoute(u, rideDoc($("#rideName").value, G.stops, G.res.track, G.res.km, G.res.gain)); closeDialog(); toast("Giro salvato nel Diario"); }
    catch (err) { toast("Non salvato: " + ((err && err.message) || "errore")); }
  });
  d.querySelector("#rideName").select();
}
function openSaved(r) {
  const track = decodeTrack(r.track);
  if (track.length < 2) { toast("Traccia non valida"); return; }
  G.seq++; G.err = ""; G.busy = false;
  G.stops = (r.stops || []).map((s) => ({ lat: +s.lat, lon: +s.lon, id: null, name: s.type === "pass" ? s.name : null })).slice(0, MAX_STOPS);
  G.title = r.name || "";
  saveGiro(); syncMarkers();
  location.hash = "#/giro";
  applyRoute({ track, km: +r.distKm || 0, gain: r.ascent ?? null, surf: null, segs: [], noEle: !track.some((q) => q[2] != null) }, G.seq);
}
/* ------------------------------------------------------------------ proponi una salita, livelli, revisione
   Same documents as the classic app (js/contribute.js); only on user action, nothing at startup. */
async function proposeDialog() {
  if (!G.res) return;
  const u = await currentUser();
  if (!u) { openAccount(() => proposeDialog()); return; }
  const me = await whoAmI(u);
  if (!me || !me.canPropose) {
    openDialog(`<form method="dialog" class="dform"><h2>Proposte su invito</h2><p class="note">In beta le proposte sono aperte ai tester autorizzati. Scrivici se vuoi partecipare: l'account ce l'hai già, serve solo l'abilitazione.</p><button class="btn" value="x">Ho capito</button></form>`);
    return;
  }
  const tr = G.res.track, f = facts(tr, G.res.km, G.res.gain ?? 0), bad = proposalProblem(f);
  if (bad || G.res.noEle) { toast(bad || "Servono le quote: ricalcola il percorso"); return; }
  const last = G.stops[G.stops.length - 1];
  openDialog(`<form method="dialog" class="dform" id="propForm"><h2>Proponi una salita</h2>
    <p class="note small mu">Il tracciato è il Giro che hai disegnato, dalla base alla cima. Pendenze e quote le ricalcoliamo noi.</p>
    <div class="strip"><div><b>${num(f.km)}</b><span>km</span></div><div><b>+${esc(f.gain)}</b><span>metri</span></div><div><b>${num(f.avgGradient)}%</b><span>media</span></div><div><b>${num(f.maxGradient)}%</b><span>max</span></div></div>
    <label class="k" for="pName">Nome della salita</label><input id="pName" maxlength="70" placeholder="es. Monte Nerone" value="${esc(last && last.name ? last.name : "")}">
    <label class="k" for="pSide">Da dove si sale</label><input id="pSide" maxlength="50" placeholder="es. Da Piobbico">
    <label class="k" for="pNote">Note per chi controlla (facoltative)</label><textarea id="pNote" maxlength="400" rows="3" placeholder="fondo, traffico, tratti al 15%, chiusure..."></textarea>
    <p class="note" id="pMsg"></p>
    <button type="submit" class="btn pri" value="send">Invia proposta</button><button class="btn" value="x">Annulla</button></form>`);
  $("#propForm").addEventListener("submit", async (e) => {
    if (e.submitter && e.submitter.value !== "send") return;
    e.preventDefault();
    const name = $("#pName").value.trim(), msg = $("#pMsg");
    if (name.length < 3) { msg.textContent = "Manca il nome della salita."; return; }
    try { await sendProposal(proposalDoc(u, { name, side: $("#pSide").value, note: $("#pNote").value }, f, tr)); closeDialog(); toast("Proposta inviata · la trovi nel Diario"); }
    catch (err) { msg.textContent = "Non inviata: " + ((err && err.message) || "errore"); }
  });
}
async function fillProposals(u) {
  const el = $("#props"); if (!el) return;
  let rows = [], me = null;
  try { [rows, me] = await Promise.all([myProposals(u.uid), whoAmI(u)]); } catch { el.innerHTML = `<h3>Le mie proposte</h3><p class="note">Non riesco a leggere le tue proposte ora.</p>`; return; }
  if (!$("#props")) return;
  const pts = points(rows), lv = levelOf(pts), nx = nextLevel(pts), en = document.documentElement.lang === "en";
  const pct = nx ? Math.max(0, Math.min(100, Math.round((pts - lv.min) / ((nx.min - lv.min) || 1) * 100))) : 100;
  const st = (r) => (r.status === "approved" ? "Pubblicata" : r.status === "rejected" ? "Non accolta" : "In revisione");
  el.innerHTML = `<h3>Le mie proposte</h3>
    <div class="lvl"><span class="lic">${lv.ic}</span><div><b>${esc(en ? lv.en : lv.it)}</b><i><u style="width:${pct}%"></u></i>
      <span class="mu">${nx ? `Ancora ${esc(nx.min - pts)} ${nx.min - pts === 1 ? "salita accettata" : "salite accettate"} per diventare ${esc(en ? nx.en : nx.it)}` : "Livello massimo. Grazie."}</span></div></div>
    ${rows.length ? `<ul class="rides">${rows.map((r, i) => `<li><div><b>${esc(r.name)}</b><span class="mu"><span class="pst ${esc(r.status)}">${st(r)}</span> · ${esc(r.side || "")} · ${num(+r.km || 0, 1)} km · +${esc(r.gain || 0)} m${r.reviewNote ? " · Nota: " + esc(r.reviewNote) : ""}</span></div>
      ${r.status === "pending" ? `<div class="ra"><button type="button" class="btn" data-wd="${i}">Ritira</button></div>` : ""}</li>`).join("")}</ul>`
    : `<p class="note">${me && me.canPropose ? "Nessuna proposta ancora. Disegna nel Giro una salita che manca (dalla base alla cima) e premi «Proponi salita»." : "Le proposte sono su invito durante la beta."}</p>`}`;
  el.querySelectorAll("[data-wd]").forEach((b) => b.addEventListener("click", async () => {
    if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "Conferma"; b.classList.add("pri"); return; }
    try { await withdrawProposal(rows[+b.dataset.wd].id); fillProposals(u); } catch { toast("Non ritirata"); }
  }));
  if (me && me.admin) fillQueue(u);
}
async function fillQueue(u) {
  const el = $("#queue"); if (!el) return;
  let rows = [];
  try { rows = await pendingProposals(); } catch { return; }
  if (!$("#queue")) return;
  el.hidden = false;
  el.innerHTML = `<h3>Da rivedere (${rows.length})</h3>${rows.length ? `<ul class="rides">${rows.map((r, i) => `<li><div><b>${esc(r.name)}</b><span class="mu">${esc(r.side || "")} · ${num(+r.km || 0, 1)} km · +${esc(r.gain || 0)} m · ${num(+r.avgGradient || 0)}% · da ${esc(r.author || "")}${r.note ? " · " + esc(r.note) : ""}</span></div>
    <div class="ra"><button type="button" class="btn" data-see="${i}">Vedi</button><button type="button" class="btn pri" data-ok="${i}">Approva</button><button type="button" class="btn" data-no="${i}">Rifiuta</button></div>
    <input class="why" id="why${i}" maxlength="300" placeholder="Motivo del rifiuto (lo vede chi ha proposto)" hidden></li>`).join("")}</ul>` : `<p class="note">Coda vuota.</p>`}`;
  el.querySelectorAll("[data-see]").forEach((b) => b.addEventListener("click", () => {
    const t = unflat(rows[+b.dataset.see].flat);
    if (t.length < 2) return;
    location.hash = "#/";
    setTimeout(() => {
      SEL = { type: "FeatureCollection", features: [{ type: "Feature", properties: { c: "#C04BD6", sel: 1 }, geometry: { type: "LineString", coordinates: t.map((q) => [q[1], q[0]]) } }] };
      const src = map.getSource("sel"); if (src) src.setData(SEL);
      const lo = t.map((q) => q[1]), la = t.map((q) => q[0]);
      map.fitBounds([[Math.min(...lo), Math.min(...la)], [Math.max(...lo), Math.max(...la)]], { padding: 60, duration: 800, maxZoom: 14 });
    }, 60);
  }));
  el.querySelectorAll("[data-ok]").forEach((b) => b.addEventListener("click", async () => {
    try { await reviewProposal(rows[+b.dataset.ok].id, true, "", u); toast("Approvata"); fillQueue(u); } catch { toast("Non salvata"); }
  }));
  el.querySelectorAll("[data-no]").forEach((b) => b.addEventListener("click", async () => {
    const i = +b.dataset.no, why = $("#why" + i);
    if (why.hidden) { why.hidden = false; why.focus(); b.textContent = "Conferma rifiuto"; return; }
    try { await reviewProposal(rows[i].id, false, why.value, u); toast("Rifiutata"); fillQueue(u); } catch { toast("Non salvata"); }
  }));
}
async function fillRides(u) {
  const el = $("#rides"); if (!el) return;
  let list = [];
  try { list = await listRoutes(u.uid); } catch { el.innerHTML = `<h3>I miei giri</h3><p class="note">Non riesco a leggere i tuoi giri ora.</p>`; return; }
  if (!$("#rides")) return;
  el.innerHTML = `<h3>I miei giri</h3>${list.length ? `<p class="note">${list.length} ${list.length === 1 ? "giro salvato" : "giri salvati"} · ${num(list.reduce((a, r) => a + (+r.distKm || 0), 0), 0)} km · +${esc(list.reduce((a, r) => a + (+r.ascent || 0), 0))} m</p>
    <ul class="rides">${list.map((r, i) => `<li><div><b>${esc(r.name || "Giro")}</b><span class="mu">${num(+r.distKm || 0, 1)} km · +${esc(r.ascent || 0)} m · ${esc(new Date(r.savedAt || 0).toLocaleDateString(LOC))}</span></div>
      <div class="ra"><button type="button" class="btn" data-open="${i}">Apri</button><button type="button" class="btn" data-gpx="${i}">GPX</button><button type="button" class="btn" data-del="${i}">Elimina</button></div></li>`).join("")}</ul>`
    : `<p class="note">Nessun giro salvato. Costruiscilo nella scheda Giro e premi «Salva».</p>`}`;
  el.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => openSaved(list[+b.dataset.open])));
  el.querySelectorAll("[data-gpx]").forEach((b) => b.addEventListener("click", () => {
    const r = list[+b.dataset.gpx], t = decodeTrack(r.track);
    sendToDevice(r.name || "Giro", String(r.name || "giro").replace(/[^\p{L}\p{N} _-]+/gu, "").trim().replace(/\s+/g, "_") + ".gpx",
      routeGpx(r.name || "Giro", t, (r.stops || []).filter((s) => s.name).map((s) => ({ lat: s.lat, lon: s.lon, name: s.name, sym: s.type === "pass" ? "Summit" : "Flag, Blue" }))));
  }));
  el.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
    if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "Conferma"; b.classList.add("pri"); return; }   // two taps: no confirm() dialogs
    try { await deleteRoute(u.uid, list[+b.dataset.del].id); fillRides(u); } catch { toast("Non eliminato"); }
  }));
}
function rideVisible(on) {
  for (const id of ["route-case", "route-line", "route-surf"]) if (map.getLayer && map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
}
function paintRoute() {
  const a = map.getSource && map.getSource("route"), b = map.getSource && map.getSource("route-surf");
  if (!a || !b) return;
  a.setData({ type: "FeatureCollection", features: G.side ? (G.res.noEle ? [{ type: "Feature", properties: { c: "#C8F560" }, geometry: { type: "LineString", coordinates: G.res.track.map((q) => [q[1], q[0]]) } }] : routeFeatures(G.side)) : [] });
  b.setData({ type: "FeatureCollection", features: G.res ? surfaceFeatures(G.res.track, G.res.segs) : [] });
}
function fitRoute() {
  if (!G.res) return;
  clearPad();
  const t = G.res.track, lons = t.map((q) => q[1]), lats = t.map((q) => q[0]);
  const pad = DESKTOP() ? { top: 80, bottom: 60, left: 480, right: 60 } : { top: 70, bottom: sheetPx() + 20, left: 30, right: 30 };
  map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: pad, duration: 900, maxZoom: 13 });
}

function renderGiro() {
  const n = G.stops.length, r = G.res, sd = G.side;
  const stops = G.stops.map((s, i) => `<li><span class="wp ${i === 0 ? "a" : i === n - 1 && i ? "z" : ""}">${i + 1}</span><span class="nm">${esc(stopName(s, i))}</span>
    <button type="button" class="ib sm" data-mv="${i}:-1" aria-label="Sposta su" ${i ? "" : "disabled"}>↑</button><button type="button" class="ib sm" data-mv="${i}:1" aria-label="Sposta giù" ${i < n - 1 ? "" : "disabled"}>↓</button><button type="button" class="ib sm" data-rm="${i}" aria-label="Togli tappa">${ICON.close}</button></li>`).join("");
  let body = "", sum = "";
  if (G.busy) body = `<p class="note" data-peek>Calcolo il percorso…</p>`;
  else if (G.err) body = `<p class="note" data-peek>${esc(G.err)}</p>`;
  else if (r && sd) {
    const sh = r.noEle ? null : profileShapes(sd, 680, 160, 8), shares = surfaceShares(r.surf), tot = G.eta ? G.eta[G.eta.length - 1] : null;
    sum = `<div class="strip" data-peek>
        <div><b>${num(r.km, r.km < 100 ? 1 : 0)}</b><span>km</span></div>
        <div><b>${r.gain != null ? "+" + esc(r.gain) : "–"}</b><span>metri</span></div>
        <div><b>${r.noEle ? "–" : clock(tot)}</b><span>in sella</span></div>
        <div><b>${sh ? esc(sh.hi) : "–"}</b><span>quota max</span></div></div>`;
    body = `${r.noEle ? `<p class="note small">Percorso di riserva (OSRM): senza quote né fondo.</p>` : ""}
      ${sh ? `<figure class="prof" id="giroProf">${profSvg(sd, 170, 8, "Profilo del giro")}
        <figcaption><span>0 km</span><span>${num(r.km, 0)} km</span></figcaption></figure>` : ""}
      ${shares.length ? `<div class="surf">${shares.map((x) => `<span class="${esc(x.k)}">${esc(x.k)} ${x.pct}%</span>`).join("")}</div>` : ""}
      <p class="note small mu">Tempo stimato a ${num(myWkg() || 3)} W/kg${myWkg() ? "" : " (impostalo nella scheda di una salita)"}, soste escluse.</p>
      ${G.on.length ? `<section class="sec"><h3>Salite sul percorso</h3><div class="cards">${G.on.map((x) => `<a class="card" href="#/s/${esc(encodeURIComponent(x.c.id))}" style="text-decoration:none;color:inherit"><span class="badge" style="background:${difficultyColor(x.c.difficulty || 0)}">${x.c.difficulty ? x.c.difficulty + "/10" : "–"}</span><span class="nm">${esc(x.c.name)}</span><span class="mt">km ${num(x.km, 0)}${x.c.elevation ? " · " + esc(x.c.elevation) + " m" : ""}</span></a>`).join("")}</div></section>` : ""}
      <section class="sec" id="gwx"><h3>Meteo lungo il giro</h3>
        <div class="when"><div class="sides" role="group" aria-label="Giorno">${["Oggi", "Domani", "Dopodomani"].map((l, i) => `<button type="button" data-day="${i}" aria-pressed="${G.day === i}">${l}</button>`).join("")}</div>
        <label>Partenza <input type="time" id="gstart" value="${esc(G.start)}" step="900"></label></div>
        <div id="gwxt"><p class="note">Carico…</p></div></section>
      <section class="sec" id="gwater"><h3>Acqua lungo il giro</h3><p class="note">Cerco fontane vicino alla strada…</p></section>`;
  } else body = `<p class="note" data-peek>${n ? "Aggiungi almeno un'altra tappa." : "Tocca la mappa per mettere la partenza, poi le tappe. Puoi toccare anche una salita, o usare «+ Giro» nella sua scheda."}</p>`;
  panel.innerHTML = `<div class="handle"></div><div class="cl giro">
    <div class="ph" style="padding:4px 0 10px"><h2>Il tuo giro</h2><small>${n ? n + (n === 1 ? " tappa" : " tappe") : "nessuna tappa"}</small></div>
    ${sum}
    ${n ? `<ol class="stops">${stops}</ol>` : ""}
    <div class="sides" role="group" aria-label="Tipo di strada">${PROFILES.map(([k, l]) => `<button type="button" data-prof="${k}" aria-pressed="${G.profile === k}">${l}</button>`).join("")}</div>
    ${body}
    <div class="actions">${r ? `<button type="button" class="btn pri" id="gsend">Manda al dispositivo</button><button type="button" class="btn" id="gsave">Salva</button><button type="button" class="btn" id="gprop">Proponi salita</button><button type="button" class="btn" id="ggpx">GPX</button><button type="button" class="btn" id="gshare">Condividi</button>` : ""}${n ? `<button type="button" class="btn" id="gclear">Svuota</button>` : ""}</div>
  </div>`;
  panel.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => { G.stops.splice(+b.dataset.rm, 1); giroChanged(); }));
  panel.querySelectorAll("[data-mv]").forEach((b) => b.addEventListener("click", () => { const [i, d] = b.dataset.mv.split(":").map(Number); const t = G.stops[i]; G.stops[i] = G.stops[i + d]; G.stops[i + d] = t; giroChanged(); }));
  panel.querySelectorAll("[data-prof]").forEach((b) => b.addEventListener("click", () => { G.profile = b.dataset.prof; giroChanged(); }));
  panel.querySelectorAll("[data-day]").forEach((b) => b.addEventListener("click", () => { G.day = +b.dataset.day; G.wx = null; renderGiro(); fillGiroWeather(G.seq); }));
  const gs = $("#gstart"); if (gs) gs.addEventListener("change", () => { G.start = gs.value || "08:00"; paintGiroWeather(); });
  const gg = $("#ggpx"); if (gg) gg.addEventListener("click", () => { const f = giroFile(); if (f) saveFile(f.name, f.text); });
  const gsv = $("#gsave"); if (gsv) gsv.addEventListener("click", saveGiroDialog);
  const gpr = $("#gprop"); if (gpr) gpr.addEventListener("click", proposeDialog);
  const gsd = $("#gsend"); if (gsd) gsd.addEventListener("click", () => { const f = giroFile(); if (f) sendToDevice(f.title, f.name, f.text); });
  const gh = $("#gshare"); if (gh) gh.addEventListener("click", shareGiroDialog);
  const gc = $("#gclear"); if (gc) gc.addEventListener("click", () => { G.title = ""; G.stops = []; G.res = null; G.side = null; G.on = []; paintRoute(); giroChanged(); });
  const gp = $("#giroProf"); if (gp) wireProfile(gp, sd, 170, 8);
  if (G.wx) paintGiroWeather();
  if (G.water) paintGiroWater();
  setSheet(S.giroOpen ? S.sheet : "peek", true); S.giroOpen = true;
}

/* weather at the start, at every climb on the way, at the top and at the finish - at the hour you get there */
function keyPoints() {
  const sd = G.side, L = sd.distance_km, n = sd.elevationProfile.length, at = (km) => Math.max(0, Math.min(n - 1, Math.round(km / L * (n - 1))));
  const pts = [{ name: "Partenza", i: 0 }];
  for (const x of G.on.slice(0, 6)) pts.push({ name: x.c.name, i: at(x.km) });
  const hi = highestIdx(sd.elevationProfile);
  if (!pts.some((p) => Math.abs(p.i - hi) <= 3)) pts.push({ name: "Punto più alto", i: hi });
  pts.push({ name: "Arrivo", i: n - 1 });
  return pts.sort((a, b) => a.i - b.i).map((p) => ({ ...p, lat: sd.track[p.i][0], lon: sd.track[p.i][1], ele: sd.elevationProfile[p.i], km: p.i / (n - 1) * L, min: G.eta ? G.eta[p.i] : p.i / (n - 1) * L / 24 * 60 }));
}
async function fillGiroWeather(seq) {
  if (!G.side) return;
  const pts = keyPoints();
  let h = null;
  try { h = await fetchForecast(pts, 3); } catch { h = null; }
  if (seq !== G.seq) return;
  G.wx = { pts, h }; paintGiroWeather();
}
function paintGiroWeather() {
  const el = $("#gwxt"); if (!el || !G.wx) return;
  const { pts, h } = G.wx;
  if (!h) { el.innerHTML = `<p class="note">Meteo non disponibile ora.</p>`; return; }
  const [hh, mm] = (G.start || "08:00").split(":").map(Number), t0 = hh * 60 + (mm || 0);
  const base = new Date(); base.setHours(0, 0, 0, 0); base.setDate(base.getDate() + G.day);
  const rows = pts.map((p, k) => {
    const at = new Date(base.getTime() + (t0 + p.min) * 60000), hk = at.getFullYear() + "-" + String(at.getMonth() + 1).padStart(2, "0") + "-" + String(at.getDate()).padStart(2, "0") + "T" + String(at.getHours()).padStart(2, "0") + ":00";
    const H = h[k] || {}, i = (H.time || []).indexOf(hk);
    const x = i >= 0 ? { temp: H.temperature_2m?.[i], pp: H.precipitation_probability?.[i], wind: H.wind_speed_10m?.[i], cape: H.cape?.[i] } : null;
    return `<tr><td>${esc(at.toLocaleTimeString(LOC, { hour: "2-digit", minute: "2-digit" }))}</td><td><b>${esc(p.name)}</b><br><span class="mu">km ${num(p.km, 0)} · ${esc(p.ele)} m</span></td>${x ? `<td><i class="st ${hourState(x)}"></i>${num(x.temp, 0)}°</td><td>${num(x.wind, 0)} km/h</td><td>${esc(x.pp ?? "–")}%</td>` : `<td colspan="3" class="mu">fuori previsione</td>`}</tr>`;
  }).join("");
  el.innerHTML = `<table class="vt wxt"><thead><tr><th>Ora</th><th>Dove</th><th>Temp.</th><th>Vento</th><th>Pioggia</th></tr></thead><tbody>${rows}</tbody></table>`;
}
async function fillGiroWater(seq) {
  if (!G.res || G.res.track.length < 2) return;
  const dense = asSide(G.res.track, Math.min(4000, Math.max(300, Math.round(G.res.km * 20))));
  let r = null;
  try { r = await poisNear(dense.track); } catch { r = null; }
  if (seq !== G.seq) return;
  G.water = r ? { covered: r.covered, list: alongTrack(dense, r.points.filter((p) => p.kind === "water"), 100) } : { covered: false, list: [] };
  paintGiroWater();
}
function paintGiroWater() {
  const el = $("#gwater"); if (!el || !G.water) return;
  const w = G.water.list;
  // gaps: the longest stretch without water
  let gap = 0, prev = 0;
  for (const x of w) { gap = Math.max(gap, x.km - prev); prev = x.km; }
  if (G.res) gap = Math.max(gap, G.res.km - prev);
  el.innerHTML = `<h3>Acqua lungo il giro</h3>${!w.length && !G.water.covered ? `<p class="note">Dati non ancora disponibili in questa zona.</p>` :
    `<p class="note">${w.length ? `<b>${w.length}</b> punti acqua entro 100 m · tratto più lungo senza: <b>${num(gap, 0)} km</b>` : "Nessun punto acqua mappato entro 100 m: parti con le borracce piene."}</p>
    ${w.length ? `<ul class="tips water">${w.slice(0, 15).map((x) => `<li><b>km ${num(x.km, 0)}</b> · ${esc(x.p.name || x.p.label)}</li>`).join("")}</ul>` : ""}
    <p class="note small mu">Nel GPX con punti utili trovi questi punti e le cime delle salite.</p>`}`;
}
/* the ride as GPX with useful points (summits, water) as waypoints */
function giroFile() {
  if (!G.res) return null;
  const wpts = [];
  G.stops.forEach((s, i) => { if (s.name) wpts.push({ lat: s.lat, lon: s.lon, name: s.name, sym: "Summit" }); else if (i === 0 || i === G.stops.length - 1) wpts.push({ lat: s.lat, lon: s.lon, name: stopName(s, i), sym: "Flag, Blue" }); });
  for (const x of G.on) if (!wpts.some((w) => Math.abs(w.lat - x.c.lat) < 1e-4 && Math.abs(w.lon - x.c.lon) < 1e-4)) wpts.push({ lat: x.c.lat, lon: x.c.lon, ele: x.c.elevation, name: x.c.name, sym: "Summit" });
  for (const x of (G.water && G.water.list) || []) wpts.push({ lat: x.p.lat, lon: x.p.lon, name: "Acqua" + (x.p.name ? " - " + x.p.name : ""), sym: "Drinking Water" });
  const name = "Giro LocaRide " + new Date().toLocaleDateString(LOC);
  const track = G.res.noEle ? G.res.track : G.res.track.map((q) => [q[0], q[1], q[2]]);
  return { title: name, name: "giro_locaride_" + num(G.res.km, 0) + "km.gpx", text: routeGpx(name, track, wpts) };
}
// the saved ride is drawn and routed only inside the Giro (outside it stayed on the map, 31/10)
map.once("load", () => { syncMarkers(); });

/* ------------------------------------------------------------------ interactive profile (lib/profile.mjs)
   A light elevation axis (start, finish and a few round values) and a cursor: move the mouse or the
   finger along the profile and a dot runs along the road on the map, with km, elevation and gradient;
   move the mouse along the road on the map and the cursor follows on the profile. */
const PW = 680 - AXIS_W;
let PROF = null;   // { v, fig, h, pad, lo, hi } of the profile on screen
function profSvg(v, h, pad, label) {
  const sh = profileShapes(v, PW, h, pad), p = v.elevationProfile || [];
  const ticks = yTicks(p[0], p[p.length - 1], sh.lo, sh.hi, h, pad);
  return `<svg class="pf" viewBox="0 0 680 ${h}" role="img" aria-label="${esc(label)}">
    <g class="ax">${ticks.map((t) => `<line x1="${AXIS_W}" x2="680" y1="${t.y}" y2="${t.y}"/><text x="${AXIS_W - 6}" y="${Math.max(11, Math.min(h - 2, t.y + 4))}" class="${t.kind}">${esc(t.e)}</text>`).join("")}</g>
    <g transform="translate(${AXIS_W},0)">${sh.segs.map((s) => `<path d="${s.d}" fill="${s.color}"/>`).join("")}<path d="${sh.line}" fill="none" stroke="#E8EDF2" stroke-width="2"/>
    <g class="cur" visibility="hidden"><line x1="0" x2="0" y1="0" y2="${h}"/><circle r="5.5" cx="0" cy="0"/></g></g></svg><div class="ptip" hidden></div>`;
}
function wireProfile(fig, v, h, pad) {
  if (!fig) return;
  const svg = fig.querySelector("svg"), p = v.elevationProfile || [];
  PROF = { v, fig, h, pad, lo: Math.min(...p), hi: Math.max(...p) };
  const at = (ev) => { const r = svg.getBoundingClientRect(); return kmAtX(v, (ev.clientX - r.left) / r.width * 680 - AXIS_W, PW); };
  let hideT = 0;
  svg.addEventListener("pointermove", (ev) => { clearTimeout(hideT); showCursor(at(ev), false); });
  svg.addEventListener("pointerdown", (ev) => { clearTimeout(hideT); showCursor(at(ev), false); });
  svg.addEventListener("pointerleave", (ev) => { if (ev.pointerType === "mouse") hideCursor(); else hideT = setTimeout(hideCursor, 1800); });
  svg.addEventListener("pointercancel", () => { hideT = setTimeout(hideCursor, 1800); });
}
let curRaf = 0, curKm = null, curFromMap = false;
function showCursor(km, fromMap) {
  curKm = km; curFromMap = fromMap;
  if (!curRaf) curRaf = requestAnimationFrame(paintCursor);
}
function paintCursor() {
  curRaf = 0;
  const P = PROF; if (!P || !P.fig.isConnected || curKm == null) return;
  const pt = pointAt(P.v, curKm), span = P.hi - P.lo || 1;
  const x = +(curKm / (kmAtX(P.v, PW, PW) || 1) * PW).toFixed(1), y = pt.ele == null ? P.h / 2 : +(P.h - P.pad - (pt.ele - P.lo) / span * (P.h - 2 * P.pad)).toFixed(1);
  const g = P.fig.querySelector(".cur"); g.setAttribute("visibility", "visible"); g.setAttribute("transform", `translate(${x},0)`); g.querySelector("circle").setAttribute("cy", y);
  const tip = P.fig.querySelector(".ptip"), fx = (AXIS_W + x) / 680;
  tip.hidden = false; tip.textContent = `km ${num(pt.km, 1)} · ${pt.ele != null ? pt.ele + " m" : "–"} · ${num(pt.grade, 1)}%`;
  tip.style.left = (fx * 100).toFixed(1) + "%"; tip.style.transform = `translateX(${fx > 0.75 ? "-100%" : fx < 0.25 ? "0" : "-50%"})`;
  tip.style.setProperty("--c", gradeColor(pt.grade));
  const src = map.getSource && map.getSource("cur");
  if (src && pt.lat != null && !curFromMap) src.setData({ type: "Feature", geometry: { type: "Point", coordinates: [pt.lon, pt.lat] }, properties: {} });
}
function hideCursor() {
  curKm = null;
  if (PROF && PROF.fig.isConnected) { const g = PROF.fig.querySelector(".cur"); if (g) g.setAttribute("visibility", "hidden"); const t = PROF.fig.querySelector(".ptip"); if (t) t.hidden = true; }
  const src = map.getSource && map.getSource("cur"); if (src) src.setData(EMPTY);
}
/* the road on the map drives the profile (mouse only: a finger on the map pans it) */
function mapCursor(e) {
  const P = PROF; if (!P || !P.fig.isConnected) return;
  const f = e.features && e.features[0];
  if (f && f.layer.id === "sel-line" && f.properties.sel !== 1) return;
  const km = kmNear(P.v, e.lngLat.lat, e.lngLat.lng); if (km == null) return;
  const src = map.getSource("cur"); if (src) src.setData({ type: "Feature", geometry: { type: "Point", coordinates: [e.lngLat.lng, e.lngLat.lat] }, properties: {} });
  showCursor(km, true);
}
map.once("style.load", () => { for (const id of ["sel-line", "route-line"]) { map.on("mousemove", id, mapCursor); map.on("mouseleave", id, hideCursor); } });

/* ------------------------------------------------------------------ share the ride: link, image, road book (lib/rideout.mjs) */
const giroUrl = () => location.origin + location.pathname + "#/giro?p=" + encodeStops(G.stops);
function rideData() {
  if (!G.res || !G.side) return null;
  const w = G.wx && G.wx.h ? weatherRows() : null;
  return {
    title: G.title || "", date: new Date(Date.now() + G.day * 864e5).toLocaleDateString(LOC, { weekday: "short", day: "numeric", month: "short", year: "numeric" }), lang: LANG,
    start: G.start, wkg: myWkg() || 3, url: giroUrl(), km: G.res.km, gain: G.res.gain, minutes: G.eta ? G.eta[G.eta.length - 1] : null,
    side: G.side, eta: G.eta, climbs: G.on.map((x) => ({ name: x.c.name, km: x.km, elevation: x.c.elevation, difficulty: x.c.difficulty })),
    water: ((G.water && G.water.list) || []).map((x) => ({ km: x.km, name: x.p.name || x.p.label || "" })),
    stops: G.stops.map((s, i) => ({ lat: s.lat, lon: s.lon, name: s.name || (i === 0 ? "Partenza" : i === G.stops.length - 1 ? "Arrivo" : "") })), weather: w
  };
}
/* the same numbers as the weather table of the Giro, for the road book */
function weatherRows() {
  const { pts, h } = G.wx, [hh, mm] = (G.start || "08:00").split(":").map(Number), t0 = hh * 60 + (mm || 0);
  const base = new Date(); base.setHours(0, 0, 0, 0); base.setDate(base.getDate() + G.day);
  return pts.map((p, k) => {
    const at = new Date(base.getTime() + (t0 + p.min) * 60000), hk = at.getFullYear() + "-" + String(at.getMonth() + 1).padStart(2, "0") + "-" + String(at.getDate()).padStart(2, "0") + "T" + String(at.getHours()).padStart(2, "0") + ":00";
    const H = h[k] || {}, i = (H.time || []).indexOf(hk);
    return { name: p.name, km: p.km, temp: i >= 0 ? H.temperature_2m?.[i] : null, wind: i >= 0 ? H.wind_speed_10m?.[i] : null, pp: i >= 0 ? H.precipitation_probability?.[i] : null };
  });
}
function shareGiroDialog() {
  openDialog(`<div class="dform shr"><div class="dh"><h2>Condividi il giro</h2><button type="button" class="ib" data-close aria-label="Chiudi">${ICON.close}</button></div>
    <button type="button" class="opt" id="shLink"><span class="oi">${ICON.share}</span><span><b>Link del giro</b><small>Chi lo apre vede lo stesso percorso in LocaRide</small></span></button>
    <button type="button" class="opt" id="shImg"><span class="oi"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 16l5-5 4 4 3-3 6 6"/></svg></span><span><b>Immagine</b><small>Per Instagram, WhatsApp, Strava: tracciato, profilo e numeri</small></span></button>
    <button type="button" class="opt" id="shBook"><span class="oi"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M7 14h10v7H7z"/></svg></span><span><b>Road book da stampare</b><small>Una pagina A4 con profilo, salite, orari, acqua e meteo. Anche in PDF</small></span></button>
    <div id="shOut"></div></div>`);
  $("#shLink").addEventListener("click", async () => { const url = giroUrl(); try { if (navigator.share) await navigator.share({ title: "Il mio giro · LocaRide", url }); else { await navigator.clipboard.writeText(url); toast("Link copiato"); } } catch { /* cancelled */ } });
  $("#shImg").addEventListener("click", shareImage);
  $("#shBook").addEventListener("click", printRoadbook);
}
async function shareImage() {
  const d = rideData(), out = $("#shOut"); if (!d || !out) return;
  out.innerHTML = `<p class="note">Preparo l'immagine…</p>`;
  try { await Promise.all([document.fonts.load("italic 800 80px 'Barlow Condensed'"), document.fonts.load("800 80px 'Barlow Condensed'"), document.fonts.load("600 30px Barlow")]); } catch { /* system font */ }
  const cv = document.createElement("canvas"); cv.width = CARD_W; cv.height = CARD_H;
  drawCard(cv.getContext("2d"), d);
  const blob = await new Promise((r) => cv.toBlob(r, "image/png"));
  if (!blob || !$("#shOut")) return;
  const name = "giro_locaride_" + num(d.km, 0) + "km.png", file = new File([blob], name, { type: "image/png" }), url = URL.createObjectURL(blob);
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
  out.innerHTML = `<img class="shimg" src="${url}" alt="Anteprima dell'immagine del giro">
    <div class="actions" style="position:static">${canShare ? `<button type="button" class="btn pri" id="shGo">Condividi</button>` : ""}<button type="button" class="btn ${canShare ? "" : "pri"}" id="shDl">Scarica</button></div>`;
  const go = $("#shGo"); if (go) go.addEventListener("click", async () => { try { await navigator.share({ files: [file], title: "Il mio giro · LocaRide" }); } catch { /* cancelled */ } });
  requestAnimationFrame(() => { const dl = $("#shDl"); if (dl) dl.scrollIntoView({ block: "end", behavior: "smooth" }); });
  $("#shDl").addEventListener("click", () => { const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); });
}
function printRoadbook() {
  const d = rideData(); if (!d) return;
  const html = roadbookHtml(d), url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const w = window.open(url, "_blank");
  if (!w) { saveFile("roadbook_locaride_" + num(d.km, 0) + "km.html", html, "text/html"); toast("Road book scaricato: aprilo e stampa"); }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* ------------------------------------------------------------------ install (lib/install.mjs)
   One tap where the browser allows it (beforeinstallprompt, captured in index.html), the Share-sheet
   steps on iPhone, the browser menu otherwise. A card suggests it to people who come back or are
   using the app (never on the very first look, never again for 30 days after "Non ora"); the Diario
   keeps a permanent entry. */
const INST_KEY = "lr_install";
const instState = () => { try { return JSON.parse(localStorage.getItem(INST_KEY)) || {}; } catch { return {}; } };
const instSave = (st) => { try { localStorage.setItem(INST_KEY, JSON.stringify(st)); } catch { /* private mode */ } };
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const instMode = () => installMode({ standalone: standalone() || (window.LR_INSTALL && LR_INSTALL.installed), prompt: !!(window.LR_INSTALL && LR_INSTALL.prompt), ua: navigator.userAgent });
const IOS_SHARE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M6 11H5v10h14V11h-1"/></svg>`;

async function doInstall() {
  const m = instMode();
  if (m === "prompt") {
    const e = LR_INSTALL.prompt; LR_INSTALL.prompt = null;      // the event can be used once
    hideInstallCard();
    try { await e.prompt(); const r = await e.userChoice; if (r && r.outcome === "accepted") toast("Installata: la trovi nella schermata Home"); } catch { /* dismissed */ }
    return;
  }
  hideInstallCard();
  openDialog(`<div class="dform inst"><div class="dh"><h2>LocaRide sul telefono</h2><button type="button" class="ib" id="instX" aria-label="Chiudi">${ICON.close}</button></div>
    ${m === "ios" ? `<ol class="steps"><li><span>Tocca</span> <b class="key">${IOS_SHARE}</b> <span>Condividi, nella barra del browser</span></li><li><span>Scorri e scegli</span> <b>Aggiungi alla schermata Home</b></li><li><span>Conferma con</span> <b>Aggiungi</b></li></ol>`
      : `<ol class="steps"><li><span>Apri il menu del browser</span> <b class="key">⋮</b></li><li><span>Scegli</span> <b>Installa app</b> <span>(o «Aggiungi a schermata Home»)</span></li></ol><p class="note">Se nel menu c'è «Apri app», LocaRide è già installata: aprila dall'icona.</p>`}
    <p class="note">Si apre dall'icona, a tutto schermo, e ricorda le ultime salite anche con poco campo.</p></div>`);
  $("#instX").addEventListener("click", closeDialog);
}

function installSec() {
  const m = instMode();
  if (m === "none") return "";
  return `<section class="sec" id="instSec"><h3>App sul telefono</h3><p class="note">Icona nella schermata Home, a tutto schermo, più veloce ad aprirsi.</p>
    <div class="actions" style="position:static"><button type="button" class="btn" id="instBtn">${m === "prompt" ? "Installa LocaRide" : "Come installarla"}</button></div></section>`;
}
function wireInstallSec() { const b = $("#instBtn"); if (b) b.addEventListener("click", doInstall); }

function hideInstallCard() { const c = $("#instCard"); if (c) { c.classList.remove("on"); setTimeout(() => c.remove(), 250); } }
function nudgeInstall(engaged = false) {
  const m = instMode(), st = instState(), md = panel.dataset.mode;
  if ($("#instCard") || md === "climb" || md === "giro" || !shouldNudge(m, st, Date.now(), engaged)) return;
  const c = document.createElement("div");
  c.id = "instCard"; c.className = "instcard"; c.setAttribute("role", "dialog"); c.setAttribute("aria-label", "Installa LocaRide");
  c.innerHTML = `<img src="apple-touch-icon.png" width="48" height="48" alt=""><div class="it"><b>App LocaRide</b><span>Dalla Home, a tutto schermo</span></div>
    <button type="button" class="ib" id="instNo" aria-label="Non ora">${ICON.close}</button><button type="button" class="btn pri" id="instGo">${m === "prompt" ? "Installa" : "Come fare"}</button>`;
  document.body.appendChild(c);
  requestAnimationFrame(() => c.classList.add("on"));
  $("#instGo").addEventListener("click", doInstall);
  $("#instNo").addEventListener("click", () => { instSave(snooze(instState())); hideInstallCard(); });
  setTimeout(() => { if ($("#instCard")) { instSave(snooze(instState(), Date.now(), SEEN_DAYS)); hideInstallCard(); } }, 10000);   // a hint, not a wall: gone after 10 s
}
addEventListener("lr-install", () => {
  if (window.LR_INSTALL.installed) { hideInstallCard(); const s = $("#instSec"); if (s) s.remove(); return; }
  setTimeout(() => nudgeInstall(false), 20000);                 // a returning visitor: after 20 s of use, not on top of the first paint
});
instSave(countVisit(instState()));
addEventListener("load", () => setTimeout(() => onUser((u) => paintTabAvatar(u)), 2500), { once: true });
if (instMode() !== "none") setTimeout(() => nudgeInstall(false), 20000);   // the dialog may have been offered before this module ran

/* Service worker (sw.js, shared with the classic app): installable everywhere and a last copy of the page
   and the climbs for a mountain without signal. Registered after the first paint, never in its way. */
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  addEventListener("load", () => setTimeout(() => navigator.serviceWorker.register(new URL("../sw.js", import.meta.url)).catch(() => { /* not fatal */ }), 4000), { once: true });
}

/* ------------------------------------------------------------------ icons */
const ICON = {
  back: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>`,
  share: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v13M7 8l5-5 5 5M5 14v6h14v-6"/></svg>`,
  close: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`
};

startI18n(LANG);
