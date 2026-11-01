/* ==========================================================================
 * mapux.js - la mappa che si legge a colpo d'occhio.
 *
 *  1. Base con rilievo (OpenTopoMap) come default; un pulsante torna alla mappa
 *     stradale. Se le tessere del rilievo non arrivano, si torna da soli a OSM.
 *  2. Tre livelli di lettura (passo 2 della nuova grafica, 29/10/2026):
 *     - lontano (zoom < 9): gruppi grigi con il numero, salite singole come punti colorati;
 *     - medio (9-11): un punto per salita, colore e grandezza per categoria, niente linee:
 *       con 18.000 salite le linee a questo zoom erano un groviglio;
 *     - vicino (da 12): le tracce colorate per categoria, con il punto in cima.
 *  5. Filtri per categoria (HC, 1a ... 4a) al posto della legenda: si vede solo quello che
 *     interessa, sulla mappa, nella striscia e nei gruppi. La scelta resta sul dispositivo.
 *  3. "Salite in vista": in basso le salite dell'area visibile, dalla piu' dura, con
 *     categoria, km, pendenza, dislivello e il profilo in miniatura. Tocco = apre.
 *  4. La legenda delle categorie sale in alto e lascia il basso alla striscia.
 *
 * Modulo autonomo, caricato per ultimo: non modifica il codice esistente, lo usa
 * (map, markers, osmPasses, PASSES_DATA, catColor, catLabel, catRank, ensureCat,
 * openOsmD, openD, applyFilters). Le funzioni mux* senza DOM sono pure e testate. ASCII.
 * ==========================================================================*/

var MUX = {
  DOTS_Z: 9,          // da questo zoom: un punto per salita al posto dei gruppi
  LINES_Z: 12,        // da questo zoom: anche le tracce
  MAX_DOTS: 3000,
  CATS: ["HC", "1", "2", "3", "4"],
  sel: null,          // categorie scelte (null = tutte)
  STRIP_Z: 9,         // da questo zoom: striscia "salite in vista"
  MAX_CARDS: 40,
  MAX_TRACKS: 900,    // oltre, si disegnano prima le piu' dure
  layer: null, renderer: null, byId: {}, timer: null, fallback: 0
};

function muxT(it, en) { try { return (window.gref && window.gref("LR_LANG") === "en") || window.LR_LANG === "en" ? en : it; } catch (e) { return it; } }
function muxEsc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function muxNum(x, d) { return String((+x).toFixed(d == null ? 1 : d)).replace(".", ","); }

