/* Meteo di percorso + ristori.
   ---------------------------------------------------------------------------
   L'idea non e' "che vento fa sul percorso" ma "che vento troverai al km 40 QUANDO ci arrivi tu".
   Quindi tutto parte da una TABELLA ORARIA: si stima la velocita' segmento per segmento in base
   alla pendenza (il profilo altimetrico ce l'abbiamo gia'), si ricava l'ora di passaggio in ogni
   punto, e solo allora si chiede la previsione per QUELL'ora in QUEL punto.

   Sorgente: Open-Meteo. Gratis, senza API key, CORS aperto, e - decisivo - accetta piu' coordinate
   in una sola chiamata, quindi l'intero percorso costa UNA richiesta invece di venti.

   Onesta' intellettuale: i modelli meteo hanno maglie di 2-11 km e NON risolvono la canalizzazione
   del vento nelle valli alpine. Per questo non mostriamo frecce "verita' rivelata" ma la componente
   proiettata sulla direzione di marcia (testa/coda/laterale), che e' l'unica cosa che al ciclista
   serve davvero ed e' meno sensibile all'errore di direzione. L'avviso di affidabilita' e' in UI. */

var RW_API = "https://api.open-meteo.com/v1/forecast";
var rwData = null;            // [{km,lat,lon,ele,t,bearing,wind,dir,gust,temp,rain,head,cross,kind}]
var rwLayer = null;           // frecce vento in mappa
var rwStops = null;           // ristori trovati
var rwStopLayer = null;
var RW_MAX_PTS = 24;          // punti campionati sul percorso (una sola chiamata Open-Meteo)

/* ---------- modello di velocita' ----------
   VAM (metri di dislivello all'ora) derivata dalla velocita' in piano dichiarata: chi tiene 22 in
   piano sale a ~750 m/h. In salita la velocita' e' VAM/pendenza, in discesa cresce con la pendenza
   ma satura (curve, tornanti, paura). Non modelliamo l'effetto del vento SULLA velocita': sarebbe
   circolare (il vento dipende dall'ora, l'ora dipende dalla velocita') e l'errore e' minore
   dell'incertezza della previsione stessa. */
function rwSpeed(gradient, flatKmh) {
  var vam = flatKmh * 34;                                  // 22 km/h in piano -> ~750 m/h di VAM
  if (gradient > 0.015) return Math.max(5, Math.min(flatKmh, vam / (gradient * 1000)));
  if (gradient < -0.015) return Math.min(55, flatKmh * (1 + 12 * Math.abs(gradient)));
  return flatKmh;
}
function rwBearing(a, b) {                                  // rotta in gradi, 0 = Nord
  var p = Math.PI / 180, y = Math.sin((b[1] - a[1]) * p) * Math.cos(b[0] * p);
  var x = Math.cos(a[0] * p) * Math.sin(b[0] * p) - Math.sin(a[0] * p) * Math.cos(b[0] * p) * Math.cos((b[1] - a[1]) * p);
  return (Math.atan2(y, x) / p + 360) % 360;
}
/* Campiona il percorso in RW_MAX_PTS punti e assegna a ognuno l'ORA DI PASSAGGIO stimata. */
function rwSchedule(startMs, flatKmh) {
  if (rbTrack.length < 2) return [];
  var cum = [0], t = startMs;
  for (var i = 1; i < rbTrack.length; i++) cum.push(cum[i - 1] + hav(rbTrack[i - 1][0], rbTrack[i - 1][1], rbTrack[i][0], rbTrack[i][1]));
  var total = cum[cum.length - 1];
  if (!total) return [];
  var times = [startMs];
  for (var i = 1; i < rbTrack.length; i++) {
    var dk = cum[i] - cum[i - 1];
    var dz = (rbTrack[i][2] != null && rbTrack[i - 1][2] != null) ? rbTrack[i][2] - rbTrack[i - 1][2] : 0;
    var g = dk > 0.002 ? dz / (dk * 1000) : 0;
    t += (dk / rwSpeed(g, flatKmh)) * 3600000;
    times.push(t);
  }
  var out = [], n = Math.min(RW_MAX_PTS, Math.max(4, Math.round(total / 6)));
  for (var k = 0; k < n; k++) {
    var target = total * k / (n - 1), i = 1;
    while (i < cum.length - 1 && cum[i] < target) i++;
    var j = Math.max(1, Math.min(rbTrack.length - 1, i));
    out.push({
      km: cum[j], lat: rbTrack[j][0], lon: rbTrack[j][1], ele: rbTrack[j][2],
      t: times[j], bearing: rwBearing(rbTrack[j - 1], rbTrack[Math.min(j + 1, rbTrack.length - 1)])
    });
  }
  return out;
}

