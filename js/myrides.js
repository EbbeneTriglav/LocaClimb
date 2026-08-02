/* ===========================================================================
   LocaRide - "I miei giri"
   Salvataggio dei percorsi nel profilo dell'utente (Firestore) e pagina
   personale per riaprirli, duplicarli, esportarli (GPX / TCX) o eliminarli.

   NOTA TECNICA IMPORTANTE
   Firestore NON supporta array dentro array: rbTrack e' un array di
   [lat,lon,ele], quindi salvarlo cosi' com'e' fallirebbe. La traccia viene
   percio' serializzata in una STRINGA compatta "lat,lon,ele;lat,lon,ele;..."
   con precisione ridotta (5 decimali ~ 1 m). Questo risolve due problemi in
   un colpo: compatibilita' con Firestore e dimensione del documento (il
   limite e' 1 MB).

   Dipendenze (gia' presenti nell'app): FB, FBUSER, rbStops, rbTrack, rbMode,
   toggleRB, resetRoute, updateRBList, drawRouteLine, finishRoute, trackDist,
   trackAscent, setPanel, esc, gpxEsc, generateGPX, saveGPX, acctOpen, flashInfo.
   =========================================================================== */

var MAX_TRACK_PTS = 6000;     // oltre questa soglia la traccia viene ricampionata
var myRidesCache = [];

/* ------------------------- serializzazione traccia ------------------------- */

function trackToStr(t) {
  var out = [];
  for (var i = 0; i < t.length; i++) {
    var e = t[i][2];
    out.push(t[i][0].toFixed(5) + "," + t[i][1].toFixed(5) + "," + (e == null ? "" : Math.round(e)));
  }
  return out.join(";");
}
function strToTrack(s) {
  if (!s) return [];
  return s.split(";").map(function (p) {
    var a = p.split(",");
    return [parseFloat(a[0]), parseFloat(a[1]), (a[2] === "" || a[2] == null) ? null : parseFloat(a[2])];
  });
}
/* Ricampiona mantenendo sempre primo e ultimo punto. */
function fitTrack(t, maxPts) {
  if (t.length <= maxPts) return t;
  var out = [], step = (t.length - 1) / (maxPts - 1);
  for (var i = 0; i < maxPts - 1; i++) out.push(t[Math.round(i * step)]);
  out.push(t[t.length - 1]);
  return out;
}

/* ------------------------------- salvataggio ------------------------------- */

function saveRide() {
  if (!window.FB || !FBUSER) { flashInfo("Accedi per salvare il giro."); if (typeof acctOpen === "function") acctOpen(); return; }
  if (!rbTrack || rbTrack.length < 2) { flashInfo("Calcola prima un percorso."); return; }

  var suggested = rbStops.map(function (s) { return s.name; }).join(" - ").substring(0, 60);
  var name = prompt("Nome del giro:", suggested || "Il mio giro");
  if (name == null) return;                       // annullato
  name = (name.trim() || suggested || "Il mio giro").substring(0, 80);

  var track = fitTrack(rbTrack, MAX_TRACK_PTS);
  var enc = trackToStr(track);
  if (enc.length > 900000) { track = fitTrack(rbTrack, 3000); enc = trackToStr(track); }

  var stops = (rbStops || []).map(function (s) {
    return { type: s.type || "point", name: String(s.name || "").substring(0, 80), lat: s.lat, lon: s.lon, elevation: (s.elevation == null ? null : s.elevation) };
  });

  flashInfo("Salvataggio…");
  FB.db.collection("users").doc(FBUSER.uid).collection("routes").add({
    name: name,
    stops: stops,
    track: enc,
    pts: track.length,
    distKm: +trackDist(rbTrack).toFixed(2),
    ascent: trackAscent(rbTrack),
    savedAt: Date.now()
  }).then(function () {
    flashInfo("&#x2705; Giro salvato nel tuo profilo.");
  }).catch(function (e) {
    flashInfo("Errore nel salvataggio: " + (e.message || e));
  });
}

/* ------------------------------ pagina profilo ----------------------------- */

function openMyRides() {
  if (!window.FB || !FBUSER) { if (typeof acctOpen === "function") acctOpen(); return; }
  var dp = document.getElementById("dp"); if (!dp) return;
  dp.innerHTML = mrHeader() + '<div class="dp-body"><p style="color:var(--txt2)">Carico i tuoi giri&#8230;</p></div>';
  setPanel("dp", true);

  FB.db.collection("users").doc(FBUSER.uid).collection("routes")
    .orderBy("savedAt", "desc").limit(100).get()
    .then(function (snap) {
      myRidesCache = [];
      snap.forEach(function (d) { var o = d.data(); o.id = d.id; myRidesCache.push(o); });
      renderMyRides();
    })
    .catch(function (e) {
      dp.innerHTML = mrHeader() + '<div class="dp-body"><p style="color:var(--err)">Impossibile caricare i giri: ' + esc(e.message || String(e)) + '</p></div>';
    });
}