/* ------------------------------------------------------------- pure */
var MUX_RANK = { HC: 5, "1": 4, "2": 3, "3": 2, "4": 1 };
function muxRank(cat) { return MUX_RANK[String(cat)] || 0; }
function muxGain(v) { return (v && v.endElevation != null && v.startElevation != null) ? v.endElevation - v.startElevation : 0; }
/* il versante "di riferimento" di un passo: il piu' duro (categoria, poi dislivello) */
function muxBestSide(p) {
  var best = null;
  (p.versanti || []).forEach(function (v) {
    if (!best) { best = v; return; }
    var a = muxRank(v.cat || p.cat), b = muxRank(best.cat || p.cat);
    if (a > b || (a === b && muxGain(v) > muxGain(best))) best = v;
  });
  return best;
}
/* passi nell'area, ordinati dal piu' duro: [{p, v, rank, gain}] */
function muxInView(passes, b) {
  var out = [];
  for (var i = 0; i < passes.length; i++) {
    var p = passes[i];
    if (!p || p.lat < b.s || p.lat > b.n || p.lon < b.w || p.lon > b.e) continue;
    var v = muxBestSide(p);
    if (!v) continue;
    out.push({ p: p, v: v, rank: muxRank(v.cat || p.cat), gain: muxGain(v) });
  }
  return out.sort(function (x, y) { return (y.rank - x.rank) || (y.gain - x.gain); });
}
/* categoria di un passo per i filtri: quella del versante piu' duro */
function muxCatOf(p) { var v = muxBestSide(p); return String((v && v.cat) || p.cat || ""); }
/* sel = null (tutte) o array di categorie; senza categoria si vede solo con "tutte" */
function muxCatOk(p, sel) { if (!sel) return true; return sel.indexOf(muxCatOf(p)) >= 0; }
/* tocco su un filtro: da "tutte" si passa a quella sola; poi si aggiunge/toglie; vuoto = tutte */
function muxToggleCat(sel, c, all) {
  if (!sel) return [c];
  var out = sel.indexOf(c) >= 0 ? sel.filter(function (x) { return x !== c; }) : sel.concat([c]);
  return (!out.length || out.length === all.length) ? null : out;
}
/* raggio del punto: le salite dure si vedono prima */
function muxDotR(cat, z) { return 3 + muxRank(cat) + (z >= 12 ? 1 : 0); }
/* spessore: le salite dure si vedono di piu', le facili non coprono la mappa */
function muxWeight(cat, z) { var r = muxRank(cat); return (r >= 4 ? 5 : r >= 3 ? 4 : 3) + (z >= 12 ? 1 : 0); }
/* profilo in miniatura: path SVG "area" da elevationProfile */
function muxSpark(prof, w, h) {
  if (!prof || prof.length < 2) return "";
  var mn = Infinity, mx = -Infinity, i;
  for (i = 0; i < prof.length; i++) { if (prof[i] < mn) mn = prof[i]; if (prof[i] > mx) mx = prof[i]; }
  var span = Math.max(mx - mn, 30), d = "M0," + h;
  for (i = 0; i < prof.length; i++) d += " L" + (i / (prof.length - 1) * w).toFixed(1) + "," + (h - (prof[i] - mn) / span * (h - 2)).toFixed(1);
  return d + " L" + w + "," + h + " Z";
}

/* ------------------------------------------------------------ base map */
/* L'app ha gia' il selettore delle mappe (OSM, CyclOSM, Topo, Ortofoto): non ne
   aggiungiamo un altro. Scegliamo "Topo" come partenza, ricordiamo l'ultima scelta
   dell'utente e, se le tessere del rilievo non arrivano, torniamo da soli a OSM. */
function muxPickBase(name) {
  var labs = document.querySelectorAll(".leaflet-control-layers-base label");
  for (var i = 0; i < labs.length; i++) {
    if ((labs[i].textContent || "").trim() !== name) continue;
    var inp = labs[i].querySelector("input");
    if (inp && !inp.checked) inp.click();
    return true;
  }
  return false;
}
function muxWatchTopo() {
  map.eachLayer(function (l) {
    if (!l._url || !/opentopomap/.test(l._url) || l._muxW) return;
    l._muxW = 1;
    var errs = 0;
    l.on("tileerror", function () { if (++errs === 12) { MUX.fallback = 1; muxPickBase("OSM"); } });
  });
}
/* i colori delle salite devono vincere sul fondo: le mappe disegnate vengono smorzate,
   la foto aerea no (body.mux-photo) */
function muxPhotoClass() {
  var inp = document.querySelector(".leaflet-control-layers-base input:checked"), lab = inp && inp.closest("label");
  document.body.classList.toggle("mux-photo", !!(lab && /orto|sat|aer/i.test(lab.textContent || "")));
}
function muxBase() {
  if (!document.querySelector(".leaflet-control-layers-base label")) return;
  var want = "Topo";
  try { want = localStorage.getItem("lr_base_name") || "Topo"; } catch (e) {}
  if (!muxPickBase(want)) muxPickBase("Topo");
  map.on("baselayerchange", function (e) {
    if (!MUX.fallback) { try { localStorage.setItem("lr_base_name", e.name); } catch (x) {} }
    MUX.fallback = 0;
    muxWatchTopo(); muxPhotoClass();
  });
  muxWatchTopo(); muxPhotoClass();
}