/* ---------- previsione ---------- */
function loadRideWeather() {
  var dEl = document.getElementById("rw-when"), sEl = document.getElementById("rw-speed");
  if (!dEl || !rbTrack.length) return;
  var startMs = Date.parse(dEl.value);
  if (isNaN(startMs)) { rwMsg("Scegli data e ora di partenza."); return; }
  var flat = Math.max(10, Math.min(35, parseInt(sEl.value, 10) || 22));
  var pts = rwSchedule(startMs, flat);
  if (!pts.length) return;
  var last = pts[pts.length - 1];
  if (last.t - Date.now() > 15 * 864e5) { rwMsg("Le previsioni arrivano a 16 giorni: scegli una data piu' vicina."); return; }

  rwMsg("Previsioni in arrivo\u2026");
  var la = pts.map(function (p) { return p.lat.toFixed(4); }).join(",");
  var lo = pts.map(function (p) { return p.lon.toFixed(4); }).join(",");
  // timezone=UTC: confrontiamo tutto in UTC, cosi' non dobbiamo inseguire l'offset locale di ogni punto
  var url = RW_API + "?latitude=" + la + "&longitude=" + lo
    + "&hourly=temperature_2m,precipitation_probability,wind_speed_10m,wind_direction_10m,wind_gusts_10m"
    + "&timezone=UTC&forecast_days=16";
  fetch(url).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (d) {
    var arr = Array.isArray(d) ? d : [d];
    if (arr.length !== pts.length) throw 0;
    pts.forEach(function (p, i) {
      var h = arr[i] && arr[i].hourly; if (!h || !h.time) return;
      var idx = rwHourIndex(h.time, p.t); if (idx < 0) return;
      p.wind = h.wind_speed_10m[idx];
      p.dir = h.wind_direction_10m[idx];
      p.gust = h.wind_gusts_10m[idx];
      p.temp = h.temperature_2m[idx];
      p.rain = h.precipitation_probability ? h.precipitation_probability[idx] : null;
      // dir = direzione DA CUI soffia (convenzione meteo). Se coincide con la nostra rotta, e' vento in faccia.
      var rel = ((p.dir - p.bearing) + 540) % 360 - 180;     // -180..180
      p.rel = rel;
      p.head = p.wind * Math.cos(rel * Math.PI / 180);        // >0 contrario, <0 a favore
      p.cross = Math.abs(p.wind * Math.sin(rel * Math.PI / 180));
      p.kind = Math.abs(rel) < 50 ? "head" : Math.abs(rel) > 130 ? "tail" : "cross";
    });
    rwData = pts.filter(function (p) { return p.wind != null; });
    drawWindArrows(); drawWindStrip(); fillWeatherBox(flat);
    drawRouteProfile();
  }).catch(function () { rwMsg("Previsioni non disponibili (Open-Meteo non raggiungibile)."); });
}
function rwHourIndex(times, ms) {                            // l'ora piu' vicina all'orario di passaggio
  var best = -1, bd = Infinity;
  for (var i = 0; i < times.length; i++) {
    var d = Math.abs(Date.parse(times[i] + "Z") - ms);
    if (d < bd) { bd = d; best = i; }
  }
  return bd <= 5400000 ? best : -1;                          // oltre 90 min di scarto non e' la stessa ora
}
function rwMsg(s) { var b = document.getElementById("rwbox"); if (b) b.innerHTML = '<span style="color:var(--txt2)">' + s + "</span>"; }

