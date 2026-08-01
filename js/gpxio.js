/* ===========================================================================
   LocaRide - GPX I/O
   1) importGPX()      : carica un tracciato GPX fatto con un'altra app
                         (Strava, Komoot, Garmin, Wahoo...) e lo analizza
                         come un percorso costruito nell'app: profilo,
                         acqua sul percorso, meteo, ristori.
   2) downloadGPXRich(): esporta il GPX del percorso corrente arricchito
                         con i waypoint delle fontanelle e dei SOLI ristori
                         risultati APERTI all'ora stimata di passaggio.

   Nessuna dipendenza nuova: usa i globali gia' presenti (rbStops, rbTrack,
   routeWater, rwStops, rwData, map, L, hav, trackDist, trackAscent, interp,
   fetchElevs, drawRouteLine, finishRoute, updateRBList, toggleRB, ohOpen,
   rwEtaAt, gpxEsc, showRS/hideRS).
   =========================================================================== */

/* hook opzionale: rwStopFetch, a caricamento ristori completato, chiama questa
   callback se impostata (serve al download arricchito per auto-caricare i ristori). */
var rwStopsThen = null;

/* ----------------------------- IMPORT -------------------------------------- */

function pickGPX() {
  var inp = document.getElementById("gpx-file");
  if (inp) { inp.value = ""; inp.click(); }   // value reset: riselezionare lo stesso file riattiva change
}

function onGpxPicked(el) {
  if (el && el.files && el.files[0]) importGPX(el.files[0]);
}

function importGPX(file) {
  if (!file) return;
  if (file.size > 12 * 1024 * 1024) { alert("File troppo grande (max ~12 MB)."); return; }
  var reader = new FileReader();
  reader.onload = function (e) {
    try { parseAndLoadGPX(e.target.result, file.name); }
    catch (err) { console.error(err); alert("GPX non valido o non leggibile."); }
  };
  reader.onerror = function () { alert("Impossibile leggere il file."); };
  reader.readAsText(file);
}

function parseAndLoadGPX(text, fname) {
  var xml = new DOMParser().parseFromString(text, "application/xml");
  if (xml.getElementsByTagName("parsererror").length) throw new Error("parsererror");

  // Punti del tracciato: prima <trkpt> (traccia registrata), poi <rtept> (rotta pianificata).
  var nodes = xml.getElementsByTagName("trkpt");
  if (!nodes.length) nodes = xml.getElementsByTagName("rtept");
  if (nodes.length < 2) { alert("Nessun tracciato trovato nel GPX (servono <trkpt> o <rtept>)."); return; }

  var pts = [], eleCount = 0;
  for (var i = 0; i < nodes.length; i++) {
    var la = parseFloat(nodes[i].getAttribute("lat"));
    var lo = parseFloat(nodes[i].getAttribute("lon"));
    if (isNaN(la) || isNaN(lo)) continue;
    var eEl = nodes[i].getElementsByTagName("ele")[0];
    var ele = eEl ? parseFloat(eEl.textContent) : null;
    if (ele != null && !isNaN(ele)) eleCount++; else ele = null;
    pts.push([la, lo, ele]);
  }
  if (pts.length < 2) { alert("Coordinate insufficienti nel GPX."); return; }

  // Waypoint: <wpt> se presenti, altrimenti sintetizziamo Partenza/Arrivo dagli estremi.
  var stops = [];
  var wpts = xml.getElementsByTagName("wpt");
  for (var w = 0; w < wpts.length; w++) {
    var wla = parseFloat(wpts[w].getAttribute("lat"));
    var wlo = parseFloat(wpts[w].getAttribute("lon"));
    if (isNaN(wla) || isNaN(wlo)) continue;
    var nEl = wpts[w].getElementsByTagName("name")[0];
    stops.push({ type: "point", name: (nEl && nEl.textContent) || ("Waypoint " + (stops.length + 1)), lat: wla, lon: wlo });
  }
  var trkName = "";
  var trkEl = xml.getElementsByTagName("trk")[0];
  var nmEl = trkEl && trkEl.getElementsByTagName("name")[0];
  if (nmEl) trkName = nmEl.textContent;
  if (!stops.length) {
    stops = [
      { type: "point", name: (trkName ? trkName + " - " : "") + "Partenza", lat: pts[0][0], lon: pts[0][1], elevation: pts[0][2] || undefined },
      { type: "point", name: "Arrivo", lat: pts[pts.length - 1][0], lon: pts[pts.length - 1][1], elevation: pts[pts.length - 1][2] || undefined }
    ];
  }

  // Entra in modalita' percorso e sostituisce l'eventuale percorso in corso.
  if (typeof rbMode !== "undefined" && !rbMode && typeof toggleRB === "function") toggleRB();
  if (typeof resetRoute === "function") resetRoute();

  rbStops = stops;
  rbTrack = pts;
  updateRBList();
  drawRouteLine();

  var distKm = trackDist(rbTrack);
  function done() {
    var asc = trackAscent(rbTrack);
    finishRoute(distKm, asc, null, false);   // hasSurf=false: nessun dato fondo da GPX esterno
    flashInfo("&#x2705; GPX importato: " + distKm.toFixed(1) + " km" + (fname ? " &middot; " + fname : ""));
  }

  // Quote assenti/scarse (traccia senza barometro): le campioniamo da Open-Meteo, come il fallback OSRM.
  if (eleCount < 2 && typeof fetchElevs === "function") {
    if (typeof showRS === "function") showRS("Recupero quote dal profilo del terreno…");
    var n = Math.min(rbTrack.length, 100), samp = [], mapI = [];
    for (var k = 0; k < n; k++) { var j = Math.round(k * (rbTrack.length - 1) / (n - 1)); mapI.push(j); samp.push({ lat: rbTrack[j][0], lon: rbTrack[j][1] }); }
    fetchElevs(samp).then(function (ev) {
      for (var k2 = 0; k2 < n; k2++) rbTrack[mapI[k2]][2] = ev[k2];
      interp(rbTrack);
      if (typeof hideRS === "function") hideRS();
      done();
    }).catch(function () { if (typeof hideRS === "function") hideRS(); done(); });
  } else {
    done();
  }
}