/* ------------------------------------------------------- visible passes */
function muxVisiblePasses() {
  var out = [];
  try { PASSES_DATA.forEach(function (p) { if (muxCatOk(p, MUX.sel)) out.push(p); }); } catch (e) {}
  try {
    var useMarkers = typeof markers !== "undefined" && markers && markers.hasLayer;
    osmPasses.forEach(function (p) {
      if (!p.versanti || !p.versanti.length) return;
      if (useMarkers && p._marker && !markers.hasLayer(p._marker)) return;   // nascosto dai filtri
      if (!muxCatOk(p, MUX.sel)) return;
      out.push(p);
    });
  } catch (e) {}
  return out;
}
function muxOpen(p) {
  try { if (/^(osm|usr)-/.test(String(p.id))) openOsmD(p.id); else openD(p.id); } catch (e) {}
}
function muxColor(p, v) { try { return catColor((v && v.cat) || p.cat || null); } catch (e) { return "#64748b"; } }
function muxCatLabel(c) { try { return catLabel(c); } catch (e) { return String(c || "-"); } }

/* ------------------------------------------------------------- lines */
function muxBounds(pad) {
  var b = map.getBounds().pad(pad || 0);
  return { s: b.getSouth(), n: b.getNorth(), w: b.getWest(), e: b.getEast() };
}
function muxDrawLines() {
  if (!MUX.layer) { MUX.renderer = L.canvas({ padding: 0.3, tolerance: 6 }); MUX.layer = L.layerGroup().addTo(map); }
  MUX.layer.clearLayers(); MUX.byId = {};
  var z = map.getZoom(), on = z >= MUX.DOTS_Z, withLines = z >= MUX.LINES_Z;
  if (typeof markers !== "undefined" && markers) {
    if (on && map.hasLayer(markers)) markersWhenIdle(function () { if (map.getZoom() >= MUX.DOTS_Z && map.hasLayer(markers)) map.removeLayer(markers); });
    if (!on && !map.hasLayer(markers)) map.addLayer(markers);
  }
  document.body.classList.toggle("mux-lines", on);
  if (!on) return;
  var list = muxInView(muxVisiblePasses(), muxBounds(0.2)), n = 0, cap = withLines ? MUX.MAX_TRACKS : MUX.MAX_DOTS;
  list.reverse();                       // le piu' dure per ultime = disegnate sopra
  if (list.length > cap) list = list.slice(list.length - cap);
  var dim = document.body.classList.contains("dp-open");
  list.forEach(function (it) {
    var p = it.p, lines = [];
    (p.versanti || []).forEach(function (v) {
      if (!withLines || !v.track || v.track.length < 2) return;
      var col = muxColor(p, v);
      var ln = L.polyline(v.track.map(function (q) { return [q[0], q[1]]; }), {
        renderer: MUX.renderer, color: col, weight: muxWeight(v.cat || p.cat, z), opacity: dim ? 0.35 : 0.9, lineCap: "round", lineJoin: "round"
      });
      ln._muxW = muxWeight(v.cat || p.cat, z);
      ln.on("click", function () { muxOpen(p); });
      ln.bindTooltip(muxEsc(p.name) + (v.side ? " &middot; " + muxEsc(v.side) : "") + " &middot; " + muxNum(v.distance_km) + " km " + muxNum(v.avgGradient) + "%", { sticky: true });
      ln.addTo(MUX.layer); lines.push(ln); n++;
    });
    var dot = L.circleMarker([p.lat, p.lon], { renderer: MUX.renderer, radius: muxDotR(it.v.cat || p.cat, z), color: "#fff", weight: 1.5, fillColor: muxColor(p, it.v), fillOpacity: dim ? 0.45 : 1 });
    dot.on("click", function () { muxOpen(p); });
    dot.bindTooltip(muxEsc(p.name) + " &middot; " + muxNum(it.v.distance_km) + " km " + muxNum(it.v.avgGradient) + "%", { direction: "top", offset: [0, -6] });
    dot.addTo(MUX.layer);
    MUX.byId[p.id] = { lines: lines, dot: dot };
  });
  MUX.drawn = n;
}
function muxHighlight(id, on) {
  var h = MUX.byId[id]; if (!h) return;
  h.lines.forEach(function (l) { l.setStyle({ weight: on ? 8 : l._muxW }); if (on) l.bringToFront(); });
  if (on) h.dot.bringToFront();
}