/* ---------- colori: rosso = contrario, verde = a favore, grigio = laterale ---------- */
function windColor(p) {
  if (p.kind === "cross") return "#94a3b8";
  var m = Math.min(1, Math.abs(p.head) / 30);
  return p.kind === "head" ? "rgb(" + Math.round(190 + 65 * m) + ",68,68)" : "rgb(34," + Math.round(197 - 40 * m) + ",94)";
}
function windIcon(p) {
  // La freccia punta DOVE VA il vento (dir + 180), cosi' la lettura e' immediata: se punta come te, ti spinge.
  var rot = (p.dir + 180) % 360, c = windColor(p), s = Math.round(p.wind);
  return L.divIcon({
    className: "", iconSize: [40, 40], iconAnchor: [20, 20],
    html: '<div class="wind-ar" style="transform:rotate(' + rot + 'deg);color:' + c + '">'
      + '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M12 2 L17 13 L12 10.5 L7 13 Z"/></svg></div>'
      + '<div class="wind-lb" style="border-color:' + c + '">' + s + '</div>'
  });
}
function drawWindArrows() {
  if (rwLayer) { map.removeLayer(rwLayer); rwLayer = null; }
  if (!rwData || !rwData.length) return;
  rwLayer = L.layerGroup();
  rwData.forEach(function (p) {
    var tip = "km " + p.km.toFixed(1) + " &middot; " + rwClock(p.t) + "<br>"
      + Math.round(p.wind) + " km/h da " + compass16(p.dir) + " (raffiche " + Math.round(p.gust) + ")<br>"
      + "<b>" + rwKindLabel(p) + "</b><br>" + Math.round(p.temp) + "&deg;C"
      + (p.rain != null ? " &middot; pioggia " + p.rain + "%" : "");
    L.marker([p.lat, p.lon], { icon: windIcon(p) }).bindPopup(tip).addTo(rwLayer);
  });
  rwLayer.addTo(map);
}
function rwKindLabel(p) {
  if (p.kind === "cross") return "Laterale " + Math.round(p.cross) + " km/h";
  return (p.kind === "head" ? "Contrario " : "A favore ") + Math.round(Math.abs(p.head)) + " km/h";
}
function rwClock(ms) { var d = new Date(ms); return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }
function compass16(d) {
  var n = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSO","SO","OSO","O","ONO","NO","NNO"];
  return n[Math.round(((d % 360) / 22.5)) % 16];
}

/* ---------- fascia vento sotto l'altimetria ----------
   Canvas separato allineato all'asse dei km del profilo: strisce colorate per componente
   testa/coda + frecce. Non tocchiamo drawProfileCanvas: resta un solo posto da capire se si rompe. */
function drawWindStrip() {
  var c = document.getElementById("rwind"); if (!c || !rwData || !rwData.length) return;
  var w = c.clientWidth || 380, h = 54, dpr = window.devicePixelRatio || 1;
  c.width = w * dpr; c.height = h * dpr; c.style.height = h + "px";
  var x = c.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
  var total = rwData[rwData.length - 1].km || 1, PL = 34, PR = 8, iw = w - PL - PR;
  var xa = function (km) { return PL + iw * (km / total); };
  for (var i = 0; i < rwData.length; i++) {
    var p = rwData[i];
    var x0 = i === 0 ? PL : xa((rwData[i - 1].km + p.km) / 2);
    var x1 = i === rwData.length - 1 ? PL + iw : xa((p.km + rwData[i + 1].km) / 2);
    x.fillStyle = windColor(p); x.globalAlpha = 0.28; x.fillRect(x0, 16, x1 - x0, 22); x.globalAlpha = 1;
    var cx = (x0 + x1) / 2;
    x.save(); x.translate(cx, 27); x.rotate((p.dir + 180 - p.bearing) * Math.PI / 180); // relativa alla marcia: su = ti spinge
    x.fillStyle = windColor(p); x.beginPath(); x.moveTo(0, -7); x.lineTo(4, 4); x.lineTo(0, 1.5); x.lineTo(-4, 4); x.closePath(); x.fill();
    x.restore();
  }
  x.fillStyle = "#64748b"; x.font = "9px system-ui"; x.textAlign = "left";
  x.fillText("vento", 2, 30);
  x.textAlign = "center";
  x.fillText("\u2191 = ti spinge   \u2193 = in faccia", PL + iw / 2, 50);
  x.textAlign = "right"; x.fillText(Math.round(total) + " km", w - 2, 12);
}