function mrHeader() {
  var who = FBUSER ? (FBUSER.displayName || FBUSER.email || "") : "";
  return '<div class="dp-hdr"><div style="display:flex;justify-content:space-between;align-items:start"><div>'
    + '<h2 style="margin:0;font-size:1.3em">&#x1F6B5; I miei giri</h2>'
    + '<p style="margin:3px 0;opacity:.9">' + esc(who) + '</p>'
    + '</div><button data-act="closeD" style="background:rgba(255,255,255,.2);border:none;color:#fff;font-size:1.3em;cursor:pointer;border-radius:8px;padding:4px 10px">&#x2715;</button></div></div>';
}

function renderMyRides() {
  var dp = document.getElementById("dp"); if (!dp) return;
  var h = mrHeader() + '<div class="dp-body">';
  if (!myRidesCache.length) {
    h += '<p style="color:var(--txt2)">Non hai ancora salvato nessun giro.<br>Crea un percorso e premi <b>&#x1F4BE; Salva giro</b> nel pannello Percorso.</p>';
  } else {
    var tKm = 0, tAsc = 0;
    myRidesCache.forEach(function (r) { tKm += (r.distKm || 0); tAsc += (r.ascent || 0); });
    h += '<div class="rstats"><div>Giri<b>' + myRidesCache.length + '</b></div><div>Totale<b>' + tKm.toFixed(0) + ' km</b></div><div>Dislivello<b>' + tAsc + ' m</b></div></div>';
    myRidesCache.forEach(function (r, i) {
      var d = r.savedAt ? new Date(r.savedAt) : null;
      var ds = d ? ("0" + d.getDate()).slice(-2) + "/" + ("0" + (d.getMonth() + 1)).slice(-2) + "/" + d.getFullYear() : "";
      h += '<div style="border:1px solid var(--bdr);border-radius:12px;padding:11px 13px;margin:9px 0;background:var(--bg)">'
        + '<div style="font-weight:700;margin-bottom:3px">' + esc(r.name || "Giro") + '</div>'
        + '<div style="font-size:.8rem;color:var(--txt2);margin-bottom:8px">' + (r.distKm || 0).toFixed(1) + ' km &middot; &#x2197;&#xFE0F; ' + (r.ascent || 0) + ' m &middot; ' + (r.stops ? r.stops.length : 0) + ' tappe &middot; ' + ds + '</div>'
        + '<div style="display:flex;flex-wrap:wrap;gap:6px">'
        + '<button class="rb-btn go" data-act="rideOpen" data-i="' + i + '">Apri</button>'
        + '<button class="rb-btn" style="background:#0891b2" data-act="rideDup" data-i="' + i + '">Duplica</button>'
        + '<button class="rb-btn gpx" data-act="rideGpx" data-i="' + i + '">GPX</button>'
        + '<button class="rb-btn" style="background:#0d9488" data-act="rideTcx" data-i="' + i + '">TCX</button>'
        + '<button class="rb-btn rst" data-act="rideDel" data-i="' + i + '">Elimina</button>'
        + '</div></div>';
    });
    h += '<p style="font-size:.76rem;color:var(--txt2);margin-top:10px">&#x1F4A1; Per il <b>GPX con fontanelle e ristori</b>: apri il giro, calcola il meteo del percorso e usa &#x201C;GPX + punti utili&#x201D; (i punti utili dipendono dall\'orario in cui ci passi, quindi si calcolano al momento).</p>';
  }
  h += '</div>';
  dp.innerHTML = h;
}

/* --------------------------------- azioni ---------------------------------- */

function mrGet(i) { return myRidesCache[+i]; }

/* Carica un giro salvato sulla mappa, come se lo avessi appena calcolato. */
function rideLoad(r, renameCopy) {
  var track = strToTrack(r.track);
  if (track.length < 2) { alert("Traccia non valida."); return; }
  if (typeof rbMode !== "undefined" && !rbMode && typeof toggleRB === "function") toggleRB();
  if (typeof resetRoute === "function") resetRoute();

  rbStops = (r.stops || []).map(function (s) {
    return { type: s.type || "point", name: s.name || "Punto", lat: s.lat, lon: s.lon, elevation: s.elevation == null ? undefined : s.elevation };
  });
  rbTrack = track;
  updateRBList();
  drawRouteLine();
  finishRoute(trackDist(rbTrack), trackAscent(rbTrack), null, false);
  flashInfo((renameCopy ? "&#x1F4CB; Copia di " : "&#x2705; ") + esc(r.name || "giro") + " caricato");
}

function rideOpen(i) { var r = mrGet(i); if (r) rideLoad(r, false); }

/* Duplica: carica il giro e lo risalva come nuova copia, cosi' puoi modificarlo
   senza toccare l'originale. */
