/* ==========================================================================
 * poilocal.js - acqua e ristori dai NOSTRI dati, non dai server Overpass pubblici.
 *
 * Fontanelle, sorgenti, bar e forni venivano chiesti in diretta a Overpass a ogni spostamento
 * della mappa. Quando quei server sono sovraccarichi (ottobre 2026: overpass-api.de e
 * private.coffee non rispondono, mail.ru da' 504) gli strati acqua e cibo morivano.
 * Ora scripts/build_poi.mjs (workflow "POI") mette gli stessi punti in riquadri statici
 * data/poi/c/<la>_<lo>.json da 0,25 gradi, serviti da Cloudflare col sito.
 *
 * Come: questo modulo avvolge overpassPost(). Ogni query dell'app (fontane della mappa, acqua
 * della salita, acqua e ristori lungo il percorso, strato cibo) viene letta: se riguarda solo
 * acqua/cibo e tutta la zona e' coperta dai riquadri, la risposta si costruisce da li', con
 * gli stessi filtri della query, nello stesso formato di Overpass. Altrimenti si va in rete
 * come prima. Nessun file esistente cambia. Funzioni poi* senza rete pure e testate. ASCII.
 * ==========================================================================*/

var POI = { idxP: null, idx: null, cells: {}, MAXCELLS: 40 };
var POI_KINDS = {
  amenity: ["drinking_water", "fountain", "cafe", "bar", "pub", "restaurant", "fast_food", "ice_cream"],
  man_made: ["water_tap"], natural: ["spring"],
  shop: ["bakery", "convenience", "supermarket", "greengrocer", "pastry"]
};

/* pure: query Overpass -> { clauses: [{ filters, bbox | around }], limit } oppure null se la
   query non e' una di quelle che i riquadri sanno servire */