/* ---------- riassunto + wind chill in discesa ---------- */
function fillWeatherBox(flatKmh) {
  var b = document.getElementById("rwbox"); if (!b || !rwData || !rwData.length) return;
  var arr = rwData, n = arr.length;
  var headKm = 0, tailKm = 0;
  for (var i = 1; i < n; i++) { var seg = arr[i].km - arr[i - 1].km; if (arr[i].kind === "head") headKm += seg; else if (arr[i].kind === "tail") tailKm += seg; }
  var end = arr[n - 1], dur = (end.t - arr[0].t) / 3600000;
  var top = arr.reduce(function (a, p) { return (p.ele != null && (!a || p.ele > a.ele)) ? p : a; }, null);
  var maxRain = arr.reduce(function (m, p) { return Math.max(m, p.rain || 0); }, 0);
  var worst = arr.reduce(function (a, p) { return (!a || p.head > a.head) ? p : a; }, null);

  var h = '<div class="rw-sum"><div>Arrivo<b>' + rwClock(end.t) + '</b></div><div>Durata<b>' + dur.toFixed(1) + ' h</b></div>'
    + '<div>Contrario<b>' + headKm.toFixed(0) + ' km</b></div><div>A favore<b>' + tailKm.toFixed(0) + ' km</b></div></div>';
  if (worst && worst.head > 8) h += '<div class="rw-hint">&#x1F4A8; Tratto peggiore: <b>' + Math.round(worst.head) + ' km/h in faccia</b> al km ' + worst.km.toFixed(0) + ', verso le ' + rwClock(worst.t) + '.</div>';
  if (maxRain >= 40) h += '<div class="rw-hint" style="background:#eff6ff;border-color:#bfdbfe">&#x1F327;&#xFE0F; Probabilita\' di pioggia fino al <b>' + maxRain + '%</b>.</div>';
  if (top && top.temp != null) {
    // In vetta fa freddo E ci si butta giu' a 40-50 all'ora: la temperatura percepita e' quella che ti
    // fa venire l'ipotermia, non quella del termometro. Formula wind chill (valida sotto i 10 gradi).
    var v = Math.min(55, flatKmh * 2) + Math.max(0, top.head || 0);
    var wc = (top.temp <= 10 && v > 5) ? 13.12 + 0.6215 * top.temp - 11.37 * Math.pow(v, 0.16) + 0.3965 * top.temp * Math.pow(v, 0.16) : null;
    h += '<div class="rw-hint" style="background:#fef2f2;border-color:#fecaca">&#x1F3D4;&#xFE0F; Punto piu\' alto (' + Math.round(top.ele) + ' m, ore ' + rwClock(top.t) + '): <b>' + Math.round(top.temp) + '&deg;C</b>'
      + (wc != null ? ', in discesa a ' + Math.round(v) + ' km/h percepirai <b>' + Math.round(wc) + '&deg;C</b> &rarr; giacca obbligatoria.' : '.') + '</div>';
  }
  h += '<div class="rw-note">I modelli meteo hanno maglie di 2-11 km e non colgono come il vento si incanala nelle valli: in quota prendi le frecce come indicazione, non come verita\'.</div>';
  b.innerHTML = h;
}

/* ================= RISTORI =================
   Stesso schema delle fontanelle (Overpass + mirror + distanza dalla polilinea), ma con il pezzo
   che nessuno mette insieme: sappiamo A CHE ORA ci passi, quindi possiamo dirti se sara' APERTO. */