/* ------------------------------------------------------------- strip */
function muxStyle() {
  if (document.getElementById("mux-style")) return;
  var css =
    "#mux-strip{position:fixed;left:10px;right:64px;bottom:10px;z-index:950;pointer-events:none}" +
    "#mux-strip .mux-head{pointer-events:auto;display:inline-flex;align-items:center;gap:8px;background:var(--bg2);color:var(--txt);border:1px solid var(--bdr);border-radius:20px;padding:5px 12px;font-size:.8rem;font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,.12);cursor:pointer;margin-bottom:6px}" +
    "#mux-strip .mux-row{pointer-events:auto;display:flex;gap:8px;overflow-x:auto;scroll-snap-type:x proximity;padding:2px 2px 6px;scrollbar-width:thin}" +
    "#mux-strip.closed .mux-row{display:none}" +
    ".mux-card{flex:0 0 172px;width:172px!important;min-width:0;max-width:none;scroll-snap-align:start;background:var(--bg2);color:var(--txt);border:1px solid var(--bdr);border-radius:12px;padding:8px 10px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.10);text-align:left;font:inherit}" +
    ".mux-card:hover{border-color:var(--ac)}" +
    ".mux-top{display:flex;align-items:center;gap:6px;min-height:34px}" +
    ".mux-cat{flex:0 0 auto;min-width:26px;height:20px;border-radius:6px;color:#fff;font-weight:800;font-size:.72rem;display:inline-flex;align-items:center;justify-content:center;padding:0 5px}" +
    ".mux-name{font-weight:700;font-size:.8rem;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}" +
    ".mux-card svg{display:block;width:100%;height:34px;margin:4px 0 2px}" +
    ".mux-meta{font-size:.72rem;color:var(--txt2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    /* la legenda diventa una fila di filtri */
    "#uk-legend{display:none!important}" +
    "body:not(.mux-photo) .leaflet-tile-pane{filter:saturate(.42) contrast(.96) brightness(1.05)}" +
    "#mux-chips{position:fixed;top:calc(var(--hdr) + 10px);left:50%;transform:translateX(-50%);z-index:960;display:flex;gap:6px;max-width:calc(100vw - 132px);overflow-x:auto;scrollbar-width:none;padding:2px}" +
    "#mux-chips::-webkit-scrollbar{display:none}" +
    "#mux-chips button{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 11px;border-radius:16px;border:1px solid var(--bdr);background:var(--bg2);color:var(--txt);font:inherit;font-size:.82rem;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(15,23,42,.12)}" +
    "#mux-chips button i{width:10px;height:10px;border-radius:50%;display:inline-block}" +
    "#mux-chips button.on{color:#fff;border-color:transparent}" +
    "#mux-chips button.on i{background:#fff!important;opacity:.85}" +
    "#mux-chips .mux-all{font-weight:600;color:var(--txt2)}" +
    "body[class*='-open'] #mux-chips{display:none}" +
    /* gruppi lontani: dischi grigi asfalto, non bolle blu */
    ".mux-cl{display:flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(35,40,46,.86);color:#fff;font-weight:800;font-size:12px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.25)}" +
    ".cat-pill{border-radius:50%!important;min-width:0!important;width:20px;height:20px!important;padding:0!important;line-height:17px!important;font-size:.66rem!important;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)}" +
    /* il basso e' della striscia: il resto sale quando e' aperta */
    "body.mux-strip-on #be-btn,body.mux-strip-on #lrc-fab{bottom:var(--mux-up)!important}" +
    "body[class*='-open'] #mux-strip{display:none}" +
    "@media (max-width:640px){" +
      "#mux-strip{left:6px;right:6px;bottom:58px}" +
      ".mux-card{flex-basis:150px;width:150px!important}" +
      "#mux-chips{max-width:calc(100vw - 112px);gap:5px}" +
      "#mux-chips button{height:30px;padding:0 8px;font-size:.78rem}" +
    "}";
  var s = document.createElement("style"); s.id = "mux-style"; s.textContent = css; document.head.appendChild(s);
}
function muxStrip() {
  var el = document.getElementById("mux-strip");
  if (!el) {
    el = document.createElement("div"); el.id = "mux-strip";
    if (window.matchMedia("(max-width:640px)").matches) el.className = "closed";   // su telefono parte chiusa
    el.innerHTML = '<div class="mux-head" id="mux-head"></div><div class="mux-row" id="mux-row"></div>';
    document.body.appendChild(el);
    el.querySelector("#mux-head").addEventListener("click", function () { el.classList.toggle("closed"); muxStrip(); });
    L.DomEvent.disableScrollPropagation(el);
  }
  var z = map.getZoom(), row = el.querySelector("#mux-row"), head = el.querySelector("#mux-head");
  if (z < MUX.STRIP_Z) { el.style.display = "none"; muxLift(); return; }
  var list = muxInView(muxVisiblePasses(), muxBounds(0));
  if (!list.length) { el.style.display = "none"; muxLift(); return; }
  el.style.display = "";
  var shown = list.slice(0, MUX.MAX_CARDS);
  head.innerHTML = (el.classList.contains("closed") ? "&#x25B4; " : "&#x25BE; ")
    + list.length + " " + (list.length === 1 ? muxT("salita in quest'area", "climb in this area") : muxT("salite in quest'area", "climbs in this area"))
    + (list.length > shown.length ? ' <span style="font-weight:400;color:var(--txt2)">(' + muxT("le " + shown.length + " piu' dure", "hardest " + shown.length) + ")</span>" : "");
  row.innerHTML = "";
  shown.forEach(function (it) {
    var p = it.p, v = it.v, col = muxColor(p, v), cat = v.cat || p.cat;
    var c = document.createElement("button");
    c.type = "button"; c.className = "mux-card";
    c.innerHTML = '<div class="mux-top"><span class="mux-cat" style="background:' + col + '">' + muxEsc(cat ? muxCatLabel(cat) : "-") + "</span>"
      + '<span class="mux-name">' + muxEsc(p.name) + "</span></div>"
      + '<svg viewBox="0 0 150 34" preserveAspectRatio="none"><path d="' + muxSpark(v.elevationProfile, 150, 34) + '" fill="' + col + '" fill-opacity=".28" stroke="' + col + '" stroke-width="1.5"/></svg>'
      + '<div class="mux-meta">' + muxNum(v.distance_km) + " km &middot; " + muxNum(v.avgGradient) + "% &middot; +" + Math.round(it.gain) + " m"
      + (v.side ? " &middot; " + muxEsc(v.side) : "") + "</div>";
    c.addEventListener("click", function () { muxOpen(p); });
    c.addEventListener("mouseenter", function () { muxHighlight(p.id, true); });
    c.addEventListener("mouseleave", function () { muxHighlight(p.id, false); });
    row.appendChild(c);
  });
  muxLift();
}
/* Bike Day e il pulsante admin salgono sopra la striscia quando e' visibile */
function muxLift() {
  var el = document.getElementById("mux-strip");
  var vis = el && getComputedStyle(el).display !== "none";
  document.body.classList.toggle("mux-strip-on", !!vis);
  if (vis) document.body.style.setProperty("--mux-up", (window.innerHeight - el.getBoundingClientRect().top + 8) + "px");
}