function poiParse(q) {
  if (typeof q !== "string" || /\b(way|rel|relation|area|nwr)\s*[[(]|->|\bout\s+geom/.test(q)) return null;
  var re = /node((?:\["[^"]+"(?:=|!=|~)"[^"]*"\])+)\(([^)]*)\)/g, m, out = [];
  while ((m = re.exec(q))) {
    var filters = [], fr = /\["([^"]+)"(=|!=|~)"([^"]*)"\]/g, f;
    while ((f = fr.exec(m[1]))) filters.push({ k: f[1], op: f[2], v: f[3] });
    var first = filters[0];
    if (!first || first.op === "!=" || !POI_KINDS[first.k]) return null;     // not a water/food clause
    var nums = m[2].replace(/^around:/, "").split(",").map(Number), cl = { filters: filters };
    if (nums.some(isNaN)) return null;
    if (/^around:/.test(m[2])) {
      if (nums.length < 3 || (nums.length - 1) % 2) return null;
      var pts = []; for (var i = 1; i < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
      cl.around = { r: nums[0], pts: pts };
    } else if (nums.length === 4) cl.bbox = nums;
    else return null;
    out.push(cl);
  }
  if (!out.length) return null;
  var lim = /out\s+body\s+(\d+)/.exec(q);
  return { clauses: out, limit: lim ? +lim[1] : 0 };
}
function poiTagOk(t, f) {
  var v = t[f.k];
  if (f.op === "=") return v === f.v;
  if (f.op === "!=") return v !== f.v;
  if (v == null) return false;
  try { return new RegExp(f.v).test(v); } catch (e) { return false; }
}
/* metres from a point to a polyline (equirectangular, fine at a few hundred metres) */
function poiDistM(lat, lon, pts) {
  var best = Infinity, kx = Math.cos(lat * Math.PI / 180) * 111320, ky = 110540;
  if (pts.length === 1) return Math.hypot((lon - pts[0][1]) * kx, (lat - pts[0][0]) * ky);
  for (var i = 1; i < pts.length; i++) {
    var ax = (pts[i - 1][1] - lon) * kx, ay = (pts[i - 1][0] - lat) * ky, bx = (pts[i][1] - lon) * kx, by = (pts[i][0] - lat) * ky;
    var dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0;
    var d = Math.hypot(ax + t * dx, ay + t * dy); if (d < best) best = d;
  }
  return best;
}
function poiInArea(lat, lon, cl) {
  if (cl.bbox) return lat >= cl.bbox[0] && lat <= cl.bbox[2] && lon >= cl.bbox[1] && lon <= cl.bbox[3];
  return poiDistM(lat, lon, cl.around.pts) <= cl.around.r;
}
function poiCellKey(lat, lon) { return Math.floor(lat * 4) + "_" + Math.floor(lon * 4); }
/* pure: the 0.25 deg cells a parsed query touches */
function poiCellsFor(parsed) {
  var set = {};
  function addBox(s, w, n, e) {
    for (var a = Math.floor(s * 4); a <= Math.floor(n * 4); a++) for (var b = Math.floor(w * 4); b <= Math.floor(e * 4); b++) set[a + "_" + b] = 1;
  }
  parsed.clauses.forEach(function (cl) {
    if (cl.bbox) { addBox(cl.bbox[0], cl.bbox[1], cl.bbox[2], cl.bbox[3]); return; }
    var p = cl.around.pts, rd = cl.around.r / 111000 + 0.002;
    for (var i = 0; i < p.length; i++) {
      var q2 = i ? p[i - 1] : p[i];
      addBox(Math.min(p[i][0], q2[0]) - rd, Math.min(p[i][1], q2[1]) - rd / 0.7, Math.max(p[i][0], q2[0]) + rd, Math.max(p[i][1], q2[1]) + rd / 0.7);
    }
  });
  return Object.keys(set);
}
/* pure: Overpass-shaped answer from the cell contents ([[id,lat,lon,tags],...] lists) */
function poiAnswer(parsed, lists) {
  var els = [], seen = {};
  lists.forEach(function (list) {
    (list || []).forEach(function (r) {
      if (seen[r[0]]) return;
      var t = r[3] || {};
      for (var c = 0; c < parsed.clauses.length; c++) {
        var cl = parsed.clauses[c], ok = true;
        for (var j = 0; j < cl.filters.length && ok; j++) ok = poiTagOk(t, cl.filters[j]);
        if (ok && poiInArea(r[1], r[2], cl)) { seen[r[0]] = 1; els.push({ type: "node", id: r[0], lat: r[1], lon: r[2], tags: t }); break; }
      }
    });
  });
  if (parsed.limit && els.length > parsed.limit) els = els.slice(0, parsed.limit);
  return { elements: els, poiLocal: true };
}

function poiIndex() {
  if (!POI.idxP) POI.idxP = fetch(DATA_DIR + "poi/index.json", { cache: "no-cache" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { POI.idx = {}; ((j && j.cells) || []).forEach(function (k) { POI.idx[k] = 1; }); return POI.idx; })
    .catch(function () { POI.idx = {}; return POI.idx; });
  return POI.idxP;
}
function poiCell(k) {
  if (!POI.cells[k]) POI.cells[k] = fetch(DATA_DIR + "poi/c/" + k + ".json")
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (j) { return j.n || []; })
    .catch(function (e) { delete POI.cells[k]; throw e; });
  return POI.cells[k];
}
/* resolves to an Overpass-shaped answer, or null when the query must go to the network */
function poiLocal(q) {
  var parsed = poiParse(q);
  if (!parsed) return Promise.resolve(null);
  return poiIndex().then(function (idx) {
    var keys = poiCellsFor(parsed);
    if (!keys.length || keys.length > POI.MAXCELLS) return null;
    for (var i = 0; i < keys.length; i++) if (!idx[keys[i]]) return null;   // outside coverage
    return Promise.all(keys.map(poiCell)).then(function (lists) { return poiAnswer(parsed, lists); });
  }).catch(function () { return null; });
}
function poiStart() {
  if (typeof overpassPost !== "function") { setTimeout(poiStart, 300); return; }
  if (overpassPost._poi) return;
  var net = overpassPost;
  overpassPost = function (url, q, ms) {
    return poiLocal(q).then(function (r) { return r || net(url, q, ms); });
  };
  overpassPost._poi = 1;
}
if (typeof document !== "undefined" && typeof fetch === "function" && typeof DATA_DIR !== "undefined") poiStart();
