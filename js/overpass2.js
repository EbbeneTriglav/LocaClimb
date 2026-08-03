/* ===========================================================================
   LocaRide - ricerca acqua e ristori lungo il CORRIDOIO del percorso
   ---------------------------------------------------------------------------
   IL PROBLEMA
   La ricerca usava il rettangolo che contiene tutto il percorso (bboxOfTracks).
   Per un giro alpino di 100 km quel rettangolo e' un quadrato di ~100x100 km:
   si chiedevano a Overpass TUTTE le fontane di 10.000 km quadrati, per poi
   buttarne via il 99% perche' lontane dal tracciato. Con i giri corti passava
   inosservato; con i giri lunghi (GPX importati, giri salvati) il server va in
   timeout o risponde "troppo carico".

   LA SOLUZIONE
   Overpass sa cercare lungo una linea: `node(around:200, lat,lon, lat,lon, ...)`
   restituisce solo cio' che sta entro 200 m dal percorso. Si passa dal chiedere
   un'area enorme al chiedere esattamente la striscia che interessa: molti meno
   dati da elaborare per il server e da scaricare per noi.

   In piu':
   - il tracciato viene campionato a distanza costante (max ~160 punti), cosi'
     la richiesta resta di dimensione ragionevole anche su percorsi lunghissimi;
   - il risultato e' messo in cache sulla "firma" del percorso: riaprire lo
     stesso giro non genera una seconda richiesta;
   - se una richiesta e' gia' in volo per lo stesso percorso, la seconda si mette
     in coda invece di partire in parallelo.

   Nessuna modifica ai file esistenti: questo modulo ridefinisce loadRouteWater()
   e loadRwStops(). Togliendo il <script> torna il comportamento di prima.
   =========================================================================== */

var OP2_MAX_PTS = 320;        // punti del corridoio inviati a Overpass
var OP2_TIMEOUT = 25000;      // ms prima di considerare il mirror non raggiungibile
var op2Cache = {};            // firma -> risultato
var op2Inflight = {};         // firma -> callback in attesa

/* Semplificazione del tracciato (Douglas-Peucker).
   Perche' non un campionamento a distanza fissa: su una salita a tornanti due punti
   presi ogni chilometro vengono uniti da una retta che TAGLIA i tornanti, e il
   corridoio finirebbe altrove rispetto alla strada vera, perdendo le fontane.
   Douglas-Peucker garantisce invece che la linea semplificata non si allontani mai
   dal tracciato piu' della tolleranza scelta: tenendo la tolleranza sotto il raggio
   di ricerca, la copertura e' garantita. Tiene molti punti sui tornanti e pochissimi
   sui rettilinei, che e' esattamente cio' che serve. */
