/* ==========================================================================
 * gpxclimbs.js - "Scopri salite da un giro": carichi il GPX di un giro fatto
 * (Garmin, Strava, Komoot, Wahoo...), il modulo trova le salite dentro il giro,
 * dice quali conosciamo gia' e propone quelle che mancano.
 *
 * Perche': l'euristica OSM non trova tutto (Monte Nerone, 16 km). Chi pedala in
 * zona sa dove sono le salite: il suo giro e' la prova. Le proposte passano dalla
 * stessa revisione admin di contribute.js (lrcPropose), niente scorciatoie.
 *
 * Privacy: il file resta nel browser. Esce solo il tratto di salita che l'utente
 * decide di proporre.
 *
 * Dipende da: contribute.js (lrcPropose, lrcModal, lrcT, lrcHav, lrcBearing,
 * lrcMaxGradient, lrcFindMenus, lrcMenuItem), PASSES_DATA, osmPasses, map (Leaflet).
 * Le funzioni gc* senza DOM sono pure e testate (test/gpx-climbs.test.mjs). ASCII.
 * ==========================================================================*/

var GC = {
  STEP_M: 20,          // ricampionamento: un punto ogni 20 m
  SMOOTH: 7,           // media mobile su 7 campioni (~140 m): toglie il rumore GPS/baro
  H: 10,               // isteresi dello zig-zag: oscillazioni sotto 10 m non contano
  DIP_ABS: 40,         // una discesa fino a 40 m...
  DIP_REL: 0.2,        // ...o fino al 20% del dislivello fatto non spezza la salita
  MIN_KM: 1.5, MIN_GAIN: 100, MIN_AVG: 3,   // stesse soglie delle proposte
  TOP_KM: 0.6,         // una cima nota entro 600 m = stessa salita
  PASS_KM: 0.4,        // un passo noto entro 400 m dal tracciato = ci sei passato
  layer: null
};