/* ------------------------------------------------------------- filtri */
function muxLoadSel() { try { var s = JSON.parse(localStorage.getItem("lr_cats") || "null"); MUX.sel = Array.isArray(s) && s.length ? s : null; } catch (e) { MUX.sel = null; } }
function muxSaveSel() { try { if (MUX.sel) localStorage.setItem("lr_cats", JSON.stringify(MUX.sel)); else localStorage.removeItem("lr_cats"); } catch (e) {} }
function muxChips() {
  var el = document.getElementById("mux-chips");
  if (!el) { el = document.createElement("div"); el.id = "mux-chips"; el.setAttribute("role", "toolbar"); el.setAttribute("aria-label", muxT("Filtra per categoria", "Filter by category")); document.body.appendChild(el); L.DomEvent.disableClickPropagation(el); }
  var h = "";
  MUX.CATS.forEach(function (c) {
    var on = !!(MUX.sel && MUX.sel.indexOf(c) >= 0), col = "#64748b";
    try { col = catColor(c); } catch (e) {}
    h += '<button type="button" data-cat="' + c + '" aria-pressed="' + on + '" class="' + (on ? "on" : "") + '" style="' + (on ? "background:" + col : "") + '"><i style="background:' + col + '"></i>' + (c === "HC" ? "HC" : c + "&ordf;") + "</button>";
  });
  if (MUX.sel) h += '<button type="button" class="mux-all" data-cat="*">' + muxT("Tutte", "All") + "</button>";
  el.innerHTML = h;
  Array.prototype.forEach.call(el.querySelectorAll("button"), function (b) {
    b.addEventListener("click", function () {
      var c = b.getAttribute("data-cat");
      MUX.sel = c === "*" ? null : muxToggleCat(MUX.sel, c, MUX.CATS);
      muxSaveSel(); muxChips();
      try { if (typeof applyFilters === "function") applyFilters(); else muxRefresh(); } catch (e) { muxRefresh(); }
    });
  });
}
/* i gruppi (zoom lontano) rispettano i filtri: addMarkers vede solo le categorie scelte */
function muxWrapMarkers() {
  if (typeof addMarkers !== "function" || addMarkers._mux) return;
  var am = addMarkers;
  addMarkers = function (data) {
    if (!MUX.sel) return am.apply(this, arguments);
    var keep = osmPasses;
    osmPasses = keep.filter(function (p) { return muxCatOk(p, MUX.sel); });
    try { return am.call(this, (data || []).filter(function (p) { return muxCatOk(p, MUX.sel); })); } finally { osmPasses = keep; }
  };
  addMarkers._mux = 1;
}
function muxClusterLook() {
  if (typeof markers === "undefined" || !markers || !markers.options || markers._muxLook) return;
  markers.options.iconCreateFunction = function (cl) {
    var n = cl.getChildCount(), s = n < 10 ? 26 : n < 100 ? 32 : 38;
    return L.divIcon({ html: '<div class="mux-cl" style="width:' + s + "px;height:" + s + 'px">' + n + "</div>", className: "", iconSize: [s, s] });
  };
  markers._muxLook = 1;
  try { markers.refreshClusters(); } catch (e) {}
}

