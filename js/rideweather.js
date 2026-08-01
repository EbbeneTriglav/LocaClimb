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
  var n = Math.min(RW_MAX_PTS, Math.max(4, Math.round(total / 6)));
  var idx = [];
  for (var k = 0; k < n; k++) {
    var target = total * k / (n - 1), i = 1;
    while (i < cum.length - 1 && cum[i] < target) i++;
    idx.push(Math.max(1, Math.min(rbTrack.length - 1, i)));
  }
  // La CIMA e' il punto che interessa di piu' (temperatura, vento, giacca) ed e' proprio quello che un
  // campionamento equidistante si perde: sullo Stelvio il profilo diceva 2788 m e il riquadro 2757 m.
  // Forziamo il punto piu' alto dentro il campione, al posto del vicino piu' prossimo.
  var hi = 1;
  for (var i2 = 1; i2 < rbTrack.length; i2++) if (rbTrack[i2][2] != null && (rbTrack[hi][2] == null || rbTrack[i2][2] > rbTrack[hi][2])) hi = i2;
  if (idx.indexOf(hi) < 0) {
    var near = 0;
    for (var k2 = 1; k2 < idx.length; k2++) if (Math.abs(cum[idx[k2]] - cum[hi]) < Math.abs(cum[idx[near]] - cum[hi])) near = k2;
    idx[near] = hi;
    idx.sort(function (a, b) { return a - b; });
    // La sostituzione puo' far collidere due campioni sullo stesso punto del tracciato: due voci
    // identiche = due orari identici = una freccia doppia sopra l'altra. Dedup.
    idx = idx.filter(function (v, k3) { return k3 === 0 || v !== idx[k3 - 1]; });
  }
  return idx.map(function (j) {
    return {
      km: cum[j], lat: rbTrack[j][0], lon: rbTrack[j][1], ele: rbTrack[j][2],
      t: times[j], bearing: rwBearing(rbTrack[j - 1], rbTrack[Math.min(j + 1, rbTrack.length - 1)]),
      top: j === hi
    };
  });
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
    + "&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,cloud_cover,weather_code,cape,convective_inhibition,wind_speed_10m,wind_direction_10m,wind_gusts_10m"
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
      p.rh = h.relative_humidity_2m ? h.relative_humidity_2m[idx] : 60;
      p.rain = h.precipitation_probability ? h.precipitation_probability[idx] : null;
      p.mm = h.precipitation ? h.precipitation[idx] : 0;          // mm attesi in QUELL'ora: 85% di 0.2 mm e 40% di 15 mm non sono la stessa cosa
      p.cloud = h.cloud_cover ? h.cloud_cover[idx] : null;
      p.code = h.weather_code ? h.weather_code[idx] : null;
      p.cape = h.cape ? h.cape[idx] : null;                       // J/kg (NON kJ): energia potenziale convettiva
      p.cin = h.convective_inhibition ? h.convective_inhibition[idx] : null;  // J/kg, il "cappuccio" che impedisce l'innesco
      // dir = direzione DA CUI soffia (convenzione meteo). Se coincide con la nostra rotta, e' vento in faccia.
      var rel = ((p.dir - p.bearing) + 540) % 360 - 180;     // -180..180
      p.rel = rel;
      p.head = p.wind * Math.cos(rel * Math.PI / 180);        // >0 contrario, <0 a favore
      p.cross = Math.abs(p.wind * Math.sin(rel * Math.PI / 180));
      p.kind = Math.abs(rel) < 50 ? "head" : Math.abs(rel) > 130 ? "tail" : "cross";
    });
    rwData = pts.filter(function (p) { return p.wind != null; });
    drawWindArrows(); drawWindStrip(); drawSkyStrip(); fillWeatherBox(flat);
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
function toggleWindArrows() { drawWindArrows(); }
function drawWindArrows() {
  if (rwLayer) { map.removeLayer(rwLayer); rwLayer = null; }
  var cb = document.getElementById("rw-arrows");
  if (cb && !cb.checked) return;   // su un percorso che ripassa dallo stesso paese le frecce si accavallano
  if (!rwData || !rwData.length) return;
  rwLayer = L.layerGroup();
  rwData.forEach(function (p) {
    var tip = "km " + p.km.toFixed(1) + " &middot; " + rwClock(p.t) + "<br>"
      + Math.round(p.wind) + " km/h da " + compass16(p.dir) + " (raffiche " + Math.round(p.gust) + ")<br>"
      + "<b>" + rwKindLabel(p) + "</b><br>" + Math.round(p.temp) + "&deg;C"
      + (p.rain != null ? " &middot; pioggia " + p.rain + "%" : "")
      + (p.mm > 0.05 ? " &middot; " + p.mm.toFixed(1) + " mm" : "")
      + (p.cape >= 300 ? "<br>CAPE " + Math.round(p.cape) + " J/kg (" + capeLabel(p.cape) + ")" : "");
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
/* Asse condiviso dalle fasce: identico a quello del profilo, cosi' le colonne restano allineate. */
function stripAxis(c, h) {
  var w = c.clientWidth || 380, dpr = window.devicePixelRatio || 1;
  c.width = w * dpr; c.height = h * dpr; c.style.height = h + "px";
  var x = c.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
  var total = rwData[rwData.length - 1].km || 1, PL = 38, PR = 8, iw = w - PL - PR;
  return { x: x, w: w, PL: PL, PR: PR, iw: iw, total: total,
    band: function (i) {  // estremi della colonna del campione i
      var a = i === 0 ? PL : PL + iw * (((rwData[i - 1].km + rwData[i].km) / 2) / total);
      var b = i === rwData.length - 1 ? PL + iw : PL + iw * (((rwData[i].km + rwData[i + 1].km) / 2) / total);
      return [a, b];
    } };
}
/* ---------- CAPE: l'ingrediente, non la previsione ----------
   CAPE = Convective Available Potential Energy, in J/kg. E' l'energia che una particella d'aria puo'
   liberare salendo: e' il CARBURANTE del temporale. Ma il carburante non basta, serve l'innesco -
   ed e' li' che entra la CIN (convective inhibition, il "cappuccio" di aria calda in quota che
   soffoca la convezione). CAPE 3000 con CIN forte = pomeriggio afoso e sereno. CAPE 2500 con CIN
   quasi nulla = cella che esplode sopra la valle.
   Allarmare sul solo CAPE farebbe gridare al lupo meta' delle giornate estive, e un allarme che
   suona sempre non lo legge piu' nessuno. Quindi: si guarda la COPPIA.
   Soglie standard (J/kg): <300 trascurabile | 300-1000 debole | 1000-2500 moderato |
   2500-4000 forte | >4000 estremo. */
/* Innesco diurno. La convezione di montagna e' TERMICA: le serve il sole che scalda i versanti e la
   brezza di valle che spinge l'aria verso l'alto. Lo stesso CAPE all'alba e alle 16 non e' la stessa
   minaccia. Non mediamo il CAPE nel tempo (la media diluirebbe proprio il picco che ti ammazza):
   lo pesiamo per la probabilita' che qualcosa lo INNESCHI in quell'ora. Curva empirica, picco alle 16. */
var DIURNAL = [[0, 0.10], [6, 0.10], [9, 0.20], [11, 0.40], [13, 0.70], [15, 0.95], [16, 1.00], [18, 0.85], [20, 0.55], [22, 0.25], [24, 0.10]];
function trigger(ms) {
  // Fail-safe: senza orario si assume l'ora PEGGIORE. In una funzione di sicurezza il default
  // sbagliato e' quello che tace, non quello che avvisa di troppo.
  if (!ms || isNaN(ms)) return 1;
  var d = new Date(ms), h = d.getHours() + d.getMinutes() / 60;
  for (var i = 1; i < DIURNAL.length; i++) {
    if (h <= DIURNAL[i][0]) {
      var a = DIURNAL[i - 1], b = DIURNAL[i], f = (h - a[0]) / (b[0] - a[0]);
      return a[1] + (b[1] - a[1]) * f;
    }
  }
  return 0.10;
}
/* CAPE efficace: usato SOLO per decidere se allarmare. All'utente mostriamo il CAPE vero, che e' il
   dato fisico; questo e' il nostro giudizio su quanto e' probabile che quell'energia venga liberata. */
function effCape(p) { return (p.cape || 0) * trigger(p.t); }
function capeLabel(v) {
  if (v == null) return null;
  return v < 300 ? "trascurabile" : v < 1000 ? "debole" : v < 2500 ? "moderata" : v < 4000 ? "forte" : "estrema";
}
function stormRisk(p) {
  // Un weather_code di temporale vale a QUALUNQUE ora: i temporali frontali e notturni non sono termici,
  // e la modulazione diurna non deve nasconderti un fronte in arrivo all'alba.
  if (isStorm(p.code)) return 3;
  var ec = effCape(p), cin = Math.abs(p.cin || 0);   // soglie sul CAPE EFFICACE, non su quello grezzo
  if (ec >= 2500 && cin < 100) return 3;             // molta energia, coperchio assente, ora giusta
  if (ec >= 1500 && cin < 75) return 2;
  if (ec >= 1000) return 1;
  return 0;
}
/* WMO weather_code: quello che serve davvero e' distinguere "cielo" da "acqua" da "PERICOLO". */
function isStorm(c) { return c >= 95 && c <= 99; }
function isSnow(c) { return (c >= 71 && c <= 77) || c === 85 || c === 86; }
function skyGlyph(p) {
  if (isStorm(p.code)) return "\u26A1";
  if (isSnow(p.code)) return "\u2744\uFE0F";
  if (p.mm >= 0.2) return "\uD83C\uDF27\uFE0F";
  var cl = p.cloud == null ? 50 : p.cloud;
  return cl < 25 ? "\u2600\uFE0F" : cl < 55 ? "\uD83C\uDF24\uFE0F" : cl < 85 ? "\u26C5" : "\u2601\uFE0F";
}
/* Fascia cielo: sfondo = nuvolosita', barra blu = MILLIMETRI (non la probabilita': e' l'acqua che
   ti bagna, non la percentuale), intensita' della barra = probabilita'. Il fulmine e' rosso e grosso
   apposta: in cresta a 2000 m un temporale non e' scomodo, e' pericoloso. */
function drawSkyStrip() {
  var c = document.getElementById("rsky"); if (!c || !rwData || !rwData.length) return;
  var A = stripAxis(c, 58), x = A.x, H = 58, TOP = 14, BOT = 44;
  for (var i = 0; i < rwData.length; i++) {
    var p = rwData[i], b = A.band(i), cl = p.cloud == null ? 50 : p.cloud;
    var t = cl / 100, r = Math.round(254 - 34 * t), g = Math.round(249 - 34 * t), bl = Math.round(195 + 25 * t);
    x.fillStyle = "rgb(" + r + "," + g + "," + bl + ")"; x.globalAlpha = 0.75;
    x.fillRect(b[0], TOP, b[1] - b[0], BOT - TOP); x.globalAlpha = 1;
    if (p.mm > 0.05) {                                     // 5 mm/h riempie la colonna: oltre e' diluvio comunque
      var hh = Math.min(1, p.mm / 5) * (BOT - TOP);
      x.fillStyle = isStorm(p.code) ? "#dc2626" : "#3b82f6";
      x.globalAlpha = 0.25 + 0.65 * ((p.rain == null ? 50 : p.rain) / 100);
      x.fillRect(b[0], BOT - hh, b[1] - b[0], hh); x.globalAlpha = 1;
    }
    if (stormRisk(p) >= 2) {                                         // tratteggio rosso: qui l'atmosfera e' carica
      x.save(); x.beginPath(); x.rect(b[0], TOP, b[1] - b[0], BOT - TOP); x.clip();
      x.strokeStyle = "#dc2626"; x.globalAlpha = stormRisk(p) === 3 ? 0.5 : 0.25; x.lineWidth = 1.5;
      for (var d = b[0] - (BOT - TOP); d < b[1] + 2; d += 6) { x.beginPath(); x.moveTo(d, BOT); x.lineTo(d + (BOT - TOP), TOP); x.stroke(); }
      x.restore(); x.globalAlpha = 1;
    }
    x.font = "11px system-ui"; x.textAlign = "center";
    x.fillText(skyGlyph(p), (b[0] + b[1]) / 2, TOP + 13);
    if (p.mm >= 0.5) { x.font = "600 8px system-ui"; x.fillStyle = "#0f172a"; x.fillText(p.mm.toFixed(1), (b[0] + b[1]) / 2, BOT - 2); }
  }
  x.fillStyle = "#64748b"; x.font = "9px system-ui"; x.textAlign = "left"; x.fillText("cielo", 2, TOP + 12);
  x.textAlign = "center"; x.fillText("barra blu = mm attesi in quell'ora  \u00b7  tratteggio rosso = atmosfera instabile (CAPE)", A.PL + A.iw / 2, H - 2);
}

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
  var top = arr.filter(function (p) { return p.top; })[0] || arr.reduce(function (a, p) { return (p.ele != null && (!a || p.ele > a.ele)) ? p : a; }, null);
  var maxRain = arr.reduce(function (m, p) { return Math.max(m, p.rain || 0); }, 0);
  // Accumulo stimato: i mm sono ORARI, quindi vanno pesati per il tempo che passi in ogni tratto.
  var mmTot = 0;
  for (var i = 1; i < n; i++) mmTot += (arr[i].mm || 0) * ((arr[i].t - arr[i - 1].t) / 3600000);
  var storm = arr.filter(function (p) { return isStorm(p.code); })[0];
  var risky = arr.filter(function (p) { return stormRisk(p) >= 2; }).sort(function (a, b) { return (b.cape || 0) - (a.cape || 0); })[0];
  var maxCape = arr.reduce(function (m, p) { return Math.max(m, p.cape || 0); }, 0);
  var snow = arr.filter(function (p) { return isSnow(p.code); })[0];
  var worst = arr.reduce(function (a, p) { return (!a || p.head > a.head) ? p : a; }, null);

  var h = '<div class="rw-sum"><div>Arrivo<b>' + rwClock(end.t) + '</b></div><div>Durata<b>' + dur.toFixed(1) + ' h</b></div>'
    + '<div>Contrario<b>' + headKm.toFixed(0) + ' km</b></div><div>A favore<b>' + tailKm.toFixed(0) + ' km</b></div></div>';
  // Soglia a 15: 8 km/h contro non e' "il tratto peggiore", e' una brezza. Un avviso che scatta sempre
  // e' un avviso che nessuno legge piu' quando conta davvero.
  if (worst && worst.head >= 15) h += '<div class="rw-hint">&#x1F4A8; Tratto peggiore: <b>' + Math.round(worst.head) + ' km/h in faccia</b> al km ' + worst.km.toFixed(0) + ', verso le ' + rwClock(worst.t) + '.</div>';
  // Il temporale viene PRIMA di tutto: non e' comfort, e' sicurezza.
  // CAPE: instabilita' potenziale. Se e' alta, i mm del modello sono con ogni probabilita' SOTTOSTIMATI.
  if (risky && !storm) {
    h += '<div class="rw-hint" style="background:#fff7ed;border-color:#fdba74">&#x26A1; <b>Atmosfera instabile</b> al km ' + risky.km.toFixed(0) + ' verso le ' + rwClock(risky.t)
      + ': CAPE <b>' + Math.round(risky.cape) + ' J/kg</b> (instabilita\' ' + capeLabel(risky.cape) + ')'
      + (risky.cin != null ? ', inibizione ' + Math.round(Math.abs(risky.cin)) + ' J/kg' : '') + '.'
      + (risky.mm < 3 ? ' Il modello prevede solo ' + (risky.mm || 0).toFixed(1) + ' mm, <b>ma con questa energia e\' probabilmente una sottostima</b>: una maglia di 2-11 km non risolve la singola cella, e quello che spalma su 100 km&sup2; puo\' cadere su 3 km&sup2; in venti minuti.' : '')
      + '</div>';
  }
  if (storm) h += '<div class="rw-hint" style="background:#fef2f2;border-color:#fca5a5">&#x26A1; <b>Temporali previsti</b> al km ' + storm.km.toFixed(0) + ' verso le ' + rwClock(storm.t)
    + (storm.ele > 1500 ? ' — sei a ' + Math.round(storm.ele) + ' m: in cresta il fulmine cerca il punto piu\' alto, e con la bici quel punto sei tu. Valuta di rimandare.' : '. Cerca un riparo, non un albero.') + '</div>';
  if (snow) h += '<div class="rw-hint" style="background:#f0f9ff;border-color:#bae6fd">&#x2744;&#xFE0F; <b>Neve</b> prevista al km ' + snow.km.toFixed(0) + ' (' + Math.round(snow.ele) + ' m), verso le ' + rwClock(snow.t) + '.</div>';
  // La percentuale da sola inganna: 85% di 0,2 mm e' una spruzzata, 40% di 15 mm ti frega la giornata.
  if (mmTot >= 0.3 || maxRain >= 50) {
    var sev = mmTot < 1 ? 'una spruzzata' : mmTot < 5 ? 'pioggia leggera' : mmTot < 12 ? 'pioggia vera' : 'acquazzone';
    h += '<div class="rw-hint" style="background:#eff6ff;border-color:#bfdbfe">&#x1F327;&#xFE0F; Probabilita\' fino al <b>' + maxRain + '%</b>, accumulo stimato <b>' + mmTot.toFixed(1) + ' mm</b> sull\'intero giro &rarr; ' + sev + '.</div>';
  } else if (maxRain >= 40) {
    h += '<div class="rw-hint" style="background:#f8fafc;border-color:#e2e8f0">&#x1F326;&#xFE0F; Probabilita\' fino al <b>' + maxRain + '%</b> ma accumulo trascurabile (<b>' + mmTot.toFixed(1) + ' mm</b>): al massimo ti bagni la maglia.</div>';
  }
  if (top && top.temp != null) {
    var v = descendSpeed(top, flatKmh);
    var ap = v ? apparentTemp(top.temp, top.rh, v) : null;
    h += '<div class="rw-hint" style="background:#fef2f2;border-color:#fecaca">&#x1F3D4;&#xFE0F; Punto piu\' alto (' + Math.round(top.ele) + ' m, ore ' + rwClock(top.t) + '): <b>' + Math.round(top.temp) + '&deg;C</b>';
    if (ap != null && top.temp - ap >= 4) {
      h += ', ma in discesa a ' + Math.round(v) + ' km/h percepirai <b>' + Math.round(ap) + '&deg;C</b>';
      h += ap <= 5 ? ' &rarr; giacca obbligatoria, rischio ipotermia.' : ap <= 12 ? ' &rarr; porta un antivento.' : '.';
    } else h += '.';
    h += '</div>';
  }
  if (maxCape >= 300) {
    h += '<div class="rw-note"><b>CAPE</b> (picco ' + Math.round(maxCape) + ' J/kg sul percorso): l\'energia che una bolla d\'aria libera salendo. E\' il <i>carburante</i> del temporale, non il temporale.</div>';
    h += '<div class="rw-note"><b>CIN</b> (inibizione convettiva, J/kg): il <i>coperchio</i>. E\' uno strato d\'aria piu\' calda a mezza quota che schiaccia verso il basso l\'aria del suolo e le impedisce di salire da sola. Finche\' il coperchio tiene, il CAPE resta energia inutilizzata e il cielo puo\' restare sereno anche con numeri altissimi. Se qualcosa lo rompe &mdash; il sole del pomeriggio, un versante che spinge l\'aria in alto, un fronte &mdash; l\'energia accumulata si libera tutta insieme: i temporali piu\' violenti nascono proprio cosi\'. Sotto ~50 J/kg il coperchio e\' debole, sopra ~150 J/kg raramente si rompe da solo.</div>';
    h += '<div class="rw-note">Nel valutare il rischio pesiamo il CAPE per l\'<b>ora del giorno</b>: in montagna la convezione e\' termica, ha bisogno del sole sui versanti, e culmina nel primo pomeriggio. Lo stesso valore alle 8 del mattino e alle 16 non e\' la stessa minaccia. E\' un indizio, non una previsione.</div>';
  }
  h += '<div class="rw-note">I modelli meteo hanno maglie di 2-11 km e non colgono come il vento si incanala nelle valli: in quota prendi le frecce come indicazione, non come verita\'.</div>';
  b.innerHTML = h;
}

/* Quanta discesa c'e' DOPO la cima? Se il percorso finisce in vetta non ti raffreddi in discesa e
   l'avviso non ha senso. Velocita' dell'aria = velocita' di discesa + eventuale vento contrario. */
function descendSpeed(top, flatKmh) {
  if (!rwData || !rwData.length) return 0;
  var last = rwData[rwData.length - 1];
  if (last.ele == null || top.ele == null || top.ele - last.ele < 300) return 0;
  return Math.min(60, flatKmh * 2) + Math.max(0, top.head || 0);
}
/* Temperatura percepita (Steadman). A differenza del wind chill vale a QUALSIASI temperatura, non solo
   sotto i 10 gradi - ed e' proprio il caso che serve: 14 gradi in cima allo Stelvio e poi 1900 m di
   discesa sudato a 50 all'ora fanno percepire meno di 5 gradi. Il termometro mente. */
function apparentTemp(ta, rh, kmh) {
  var ws = kmh / 3.6;
  var e = (Math.max(10, Math.min(100, rh || 60)) / 100) * 6.105 * Math.exp(17.27 * ta / (237.7 + ta));
  return ta + 0.33 * e - 0.70 * ws - 4.0;
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
    if (typeof rwStopsThen === "function") { var _f = rwStopsThen; rwStopsThen = null; _f(); }
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
/* ETA a un dato km, interpolata dalla tabella oraria gia' calcolata per il vento.
   ATTENZIONE: distPtToTrack restituisce `along` gia' in KM (non in metri). Dividere per 1000 mandava
   ogni ristoro al km 0.0 e ne faceva coincidere l'orario con la partenza: 115 bar tutti alle 08:00. */
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
    var eta = rwEtaAt(s.along), st = ohOpen(s.oh, eta);
    var ic = L.divIcon({ className: "", iconSize: [18, 18], iconAnchor: [9, 9],
      html: '<div class="stop-ic' + (st === false ? " shut" : st === true ? " open" : "") + '">' + rwStopEmoji(s.kind) + "</div>" });
    var pop = "<b>" + esc(s.name) + "</b><br>" + s.kind + " &middot; km " + s.along.toFixed(1) + " (" + Math.round(s.dist) + " m dal percorso)";
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
    var eta = rwEtaAt(s.along), st = ohOpen(s.oh, eta);
    h += '<div class="stop-row"><span>' + rwStopEmoji(s.kind) + '</span><span class="km">km ' + s.along.toFixed(1) + '</span>'
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