function rideDup(i) {
  var r = mrGet(i); if (!r) return;
  if (!FB || !FBUSER) return;
  FB.db.collection("users").doc(FBUSER.uid).collection("routes").add({
    name: ("Copia di " + (r.name || "giro")).substring(0, 80),
    stops: r.stops || [], track: r.track, pts: r.pts || 0,
    distKm: r.distKm || 0, ascent: r.ascent || 0, savedAt: Date.now()
  }).then(function () { openMyRides(); }).catch(function (e) { alert("Errore: " + (e.message || e)); });
}

function rideDel(i) {
  var r = mrGet(i); if (!r) return;
  if (!confirm("Eliminare definitivamente \"" + (r.name || "questo giro") + "\"?")) return;
  FB.db.collection("users").doc(FBUSER.uid).collection("routes").doc(r.id).delete()
    .then(function () { openMyRides(); }).catch(function (e) { alert("Errore: " + (e.message || e)); });
}

function mrFileName(name, ext) {
  var s = String(name || "giro").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return "locaride_" + (s || "giro") + "." + ext;
}

function rideGpx(i) {
  var r = mrGet(i); if (!r) return;
  saveGPX(gpxFromSaved(r), mrFileName(r.name, "gpx"));
}
function rideTcx(i) {
  var r = mrGet(i); if (!r) return;
  saveGPX(tcxFromSaved(r), mrFileName(r.name, "tcx"));
}

/* GPX da un giro salvato (senza doverlo prima caricare in mappa). */
function gpxFromSaved(r) {
  var track = strToTrack(r.track), now = new Date().toISOString();
  var g = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="LocaRide">\n';
  g += '<metadata><name>' + gpxEsc(r.name || "LocaRide") + '</name><time>' + now + '</time></metadata>\n';
  (r.stops || []).forEach(function (s) {
    g += '<wpt lat="' + (+s.lat).toFixed(6) + '" lon="' + (+s.lon).toFixed(6) + '">'
      + (s.elevation != null ? '<ele>' + Math.round(s.elevation) + '</ele>' : '')
      + '<name>' + gpxEsc(s.name || "") + '</name><sym>Flag, Blue</sym></wpt>\n';
  });
  g += '<trk><name>' + gpxEsc(r.name || "LocaRide") + '</name><trkseg>\n';
  track.forEach(function (c) {
    g += '<trkpt lat="' + c[0].toFixed(6) + '" lon="' + c[1].toFixed(6) + '">'
      + (c[2] != null ? '<ele>' + Math.round(c[2]) + '</ele>' : '') + '</trkpt>\n';
  });
  g += '</trkseg></trk>\n</gpx>';
  return g;
}

/* TCX "Course": formato Garmin. L'ordine degli elementi dentro <Course> e'
   vincolato dallo schema: Name, Lap, Track, Notes, CoursePoint. */
function tcxFromSaved(r) {
  var track = strToTrack(r.track);
  var name = String(r.name || "LocaRide").substring(0, 15);   // TCX: Name max 15 caratteri
  var meters = Math.round((r.distKm || 0) * 1000);
  var s = '<?xml version="1.0" encoding="UTF-8"?>\n';
  s += '<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" '
    + 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
    + 'xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 '
    + 'http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd">\n';
  s += '<Courses><Course>\n<Name>' + gpxEsc(name) + '</Name>\n';
  s += '<Lap><TotalTimeSeconds>0</TotalTimeSeconds><DistanceMeters>' + meters + '</DistanceMeters>'
    + '<BeginPosition><LatitudeDegrees>' + track[0][0].toFixed(6) + '</LatitudeDegrees><LongitudeDegrees>' + track[0][1].toFixed(6) + '</LongitudeDegrees></BeginPosition>'
    + '<EndPosition><LatitudeDegrees>' + track[track.length - 1][0].toFixed(6) + '</LatitudeDegrees><LongitudeDegrees>' + track[track.length - 1][1].toFixed(6) + '</LongitudeDegrees></EndPosition>'
    + '<Intensity>Active</Intensity></Lap>\n';
  s += '<Track>\n';
  track.forEach(function (c) {
    s += '<Trackpoint><Position><LatitudeDegrees>' + c[0].toFixed(6) + '</LatitudeDegrees><LongitudeDegrees>' + c[1].toFixed(6) + '</LongitudeDegrees></Position>'
      + (c[2] != null ? '<AltitudeMeters>' + Math.round(c[2]) + '</AltitudeMeters>' : '') + '</Trackpoint>\n';
  });
  s += '</Track>\n';
  (r.stops || []).forEach(function (st) {
    s += '<CoursePoint><Name>' + gpxEsc(String(st.name || "Tappa").substring(0, 10)) + '</Name>'
      + '<Time>1970-01-01T00:00:00Z</Time>'
      + '<Position><LatitudeDegrees>' + (+st.lat).toFixed(6) + '</LatitudeDegrees><LongitudeDegrees>' + (+st.lon).toFixed(6) + '</LongitudeDegrees></Position>'
      + '<PointType>Generic</PointType></CoursePoint>\n';
  });
  s += '</Course></Courses>\n</TrainingCenterDatabase>';
  return s;
}