function gcHav(la1, lo1, la2, lo2) {
  var R = 6371, p = Math.PI / 180;
  var x = Math.pow(Math.sin((la2 - la1) * p / 2), 2) + Math.cos(la1 * p) * Math.cos(la2 * p) * Math.pow(Math.sin((lo2 - lo1) * p / 2), 2);
  return 2 * R * Math.asin(Math.sqrt(x));
}
function gcBearing(la1, lo1, la2, lo2) {
  var p = Math.PI / 180, y = Math.sin((lo2 - lo1) * p) * Math.cos(la2 * p);
  var x = Math.cos(la1 * p) * Math.sin(la2 * p) - Math.sin(la1 * p) * Math.cos(la2 * p) * Math.cos((lo2 - lo1) * p);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/* ---------------------------------------------------------------- parsing */
/* Regex e non DOMParser: gira anche nei test senza browser, e un GPX e' XML
   semplice. Accetta trkpt e rtept, attributi in qualunque ordine. */
function gcParse(text) {
  var out = [], re = /<(trkpt|rtept)\b([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/g, m;
  while ((m = re.exec(String(text || ""))) !== null) {
    var la = /\blat\s*=\s*["']([-+\d.eE]+)/.exec(m[2]), lo = /\blon\s*=\s*["']([-+\d.eE]+)/.exec(m[2]);
    if (!la || !lo) continue;
    var el = m[4] ? /<ele>\s*([-+\d.eE]+)\s*<\/ele>/.exec(m[4]) : null;
    var p = [+la[1], +lo[1], el ? +el[1] : null];
    if (isFinite(p[0]) && isFinite(p[1])) out.push(p);
  }
  return out;
}

/* ---------------------------------------- ricampiona per distanza + liscia */
function gcResample(pts, step) {
  step = step || GC.STEP_M;
  var d = [0], i;
  for (i = 1; i < pts.length; i++) d.push(d[i - 1] + gcHav(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) * 1000);
  var tot = d[d.length - 1], R = { d: [], e: [], la: [], lo: [] }, j = 0;
  for (var s = 0; s <= tot; s += step) {
    while (j < d.length - 2 && d[j + 1] < s) j++;
    var span = d[j + 1] - d[j], t = span > 0 ? (s - d[j]) / span : 0;
    var a = pts[j], b = pts[j + 1] || a;
    R.d.push(s); R.la.push(a[0] + (b[0] - a[0]) * t); R.lo.push(a[1] + (b[1] - a[1]) * t);
    R.e.push(a[2] == null || b[2] == null ? (a[2] == null ? b[2] : a[2]) : a[2] + (b[2] - a[2]) * t);
  }
  var w = GC.SMOOTH, h = (w - 1) / 2, sm = [];
  for (i = 0; i < R.e.length; i++) {
    var sum = 0, c = 0;
    for (var k = Math.max(0, i - h); k <= Math.min(R.e.length - 1, i + h); k++) if (R.e[k] != null) { sum += R.e[k]; c++; }
    sm.push(c ? sum / c : null);
  }
  R.e = sm;
  return R;
}

/* ------------------------------------------------------ trova le salite */
/* Zig-zag con isteresi -> minimi e massimi alternati. Poi, da ogni minimo, la
   salita prosegue finche' le discese intermedie restano piccole e il massimo
   successivo e' piu' alto: un falsopiano o una contropendenza di 30 m non
   spezzano lo Stelvio in tre. Infine si toglie il pianoro iniziale. */
function gcFindClimbs(R, opt) {
  opt = opt || {};
  var H = opt.H || GC.H, e = R.e, n = e.length, piv = [], i;
  if (n < 3) return [];
  var trend = 0, lo = 0, hi = 0, ext = 0;
  for (i = 1; i < n; i++) {
    if (e[i] == null) continue;
    if (trend === 0) {
      if (e[i] < e[lo]) lo = i; if (e[i] > e[hi]) hi = i;
      if (e[i] - e[lo] >= H) { piv.push({ i: lo, t: "min" }); trend = 1; ext = i; }
      else if (e[hi] - e[i] >= H) { piv.push({ i: hi, t: "max" }); trend = -1; ext = i; }
    } else if (trend === 1) {
      if (e[i] >= e[ext]) ext = i;
      else if (e[ext] - e[i] >= H) { piv.push({ i: ext, t: "max" }); trend = -1; ext = i; }
    } else {
      if (e[i] <= e[ext]) ext = i;
      else if (e[i] - e[ext] >= H) { piv.push({ i: ext, t: "min" }); trend = 1; ext = i; }
    }
  }
  if (trend !== 0) piv.push({ i: ext, t: trend === 1 ? "max" : "min" });

  var out = [], k = 0;
  while (k < piv.length) {
    if (piv[k].t !== "min" || !piv[k + 1]) { k++; continue; }
    var s = piv[k].i, tk = k + 1, top = piv[tk].i;
    while (piv[tk + 2]) {
      var dip = e[top] - e[piv[tk + 1].i], gainSoFar = e[top] - e[s];
      if (dip > Math.max(GC.DIP_ABS, GC.DIP_REL * gainSoFar) || e[piv[tk + 2].i] <= e[top]) break;
      tk += 2; top = piv[tk].i;
    }
    /* pianoro iniziale: avanza finche' i 400 m successivi salgono meno del 2% */
    var look = Math.max(1, Math.round(400 / GC.STEP_M));
    while (s + look < top && e[s + look] - e[s] < 0.02 * 400) s++;
    var km = (R.d[top] - R.d[s]) / 1000, gain = e[top] - e[s], avg = km > 0 ? gain / (km * 10) : 0;
    if (km >= GC.MIN_KM && gain >= GC.MIN_GAIN && avg >= GC.MIN_AVG)
      out.push({ i0: s, i1: top, km: +km.toFixed(2), gain: Math.round(gain), avg: +avg.toFixed(1) });
    k = tk + 1;
  }
  return out;
}

/* tratto di salita come [lat,lon,ele] (il formato di rbTrack e delle proposte) */
function gcSegment(R, c) {
  var tr = [];
  for (var i = c.i0; i <= c.i1; i++) tr.push([+R.la[i].toFixed(5), +R.lo[i].toFixed(5), R.e[i] == null ? null : Math.round(R.e[i])]);
  return tr;
}

/* ------------------------------------------------------ gia' la conosciamo? */
/* passes: [{id,name,lat,lon,elevation,versanti:[{side,startLat,startLon}]}]
   Esito: known (stessa cima e stesso versante), newside (cima nota, versante
   nuovo), via (ci passa ma finisce altrove: non si propone), new. */
function gcMatch(tr, passes) {
  var top = tr[tr.length - 1], start = tr[0], best = null, bd = GC.TOP_KM, via = null, i;
  var minLa = 90, maxLa = -90, minLo = 180, maxLo = -180;
  for (i = 0; i < tr.length; i++) { minLa = Math.min(minLa, tr[i][0]); maxLa = Math.max(maxLa, tr[i][0]); minLo = Math.min(minLo, tr[i][1]); maxLo = Math.max(maxLo, tr[i][1]); }
  var pad = 0.01;
  for (var j = 0; j < passes.length; j++) {
    var p = passes[j];
    if (!p || p.lat < minLa - pad || p.lat > maxLa + pad || p.lon < minLo - pad || p.lon > maxLo + pad) continue;
    var dt = gcHav(top[0], top[1], p.lat, p.lon);
    if (dt < bd) { bd = dt; best = p; continue; }
    if (!via && (p.elevation || 0) >= (start[2] || 0) + GC.MIN_GAIN) {
      for (i = Math.floor(tr.length * 0.4); i < tr.length; i += 3)
        if (gcHav(tr[i][0], tr[i][1], p.lat, p.lon) < GC.PASS_KM) { via = p; break; }
    }
  }
  if (!best) return via ? { kind: "via", pass: via } : { kind: "new" };
  var vs = best.versanti || [];
  if (!vs.length) return { kind: "known", pass: best };
  var b = gcBearing(best.lat, best.lon, start[0], start[1]);
  for (i = 0; i < vs.length; i++) {
    var v = vs[i];
    if (!isFinite(v.startLat) || !isFinite(v.startLon)) return { kind: "known", pass: best };
    var d = Math.abs(gcBearing(best.lat, best.lon, v.startLat, v.startLon) - b); d = Math.min(d, 360 - d);
    if (d < 60 || gcHav(start[0], start[1], v.startLat, v.startLon) < 3) return { kind: "known", pass: best, side: v.side };
  }
  return { kind: "newside", pass: best };
}

function gcAnalyze(text, passes) {
  var pts = gcParse(text);
  if (pts.length < 20) return { err: "few" };
  var withEle = 0; for (var i = 0; i < pts.length; i++) if (pts[i][2] != null) withEle++;
  if (withEle < pts.length * 0.8) return { err: "noele" };
  var R = gcResample(pts), cl = gcFindClimbs(R), tot = R.d[R.d.length - 1] / 1000;
  var up = 0; for (i = 1; i < R.e.length; i++) if (R.e[i] > R.e[i - 1]) up += R.e[i] - R.e[i - 1];
  return {
    km: +tot.toFixed(1), gain: Math.round(up), R: R,
    climbs: cl.map(function (c) { var tr = gcSegment(R, c); c.tr = tr; c.top = tr[tr.length - 1]; c.match = gcMatch(tr, passes || []); return c; })
  };
}

/* ================================================================== UI */
function gcT(it, en) { return typeof lrcT === "function" ? lrcT(it, en) : it; }
function gcEsc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function gcNum(x, d) { return String((+x).toFixed(d == null ? 1 : d)).replace(".", ","); }

function gcAllPasses() {
  var a = [];
  try { if (typeof PASSES_DATA !== "undefined") a = a.concat(PASSES_DATA); } catch (e) {}
  try { if (typeof osmPasses !== "undefined") a = a.concat(osmPasses); } catch (e) {}
  return a;
}

function gcPick() {
  var inp = document.createElement("input");
  inp.type = "file"; inp.accept = ".gpx,application/gpx+xml";
  inp.addEventListener("change", function () {
    var f = inp.files && inp.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      /* i versanti OSM arrivano in background: aspettali, se non ci sono ancora */
      var ready = (typeof osmFullPending !== "undefined" && osmFullPending && osmFullPending.then) ? osmFullPending : Promise.resolve();
      if (typeof lrcModal === "function") lrcModal("<h3>" + gcT("Analizzo il giro...", "Analysing the ride...") + "</h3>");
      ready.then(function () {}, function () {}).then(function () { gcShow(gcAnalyze(rd.result, gcAllPasses()), f.name); });
    };
    rd.readAsText(f);
  });
  inp.click();
}

var GC_LAST = null;
function gcShow(res, fname) {
  GC_LAST = res;
  if (res.err) {
    lrcModal("<h3>" + gcT("Non riesco a leggere il giro", "Can't read this ride") + "</h3><p class=\"lrc-sub\">"
      + (res.err === "noele"
        ? gcT("Il file non ha le quote. Da Strava, Garmin Connect o Komoot esporta il GPX originale dell'attivita': contiene l'altitudine.",
              "The file has no elevation. Export the original activity GPX from Strava, Garmin Connect or Komoot: it includes altitude.")
        : gcT("Nel file ci sono troppo pochi punti per essere un giro.", "Too few points in the file to be a ride."))
      + '</p><div class="lrc-btns"><button onclick="lrcClose()">' + gcT("Chiudi", "Close") + "</button></div>");
    return;
  }
  var nNew = 0, h = "<h3>" + gcT("Salite nel giro", "Climbs in this ride") + "</h3>"
    + '<p class="lrc-sub">' + gcEsc(fname || "") + " &middot; " + gcNum(res.km) + " km &middot; +" + res.gain + " m. "
    + gcT("Il file resta sul tuo dispositivo: esce solo la salita che decidi di proporre.", "The file stays on your device: only the climb you choose to suggest leaves it.") + "</p>";
  if (!res.climbs.length) h += '<div class="lrc-empty">' + gcT("Nessuna salita sopra 1,5 km e 100 m di dislivello.", "No climbs above 1.5 km and 100 m of gain.") + "</div>";
  res.climbs.forEach(function (c, i) {
    var m = c.match, p = m.pass, title, st, act = "";
    if (m.kind === "known") { title = gcEsc(p.name) + (m.side ? " &middot; " + gcEsc(m.side) : ""); st = '<span class="lrc-st approved">' + gcT("gia' in LocaRide", "already in LocaRide") + "</span>"; act = '<button onclick="gcOpen(' + i + ')">' + gcT("Apri", "Open") + "</button>"; }
    else if (m.kind === "via") { title = gcT("Sale verso ", "Climbs past ") + gcEsc(p.name); st = '<span class="lrc-st approved">' + gcT("nota", "known") + "</span>"; }
    else if (m.kind === "newside") { nNew++; title = gcEsc(p.name) + " &middot; " + gcT("versante nuovo", "new side"); st = '<span class="lrc-st pending">' + gcT("manca", "missing") + "</span>"; act = '<button class="lrc-go" onclick="gcPropose(' + i + ')">' + gcT("Proponi", "Suggest") + "</button>"; }
    else { nNew++; title = gcT("Salita senza nome", "Unnamed climb") + " &middot; " + gcT("cima a ", "top at ") + Math.round(c.top[2]) + " m"; st = '<span class="lrc-st pending">' + gcT("manca", "missing") + "</span>"; act = '<button class="lrc-go" onclick="gcPropose(' + i + ')">' + gcT("Proponi", "Suggest") + "</button>"; }
    h += '<div class="lrc-item">' + st + "<h4>" + title + "</h4>"
      + '<div class="lrc-meta">' + gcNum(c.km) + " km &middot; +" + c.gain + " m &middot; " + gcNum(c.avg) + "% " + gcT("medio", "avg") + "</div>"
      + (act ? '<div class="lrc-btns" style="margin-top:8px">' + act + "</div>" : "") + "</div>";
  });
  if (nNew) h += '<p class="lrc-sub" style="margin-top:10px">' + gcT("Le salite che mancano passano dalla revisione prima di comparire nella mappa.", "Missing climbs are reviewed before they appear on the map.") + "</p>";
  h += '<div class="lrc-btns"><button onclick="lrcClose()">' + gcT("Chiudi", "Close") + "</button>"
    + (res.climbs.length ? '<button onclick="gcDraw()">' + gcT("Vedi sulla mappa", "Show on map") + "</button>" : "") + "</div>";
  lrcModal(h);
}

function gcOpen(i) {
  var c = GC_LAST && GC_LAST.climbs[i]; if (!c || !c.match.pass) return;
  lrcClose();
  var p = c.match.pass;
  try { if (String(p.id).indexOf("osm-") === 0 || String(p.id).indexOf("usr-") === 0) openOsmD(p.id); else openD(p.id); } catch (e) {}
}

function gcPropose(i) {
  var c = GC_LAST && GC_LAST.climbs[i]; if (!c) return;
  lrcClose();
  lrcPropose(c.tr, { name: c.match.kind === "newside" ? c.match.pass.name : "" });
}

/* traccia del giro in grigio, salite nuove in viola, note in blu */
function gcDraw() {
  if (typeof L === "undefined" || typeof map === "undefined" || !GC_LAST || !GC_LAST.R) return;
  lrcClose();
  gcClear();
  var R = GC_LAST.R, all = [], i;
  for (i = 0; i < R.la.length; i += 2) all.push([R.la[i], R.lo[i]]);
  GC.layer = L.layerGroup().addTo(map);
  L.polyline(all, { color: "#64748b", weight: 3, opacity: 0.7 }).addTo(GC.layer);
  GC_LAST.climbs.forEach(function (c) {
    var col = (c.match.kind === "new" || c.match.kind === "newside") ? "#a855f7" : "#2563eb";
    L.polyline(c.tr.map(function (p) { return [p[0], p[1]]; }), { color: col, weight: 6, opacity: 0.9 }).addTo(GC.layer);
  });
  try { map.fitBounds(L.polyline(all).getBounds().pad(0.08)); } catch (e) {}
  var chip = document.createElement("button");
  chip.id = "gc-chip";
  chip.innerHTML = "&#x2715; " + gcT("Nascondi giro GPX", "Hide GPX ride");
  chip.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);top:70px;z-index:1200;border:none;border-radius:20px;padding:7px 14px;background:#334155;color:#fff;font-weight:700;font-size:.82rem;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25)";
  chip.addEventListener("click", gcClear);
  document.body.appendChild(chip);
}
function gcClear() {
  if (GC.layer && typeof map !== "undefined") { try { map.removeLayer(GC.layer); } catch (e) {} }
  GC.layer = null;
  var c = document.getElementById("gc-chip"); if (c) c.parentNode.removeChild(c);
}

/* voce nel menu "+" (lo stesso di Proponi salita), aggiunta dall'esterno */
function gcWire() {
  if (typeof lrcFindMenus !== "function" || typeof lrcMenuItem !== "function") return;
  var m = lrcFindMenus().plus;
  if (!m || m._gcDone === 1) return;
  m._gcDone = 1;
  m.appendChild(lrcMenuItem("&#x1F50E;", gcT("Salite da un giro (GPX)", "Climbs from a ride (GPX)"), gcPick));
}
function gcStart() {
  gcWire();
  new MutationObserver(function () { try { gcWire(); } catch (e) {} }).observe(document.body, { childList: true, subtree: true });
}
if (typeof document !== "undefined" && document.addEventListener) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", gcStart); else gcStart();
}