/* ------------------------------------------------------------- wiring */
function muxRefresh() { clearTimeout(MUX.timer); MUX.timer = setTimeout(function () { try { muxDrawLines(); muxStrip(); } catch (e) { if (window.console) console.warn("[locaClimb] mapux: " + e.message); } }, 120); }
function muxStart() {
  if (typeof L === "undefined" || typeof map === "undefined" || !map || !map.getZoom) { setTimeout(muxStart, 400); return; }
  muxStyle(); muxBase(); muxLoadSel(); muxWrapMarkers(); muxClusterLook(); muxChips();
  if (MUX.sel) { try { applyFilters(); } catch (e) {} }
  map.on("moveend zoomend", muxRefresh);
  /* chi rimette le bolle sulla mappa mentre siamo in modalita' tracce viene "corretto" */
  map.on("layeradd", function (e) { if (typeof markers !== "undefined" && e.layer === markers && map.getZoom() >= MUX.DOTS_Z) setTimeout(function () { markersWhenIdle(function () { if (map.getZoom() >= MUX.DOTS_Z && map.hasLayer(markers)) map.removeLayer(markers); }); }, 0); });
  /* i filtri cambiano cosa e' visibile */
  if (typeof applyFilters === "function" && !applyFilters._mux) {
    var af = applyFilters;
    applyFilters = function () { var r = af.apply(this, arguments); muxRefresh(); return r; };
    applyFilters._mux = 1;
  }
  /* pannello aperto: le tracce si attenuano per non coprire la salita scelta */
  new MutationObserver(function () { muxRefresh(); }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  /* i versanti completi arrivano in background */
  try { if (typeof osmFullPending !== "undefined" && osmFullPending && osmFullPending.then) osmFullPending.then(muxRefresh, muxRefresh); } catch (e) {}
  window.addEventListener("resize", muxRefresh);
  muxRefresh();
}
if (typeof document !== "undefined" && document.addEventListener) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(muxStart, 300); }); else setTimeout(muxStart, 300);
}