function op2PerpM(p, a, b) {
  var R = 6371000, r = Math.PI / 180, c0 = Math.cos(a[0] * r);
  var ax = 0, ay = 0;
  var bx = R * (b[1] - a[1]) * r * c0, by = R * (b[0] - a[0]) * r;
  var px = R * (p[1] - a[1]) * r * c0, py = R * (p[0] - a[0]) * r;
  var vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
  var t = L2 > 0 ? ((px * vx + py * vy) / L2) : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  var dx = px - t * vx, dy = py - t * vy;
  return Math.sqrt(dx * dx + dy * dy);
}
function op2Simplify(track, tolM) {
  if (!track || track.length < 3) return (track || []).slice();
  var keep = new Uint8Array(track.length);
  keep[0] = 1; keep[track.length - 1] = 1;
  var stack = [[0, track.length - 1]];
  while (stack.length) {
    var seg = stack.pop(), s = seg[0], e = seg[1];
    var maxD = -1, idx = -1;
    for (var i = s + 1; i < e; i++) {
      var d = op2PerpM(track[i], track[s], track[e]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tolM && idx > 0) { keep[idx] = 1; stack.push([s, idx]); stack.push([idx, e]); }
  }
  var out = [];
  for (var k = 0; k < track.length; k++) if (keep[k]) out.push([track[k][0], track[k][1]]);
  return out;
}
/* Sceglie la tolleranza piu' fine che sta dentro il limite di punti: si parte da
   60 m (molto fedele) e si allarga solo se il percorso e' lunghissimo. */
function op2Sample(track, maxPts) {
  if (!track || track.length < 2) return track || [];
  var tol = 60, out = op2Simplify(track, tol);
  while (out.length > maxPts && tol < 400) { tol *= 1.6; out = op2Simplify(track, tol); }
  if (out.length > maxPts) {                       // caso estremo: assottiglia in modo uniforme
    var step = out.length / maxPts, thin = [];
    for (var k = 0; k < maxPts; k++) thin.push(out[Math.floor(k * step)]);
    thin.push(out[out.length - 1]);
    out = thin;
  }
  return out;
}
function op2List(pts) {
  return pts.map(function (p) { return p[0].toFixed(5) + "," + p[1].toFixed(5); }).join(",");
}
/* Firma del percorso: pochi punti campione + lunghezza. Serve solo a capire se
   e' lo stesso giro di prima, non a identificarlo in modo univoco. */
function op2Sig(track, tag) {
  if (!track || !track.length) return tag + ":vuoto";
  var a = track[0], b = track[track.length - 1], m = track[Math.floor(track.length / 2)];
  return tag + ":" + track.length + ":" + a[0].toFixed(3) + "," + a[1].toFixed(3)
    + ":" + m[0].toFixed(3) + "," + m[1].toFixed(3) + ":" + b[0].toFixed(3) + "," + b[1].toFixed(3);
}

/* Esecuzione con cache, deduplica delle richieste concorrenti e giro sui mirror. */
function op2Run(sig, query, cb) {
  if (op2Cache[sig]) { cb(op2Cache[sig], true); return; }
  if (op2Inflight[sig]) { op2Inflight[sig].push(cb); return; }
  op2Inflight[sig] = [cb];
  function done(nodes, ok) {
    if (ok) op2Cache[sig] = nodes;
    var cbs = op2Inflight[sig] || []; delete op2Inflight[sig];
    cbs.forEach(function (f) { f(nodes, ok); });
  }
  var order = (typeof shuffledMirrors === "function") ? shuffledMirrors() : [OVERPASS];
  (function tryUrl(i) {
    if (i >= order.length) { done([], false); return; }
    overpassPost(order[i], query, OP2_TIMEOUT)
      .then(function (d) { done((d.elements || []).filter(function (e) { return e.type === "node" && e.lat != null; }), true); })
      .catch(function () { tryUrl(i + 1); });
  })(0);
}

/* ------------------------------- ACQUA ------------------------------------- */
function op2WaterQuery(list, radius) {
  var A = "(around:" + radius + "," + list + ")";
  // Tre clausole invece di quattro: le fontane decorative senza acqua potabile
  // vengono scartate dopo, lato nostro, cosi' la richiesta resta piu' corta.
  return "[out:json][timeout:60];("
    + 'node["amenity"~"^(drinking_water|fountain)$"]' + A + ";"
    + 'node["man_made"="water_tap"]' + A + ";"
    + 'node["natural"="spring"]' + A + ";"
    + ");out body;";
}

function loadRouteWater() {
  clearRouteWater();
  if (!rbTrack || rbTrack.length < 2) return;
  var track = rbTrack.map(function (c) { return [c[0], c[1]]; });
  var pts = op2Sample(track, OP2_MAX_PTS);
  if (pts.length < 2) return;
  var RAD = 200;
  var sig = op2Sig(track, "w" + RAD);

  op2Run(sig, op2WaterQuery(op2List(pts), RAD), function (nodes, ok) {
    var box = document.getElementById("rwaterbox");
    if (!ok) {
      if (box) box.innerHTML = '<span style="color:var(--txt2)">&#x26A0;&#xFE0F; Servizio acqua non raggiungibile. '
        + '<a href="#" data-act="retryRouteWater">Riprova</a></span>';
      return;
    }
    var out = [];
    nodes.forEach(function (el) {
      var t = el.tags || {};
      if (t.drinking_water === "no") return;                       // esplicitamente non potabile
      if (t.amenity === "fountain" && t.drinking_water !== "yes") return;  // fontana ornamentale
      var r = distPtToTrack(el.lat, el.lon, track);
      if (r && r.distM <= RAD) {
        out.push({ lat: el.lat, lon: el.lon, name: (t.name || ""), pot: waterPot(t), along: r.along, dist: r.distM });
      }
    });
    out.sort(function (a, b) { return a.along - b.along; });
    routeWater = out;
    drawRouteWater();
    if (typeof drawRouteProfile === "function") drawRouteProfile();
    if (typeof fillRouteWaterBox === "function") fillRouteWaterBox(out);
  });
}
/* "Riprova" dal riquadro: svuota la cache di questo percorso e rilancia. */
function retryRouteWater() {
  if (!rbTrack || rbTrack.length < 2) return;
  var track = rbTrack.map(function (c) { return [c[0], c[1]]; });
  delete op2Cache[op2Sig(track, "w200")];
  var box = document.getElementById("rwaterbox");
  if (box) box.innerHTML = '<span style="color:var(--txt2)">Ricerca fontane e sorgenti&#8230;</span>';
  loadRouteWater();
  return false;
}

/* ------------------------------- RISTORI ----------------------------------- */
function op2StopQuery(list, radius) {
  var A = "(around:" + radius + "," + list + ")";
  return "[out:json][timeout:60];("
    + 'node["amenity"~"^(cafe|bar|pub|restaurant|fast_food|ice_cream)$"]' + A + ";"
    + 'node["shop"~"^(bakery|convenience|supermarket|greengrocer|pastry)$"]' + A + ";"
    + ");out body;";
}

function loadRwStops() {
  if (!rbTrack || rbTrack.length < 2) return;
  var buf = parseInt((document.getElementById("rw-buf") || {}).value, 10) || 250;
  var track = rbTrack.map(function (c) { return [c[0], c[1]]; });
  var pts = op2Sample(track, OP2_MAX_PTS);
  if (pts.length < 2) return;
  var b = document.getElementById("rwstopbox");
  if (b) b.innerHTML = '<span style="color:var(--txt2)">Ricerca ristori&#8230;</span>';
  var sig = op2Sig(track, "s" + buf);

  op2Run(sig, op2StopQuery(op2List(pts), buf), function (nodes, ok) {
    if (!ok) {
      if (b) b.innerHTML = '<span style="color:var(--txt2)">&#x26A0;&#xFE0F; Overpass non raggiungibile. '
        + '<a href="#" data-act="retryRwStops">Riprova</a></span>';
      return;
    }
    var out = [];
    nodes.forEach(function (el) {
      var r = distPtToTrack(el.lat, el.lon, track);
      if (!r || r.distM > buf) return;
      var t = el.tags || {};
      out.push({
        lat: el.lat, lon: el.lon, name: t.name || rwStopType(t), kind: rwStopType(t),
        oh: t.opening_hours || "", along: r.along, dist: r.distM
      });
    });
    out.sort(function (a, b2) { return a.along - b2.along; });
    rwStops = out;
    drawRwStops();
    if (typeof fillRwStopBox === "function") fillRwStopBox(buf);
    // aggancio usato dal download "GPX + punti utili"
    if (typeof rwStopsThen === "function") { var f = rwStopsThen; rwStopsThen = null; f(); }
  });
}
function retryRwStops() {
  if (!rbTrack || rbTrack.length < 2) return;
  var buf = parseInt((document.getElementById("rw-buf") || {}).value, 10) || 250;
  var track = rbTrack.map(function (c) { return [c[0], c[1]]; });
  delete op2Cache[op2Sig(track, "s" + buf)];
  loadRwStops();
  return false;
}

/* --------------- LUOGHI lungo il percorso (per il roadbook) ---------------- */
/* Non viene chiamata all'apertura del percorso: solo quando serve davvero,
   cioe' alla generazione del roadbook. Una richiesta in meno nel caso normale. */
var routePlaces = [];
function loadRoutePlaces(cb) {
  if (!rbTrack || rbTrack.length < 2) { if (cb) cb([]); return; }
  var track = rbTrack.map(function (c) { return [c[0], c[1]]; });
  var pts = op2Sample(track, 120);
  var RAD = 1200;                                  // un paese a 1 km dal percorso e' comunque un riferimento
  var sig = op2Sig(track, "p" + RAD);
  var q = "[out:json][timeout:60];("
    + 'node["place"~"^(city|town|village)$"](around:' + RAD + "," + op2List(pts) + ");"
    + ");out body;";
  op2Run(sig, q, function (nodes, ok) {
    if (!ok) { routePlaces = []; if (cb) cb([]); return; }
    var out = [];
    nodes.forEach(function (el) {
      var t = el.tags || {};
      if (!t.name) return;
      var r = distPtToTrack(el.lat, el.lon, track);
      if (!r || r.distM > RAD) return;
      out.push({ name: t.name, place: t.place, along: r.along, dist: r.distM, lat: el.lat, lon: el.lon });
    });
    out.sort(function (a, b) { return a.along - b.along; });
    routePlaces = out;
    if (cb) cb(out);
  });
}