function flashInfo(html) {
  var el = document.getElementById("rb-info");
  if (el) el.innerHTML = html;
}

/* --------------------------- EXPORT (arricchito) --------------------------- */

/* Mappa la categoria del ristoro sui simboli standard GPX (Garmin/OsmAnd/Komoot). */
function gpxSymForStop(kind) {
  if (kind === "Ristorante" || kind === "Fast food") return "Restaurant";
  if (kind === "Bar" || kind === "Pub" || kind === "Gelateria") return "Bar";
  if (kind === "Panetteria" || kind === "Alimentari") return "Convenience Store";
  return "Restaurant";
}

function gpxWpt(lat, lon, name, sym, desc, ele) {
  var s = '<wpt lat="' + (+lat).toFixed(6) + '" lon="' + (+lon).toFixed(6) + '">';
  if (ele != null) s += '<ele>' + Math.round(ele) + '</ele>';
  s += '<name>' + gpxEsc(name || "") + '</name>';
  if (desc) s += '<desc>' + gpxEsc(desc) + '</desc>';
  if (sym) s += '<sym>' + sym + '</sym>';
  s += '</wpt>\n';
  return s;
}

/* Costruisce il GPX: waypoint tappe + fontanelle + ristori aperti, poi la traccia. */
function generateGPXRich(openStops) {
  var now = new Date().toISOString();
  var g = '<?xml version="1.0" encoding="UTF-8"?>\n';
  g += '<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="LocaRide">\n';
  g += '<metadata><name>LocaRide Route</name><time>' + now + '</time></metadata>\n';

  // Tappe del percorso
  (rbStops || []).forEach(function (s) {
    g += gpxWpt(s.lat, s.lon, s.name, "Flag, Blue", null, s.elevation);
  });
  // Fontanelle / acqua (sempre incluse)
  (typeof routeWater !== "undefined" && routeWater ? routeWater : []).forEach(function (wp) {
    var d = "km " + wp.along.toFixed(1) + " · " + Math.round(wp.dist) + " m dal percorso"
      + (wp.pot === false ? " · potabilita' non garantita" : "");
    g += gpxWpt(wp.lat, wp.lon, wp.name || "Acqua", "Drinking Water", d, null);
  });
  // Ristori APERTI all'orario stimato
  (openStops || []).forEach(function (st) {
    var eta = rwEtaAt(st.along);
    var d = st.kind + " · km " + st.along.toFixed(1)
      + (eta ? " · aperto verso le " + gpxClock(eta) : "");
    g += gpxWpt(st.lat, st.lon, st.name, gpxSymForStop(st.kind), d, null);
  });

  // Traccia
  g += '<trk><name>' + gpxEsc((rbStops || []).map(function (s) { return s.name; }).join(" - ")) + '</name><trkseg>\n';
  (rbTrack || []).forEach(function (c) {
    g += '<trkpt lat="' + c[0].toFixed(6) + '" lon="' + c[1].toFixed(6) + '">'
      + (c[2] != null ? '<ele>' + Math.round(c[2]) + '</ele>' : '') + '</trkpt>\n';
  });
  g += '</trkseg></trk>\n</gpx>';
  return g;
}

function gpxClock(ms) { var d = new Date(ms); return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }

function saveGPX(str, fname) {
  var b = new Blob([str], { type: "application/gpx+xml" });
  var u = URL.createObjectURL(b);
  var a = document.createElement("a");
  a.href = u; a.download = fname;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(u);
}

/* Filtra i ristori attualmente caricati tenendo solo quelli aperti all'ETA. */
function openStopsNow() {
  if (typeof rwStops === "undefined" || !rwStops || typeof rwData === "undefined" || !rwData) return [];
  return rwStops.filter(function (s) { return ohOpen(s.oh, rwEtaAt(s.along)) === true; });
}

function downloadGPXRich() {
  if (!rbTrack || rbTrack.length < 2) { flashInfo("Nessun percorso da esportare."); return; }

  // Servono le previsioni per sapere a che ora ci passi (e quindi cosa e' aperto).
  if (typeof rwData === "undefined" || !rwData) {
    flashInfo("&#x26A0;&#xFE0F; Calcola prima il <b>Meteo del percorso</b>: serve per sapere quali ristori sono aperti quando ci passi.");
    return;
  }
  // Ristori non ancora caricati: li carichiamo al volo e poi scarichiamo.
  if (typeof rwStops === "undefined" || !rwStops) {
    var cb = document.getElementById("rw-stops");
    if (cb) cb.checked = true;
    flashInfo("Carico i ristori sul percorso…");
    rwStopsThen = function () { rwStopsThen = null; doRichDownload(); };
    if (typeof loadRwStops === "function") loadRwStops();
    return;
  }
  doRichDownload();
}

function doRichDownload() {
  var open = openStopsNow();
  var gpx = generateGPXRich(open);
  saveGPX(gpx, "locaride_route_poi.gpx");
  var water = (typeof routeWater !== "undefined" && routeWater) ? routeWater.length : 0;
  flashInfo("&#x2B07;&#xFE0F; GPX + punti utili: <b>" + water + "</b> acqua &middot; <b>" + open.length + "</b> ristori aperti.");
}