function toggleRwStops() {
  var on = document.getElementById("rw-stops").checked;
  if (!on) { clearRwStops(); var b = document.getElementById("rwstopbox"); if (b) b.innerHTML = ""; return; }
  loadRwStops();
}
function clearRwStops() { if (rwStopLayer) { map.removeLayer(rwStopLayer); rwStopLayer = null; } rwStops = null; }
function loadRwStops() {
  if (rbTrack.length < 2) return;
  var buf = parseInt((document.getElementById("rw-buf") || {}).value, 10) || 250;
  var track = rbTrack.map(function (c) { return [c[0], c[1]]; });
  var box = bboxOfTracks([track], buf / 111000 + 0.002);
  if (!box) return;
  var b = document.getElementById("rwstopbox"); if (b) b.innerHTML = '<span style="color:var(--txt2)">Ricerca ristori\u2026</span>';
  // Un forno aperto vale piu' di un ristorante stellato: alimentari e panetterie sono in lista.
  var q = '[out:json][timeout:25];(node["amenity"~"^(cafe|bar|pub|restaurant|fast_food|ice_cream)$"]' + box
    + ';node["shop"~"^(bakery|convenience|supermarket|greengrocer|pastry)$"]' + box + ';);out body;';
  rwStopFetch(shuffledMirrors(), 0, q, buf, track);
}
function rwStopFetch(urls, i, q, buf, track) {
  if (i >= urls.length) { var b = document.getElementById("rwstopbox"); if (b) b.innerHTML = '<span style="color:var(--txt2)">&#x26A0;&#xFE0F; Overpass non raggiungibile, riprova.</span>'; return; }
  fetch(urls[i] + "?data=" + encodeURIComponent(q)).then(function (r) { return r.json(); }).then(function (d) {
    var out = [];
    (d.elements || []).forEach(function (el) {
      if (el.type !== "node") return;
      var r = distPtToTrack(el.lat, el.lon, track);
      if (!r || r.distM > buf) return;
      var t = el.tags || {};
      out.push({ lat: el.lat, lon: el.lon, name: t.name || rwStopType(t), kind: rwStopType(t), oh: t.opening_hours || "", along: r.along, dist: r.distM });
    });
    out.sort(function (a, b2) { return a.along - b2.along; });
    rwStops = out; drawRwStops(); fillRwStopBox(buf);
  }).catch(function () { rwStopFetch(urls, i + 1, q, buf, track); });
}
function rwStopType(t) {
  if (t.shop === "bakery" || t.shop === "pastry") return "Panetteria";
  if (t.shop === "supermarket" || t.shop === "convenience" || t.shop === "greengrocer") return "Alimentari";
  if (t.amenity === "cafe" || t.amenity === "bar") return "Bar";
  if (t.amenity === "restaurant") return "Ristorante";
  if (t.amenity === "fast_food") return "Fast food";
  if (t.amenity === "pub") return "Pub";
  if (t.amenity === "ice_cream") return "Gelateria";
  return "Ristoro";
}
function rwStopEmoji(k) {
  return k === "Panetteria" ? "\uD83E\uDD50" : k === "Alimentari" ? "\uD83D\uDED2" : k === "Ristorante" ? "\uD83C\uDF7D\uFE0F"
    : k === "Gelateria" ? "\uD83C\uDF66" : k === "Fast food" ? "\uD83C\uDF54" : "\u2615";
}
/* ETA a un dato km, interpolata dalla tabella oraria gia' calcolata per il vento. */
function rwEtaAt(km) {
  if (!rwData || rwData.length < 2) return null;
  if (km <= rwData[0].km) return rwData[0].t;
  for (var i = 1; i < rwData.length; i++) {
    if (km <= rwData[i].km) {
      var a = rwData[i - 1], b = rwData[i], f = (km - a.km) / Math.max(0.001, b.km - a.km);
      return a.t + (b.t - a.t) * f;
    }
  }
  return rwData[rwData.length - 1].t;
}
/* opening_hours: sottoinsieme pragmatico ("Mo-Sa 07:00-19:00; Su 08:00-13:00", "24/7",
   intervalli multipli "09:00-12:00,15:00-19:00"). Se la sintassi e' esotica NON tiriamo a indovinare:
   diciamo "orario non verificato". Meglio ammettere di non sapere che mandare uno a un bar chiuso. */
function ohOpen(oh, ms) {
  if (!oh || !ms) return null;
  if (/24\/7/.test(oh)) return true;
  var d = new Date(ms), dow = ["Su","Mo","Tu","We","Th","Fr","Sa"][d.getDay()];
  var mins = d.getHours() * 60 + d.getMinutes(), known = false, open = false;
  var rules = oh.split(";");
  for (var r = 0; r < rules.length; r++) {
    var rule = rules[r].trim(); if (!rule) continue;
    var m = /^((?:[A-Za-z]{2}(?:-[A-Za-z]{2})?)(?:,[A-Za-z]{2}(?:-[A-Za-z]{2})?)*)?\s*(.*)$/.exec(rule);
    if (!m) return null;
    var days = m[1], hours = m[2];
    if (/off|closed/i.test(hours)) { if (!days || dayIn(days, dow)) { known = true; open = false; } continue; }
    if (!/^\d{2}:\d{2}-\d{2}:\d{2}(,\d{2}:\d{2}-\d{2}:\d{2})*$/.test(hours)) return null;   // sintassi non gestita
    if (days && !dayIn(days, dow)) continue;
    known = true;
    hours.split(",").forEach(function (span) {
      var p = span.split("-"), a = toMin(p[0]), b = toMin(p[1]);
      if (b <= a) b += 1440;                                    // oltre mezzanotte
      if (mins >= a && mins <= b) open = true;
    });
  }
  return known ? open : null;
}
function toMin(s) { var p = s.split(":"); return (+p[0]) * 60 + (+p[1]); }
function dayIn(spec, dow) {
  var ORD = ["Mo","Tu","We","Th","Fr","Sa","Su"], i = ORD.indexOf(dow);
  var parts = spec.split(",");
  for (var k = 0; k < parts.length; k++) {
    var p = parts[k].trim();
    if (p.indexOf("-") > 0) {
      var a = ORD.indexOf(p.split("-")[0]), b = ORD.indexOf(p.split("-")[1]);
      if (a < 0 || b < 0) continue;
      if (a <= b ? (i >= a && i <= b) : (i >= a || i <= b)) return true;
    } else if (p === dow) return true;
  }
  return false;
}
function drawRwStops() {
  if (rwStopLayer) { map.removeLayer(rwStopLayer); rwStopLayer = null; }
  if (!rwStops || !rwStops.length) return;
  rwStopLayer = L.layerGroup();
  rwStops.forEach(function (s) {
    var eta = rwEtaAt(s.along / 1000), st = ohOpen(s.oh, eta);
    var ic = L.divIcon({ className: "", iconSize: [22, 22], iconAnchor: [11, 11],
      html: '<div class="stop-ic' + (st === false ? " shut" : st === true ? " open" : "") + '">' + rwStopEmoji(s.kind) + "</div>" });
    var pop = "<b>" + esc(s.name) + "</b><br>" + s.kind + " &middot; km " + (s.along / 1000).toFixed(1) + " (" + Math.round(s.dist) + " m dal percorso)";
    if (eta) pop += "<br>Ci arrivi verso le <b>" + rwClock(eta) + "</b>" + (st === true ? " &middot; <span style='color:#16a34a'><b>aperto</b></span>" : st === false ? " &middot; <span style='color:#dc2626'><b>chiuso</b></span>" : "");
    if (s.oh) pop += "<br><span style='color:#64748b;font-size:.85em'>" + esc(s.oh) + "</span>";
    L.marker([s.lat, s.lon], { icon: ic }).bindPopup(pop).addTo(rwStopLayer);
  });
  rwStopLayer.addTo(map);
}
function fillRwStopBox(buf) {
  var b = document.getElementById("rwstopbox"); if (!b) return;
  if (!rwStops || !rwStops.length) { b.innerHTML = '<span style="color:var(--txt2)">Nessun ristoro entro ' + buf + ' m dal percorso.</span>'; return; }
  var withEta = !!rwData;
  var h = '<div style="margin-bottom:6px"><b>' + rwStops.length + '</b> ristori entro ' + buf + ' m'
    + (withEta ? '' : ' &middot; <span style="color:var(--txt2)">calcola il meteo per sapere a che ora ci arrivi</span>') + '</div>';
  h += '<div class="stop-list">';
  rwStops.slice(0, 40).forEach(function (s) {
    var eta = rwEtaAt(s.along / 1000), st = ohOpen(s.oh, eta);
    h += '<div class="stop-row"><span>' + rwStopEmoji(s.kind) + '</span><span class="km">km ' + (s.along / 1000).toFixed(1) + '</span>'
      + '<span class="nm">' + esc(s.name) + '</span>'
      + (eta ? '<span class="eta">' + rwClock(eta) + '</span>' : '')
      + (st === true ? '<span class="tag ok">aperto</span>' : st === false ? '<span class="tag no">chiuso</span>' : s.oh ? '' : '<span class="tag unk">orario ignoto</span>')
      + '</div>';
  });
  h += "</div>";
  if (rwStops.length > 40) h += '<div style="color:var(--txt2);font-size:.75rem">\u2026e altri ' + (rwStops.length - 40) + '.</div>';
  b.innerHTML = h;
}
/* Ricalcolo alla modifica del buffer o dopo una nuova previsione. */
function rwBufChanged() { if (document.getElementById("rw-stops") && document.getElementById("rw-stops").checked) loadRwStops(); }
function resetRideWeather() {
  rwData = null; clearRwStops();
  if (rwLayer) { map.removeLayer(rwLayer); rwLayer = null; }
}
