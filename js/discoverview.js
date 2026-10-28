/* ==========================================================================
 * discoverview.js - revisione delle salite trovate dalla rete stradale.
 *
 * Attivo SOLO con https://locaride.app/?discover=er (per gli altri utenti non fa nulla e non
 * scarica niente). Carica data/discover_<regione>.json (workflow "OSM discover") e mostra ogni
 * salita nuova come cerchio sulla mappa; si apre come una salita vera, con "Buona" / "Da
 * scartare" in cima al pannello. Le scelte restano sul dispositivo; "Copia esito" le copia per
 * incollarle in chat.
 *
 * Centinaia di salite non si rivedono a mano una per una. Quindi:
 *  - ogni salita va in un GRUPPO: "doppione" (tutti i versanti corrono per >= 80% su strade di
 *    salite gia' pubblicate), "sterrata" (fondo in cima non asfaltato), "piccola" (< 200 m di
 *    dislivello), altrimenti "nuova";
 *  - "Prossima" propone prima un CAMPIONE A CASO di 30 "nuove": dal risultato si stima quante
 *    sono buone, e se la quota e' alta il gruppo si pubblica intero senza guardarle tutte.
 * Modulo autonomo, caricato per ultimo. Funzioni dv* senza DOM pure e testate. ASCII.
 * ==========================================================================*/

var DV = { region: null, list: [], byId: {}, layer: null, marks: {}, dec: {}, grp: {}, ov: {}, SAMPLE: 30, told: false };
var DV_RANK = { nuova: 0, piccola: 1, doppione: 2, sterrata: 3 };
var DV_LABEL = { nuova: "nuova", piccola: "piccola (sotto 200 m)", doppione: "doppione o variante di una salita gia' pubblicata", sterrata: "fondo non asfaltato in cima" };

function dvParam() { var m = /[?&]discover=([a-z_]+)/.exec(location.search || ""); return m ? m[1] : null; }
function dvKey() { return "lr_disc_" + DV.region; }
function dvLoadDec() { try { DV.dec = JSON.parse(localStorage.getItem(dvKey()) || "{}") || {}; } catch (e) { DV.dec = {}; } }
function dvSaveDec() { try { localStorage.setItem(dvKey(), JSON.stringify(DV.dec)); } catch (e) { /* ignore */ } }
function dvEsc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function dvGain(p) { var g = 0; (p.versanti || []).forEach(function (v) { var d = (v.endElevation || 0) - (v.startElevation || 0); if (d > g) g = d; }); return g; }
function dvHav(a, b, c, d) { var r = Math.PI / 180, x = Math.pow(Math.sin((c - a) * r / 2), 2) + Math.cos(a * r) * Math.cos(c * r) * Math.pow(Math.sin((d - b) * r / 2), 2); return 2 * 6371 * Math.asin(Math.sqrt(x)); }

/* pure: stable pseudo-random rank from the id (same sample on every device and reload) */
function dvHash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/* pure: grid of the track points of the climbs already published */
function dvGrid(passes) {
  var g = {}, cell = 0.01;
  (passes || []).forEach(function (p) {
    (p.versanti || []).forEach(function (v) {
      var t = v.track || [];
      for (var i = 0; i < t.length; i += 2) { var k = Math.floor(t[i][0] / cell) + ":" + Math.floor(t[i][1] / cell); (g[k] = g[k] || []).push(t[i]); }
    });
  });
  return g;
}
/* pure: share (0..1) of a track that runs on the roads of published climbs (within 80 m) */
function dvOverlap(track, grid) {
  var cell = 0.01, hit = 0, n = 0;
  for (var i = 0; i < (track || []).length; i += 3) {
    n++;
    var t = track[i], ci = Math.floor(t[0] / cell), cj = Math.floor(t[1] / cell), on = false;
    for (var a = -1; a <= 1 && !on; a++) for (var b = -1; b <= 1 && !on; b++) {
      var lst = grid[(ci + a) + ":" + (cj + b)] || [];
      for (var j = 0; j < lst.length; j++) if (dvHav(t[0], t[1], lst[j][0], lst[j][1]) < 0.08) { on = true; break; }
    }
    if (on) hit++;
  }
  return n ? hit / n : 0;
}
/* pure: the group of a discovered climb; ovMin = overlap of its LEAST known versante */
function dvGroup(p, ovMin) {
  if (ovMin >= 0.8) return "doppione";
  if (/sterrato|unpaved|gravel/i.test(p.surfaceLabel || "")) return "sterrata";
  if (dvGain(p) < 200) return "piccola";
  return "nuova";
}
/* pure: review order = undecided first; inside, "nuova" first in random (hash) order */
function dvOrder(list, dec, grp) {
  grp = grp || {};
  return list.slice().sort(function (a, b) {
    var da = dec[a.id] == null ? 0 : 1, db = dec[b.id] == null ? 0 : 1;
    if (da !== db) return da - db;
    var ga = DV_RANK[grp[a.id] || "nuova"], gb = DV_RANK[grp[b.id] || "nuova"];
    return ga - gb || dvHash(a.id) - dvHash(b.id);
  });
}
function dvCounts(list, dec, grp) {
  var c = { ok: 0, no: 0, todo: 0, sample: 0, groups: {} };
  grp = grp || {};
  list.forEach(function (p) {
    var g = grp[p.id] || "nuova";
    c.groups[g] = (c.groups[g] || 0) + 1;
    if (dec[p.id] === 1) c.ok++; else if (dec[p.id] === 0) c.no++; else c.todo++;
    if (g === "nuova" && dec[p.id] != null) c.sample++;
  });
  return c;
}

function dvColor(id) {
  if (DV.dec[id] === 1) return "#16a34a";
  if (DV.dec[id] === 0) return "#64748b";
  return (DV.grp[id] || "nuova") === "nuova" ? "#c026d3" : "#a78bfa";
}
function dvBar() {
  var b = document.getElementById("dv-bar");
  if (!b) { b = document.createElement("div"); b.id = "dv-bar"; document.body.appendChild(b); }
  var c = dvCounts(DV.list, DV.dec, DV.grp), G = c.groups;
  b.innerHTML = "<b>Prova " + dvEsc(DV.region.toUpperCase()) + "</b> &middot; " + DV.list.length + " salite"
    + " &middot; campione <b>" + Math.min(c.sample, DV.SAMPLE) + "/" + DV.SAMPLE + "</b>"
    + ' &middot; <span style="color:#16a34a">&#x2714; ' + c.ok + '</span> <span style="color:#64748b">&#x2716; ' + c.no + "</span>"
    + ' <button type="button" id="dv-next">Prossima &#x203A;</button><button type="button" id="dv-copy">Copia esito</button>'
    + '<div class="dv-g">nuove ' + (G.nuova || 0) + " &middot; piccole " + (G.piccola || 0) + " &middot; doppioni " + (G.doppione || 0) + " &middot; sterrate " + (G.sterrata || 0) + "</div>";
  document.getElementById("dv-next").onclick = dvNext;
  document.getElementById("dv-copy").onclick = dvCopy;
  if (c.sample >= DV.SAMPLE && !DV.told) { DV.told = true; setTimeout(function () { alert("Campione di " + DV.SAMPLE + " fatto. Premi \"Copia esito\" e incollalo in chat: da qui decidiamo se pubblicare il gruppo intero."); }, 300); }
}
function dvOpen(p) {
  if (!p) return;
  map.setView([p.lat, p.lon], Math.max(map.getZoom(), 12));
  openPass(p, true);
}
function dvNext() {
  var cur = (typeof CUR_PASS !== "undefined" && CUR_PASS) ? CUR_PASS.id : null;
  var todo = dvOrder(DV.list, DV.dec, DV.grp).filter(function (p) { return DV.dec[p.id] == null && p.id !== cur; });
  if (!todo.length) { alert("Finito: tutte le salite hanno un giudizio. Premi \"Copia esito\" e incollalo in chat."); return; }
  dvOpen(todo[0]);
}
function dvCopy() {
  var ok = [], no = [];
  DV.list.forEach(function (p) { if (DV.dec[p.id] === 1) ok.push(p.id); else if (DV.dec[p.id] === 0) no.push(p.id); });
  var txt = JSON.stringify({ region: DV.region, groups: dvCounts(DV.list, DV.dec, DV.grp).groups, ok: ok, no: no });
  var done = function () { alert("Copiato: " + ok.length + " buone, " + no.length + " da scartare. Incollalo in chat."); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { window.prompt("Copia questo testo:", txt); });
  else window.prompt("Copia questo testo:", txt);
}
function dvDecide(id, val) {
  DV.dec[id] = val; dvSaveDec();
  var m = DV.marks[id]; if (m) m.setStyle({ color: dvColor(id), fillColor: dvColor(id) });
  dvBar(); dvNext();
}
function dvPanelBox(p) {
  var dp = document.getElementById("dp"); if (!dp || !p || !DV.byId[p.id]) return;
  var old = document.getElementById("dv-box"); if (old) old.parentNode.removeChild(old);
  var box = document.createElement("div"); box.id = "dv-box";
  var st = DV.dec[p.id] === 1 ? "giudicata buona" : DV.dec[p.id] === 0 ? "giudicata da scartare" : "da giudicare";
  var g = DV.grp[p.id] || "nuova", ov = DV.ov[p.id];
  box.innerHTML = '<div class="dv-h">&#x1F50E; Salita trovata dalla rete stradale (' + st + ")</div>"
    + '<div class="dv-s">Gruppo: <b>' + DV_LABEL[g] + "</b>" + (ov != null ? " &middot; strada gi&agrave; nota: " + Math.round(ov * 100) + "%" : "")
    + "<br>Cima a " + (p.elevation || "?") + " m &middot; si scende almeno " + (p.prom || "?") + " m prima di trovare strada pi&ugrave; alta."
    + "<br>Buona se: &egrave; una salita che un ciclista farebbe, asfaltata, con partenza sensata. Il nome si sistema dopo.</div>"
    + '<button type="button" class="dv-ok">&#x2714; Buona</button><button type="button" class="dv-no">&#x2716; Da scartare</button>';
  var body = dp.querySelector(".dp-body"); if (!body) return;
  body.insertBefore(box, body.firstChild);
  box.querySelector(".dv-ok").onclick = function () { dvDecide(p.id, 1); };
  box.querySelector(".dv-no").onclick = function () { dvDecide(p.id, 0); };
}
function dvClassify() {
  var known = (typeof osmPasses !== "undefined" ? osmPasses : []).concat(typeof PASSES_DATA !== "undefined" ? PASSES_DATA : []);
  var la0 = 90, la1 = -90, lo0 = 180, lo1 = -180;
  DV.list.forEach(function (p) { la0 = Math.min(la0, p.lat); la1 = Math.max(la1, p.lat); lo0 = Math.min(lo0, p.lon); lo1 = Math.max(lo1, p.lon); });
  known = known.filter(function (p) { return p.lat > la0 - 0.3 && p.lat < la1 + 0.3 && p.lon > lo0 - 0.3 && p.lon < lo1 + 0.3; }); // only the area under review
  var grid = dvGrid(known);
  DV.list.forEach(function (p) {
    var mn = 1;
    (p.versanti || []).forEach(function (v) { var o = dvOverlap(v.track, grid); if (o < mn) mn = o; });
    DV.ov[p.id] = mn; DV.grp[p.id] = dvGroup(p, mn);
    var m = DV.marks[p.id]; if (m) m.setStyle({ color: dvColor(p.id), fillColor: dvColor(p.id) });
  });
  dvBar();
}
function dvShow(arr) {
  DV.list = (arr || []).filter(function (p) { return p && p.versanti && p.versanti.length; });
  DV.list.forEach(function (p) { DV.byId[p.id] = p; });
  DV.layer = L.layerGroup().addTo(map);
  DV.list.forEach(function (p) {
    var m = L.circleMarker([p.lat, p.lon], { radius: 8, weight: 3, color: dvColor(p.id), fillColor: dvColor(p.id), fillOpacity: 0.35 })
      .bindTooltip(dvEsc(p.name) + " &middot; +" + dvGain(p) + " m").on("click", function () { dvOpen(p); });
    m.addTo(DV.layer); DV.marks[p.id] = m;
  });
  dvBar();
  if (DV.list.length) map.fitBounds(L.latLngBounds(DV.list.map(function (p) { return [p.lat, p.lon]; })).pad(0.05));
  // the groups need the published tracks: wait for the background load of the region files
  var ready = (typeof osmFullPending !== "undefined" && osmFullPending) ? osmFullPending : Promise.resolve();
  ready.then(dvClassify, dvClassify);
}
function dvStyle() {
  var s = document.createElement("style");
  s.textContent = "#dv-bar{position:fixed;top:118px;left:50%;transform:translateX(-50%);z-index:1100;background:var(--bg,#fff);color:var(--txt,#111);border:2px solid #c026d3;border-radius:12px;padding:6px 10px;font-size:.8rem;box-shadow:0 4px 14px rgba(0,0,0,.18);white-space:nowrap;max-width:96vw;overflow-x:auto}" +
    "body.dp-open #dv-bar{top:auto;bottom:80px;left:12px;transform:none;white-space:normal;max-width:280px;line-height:1.9}" +
    "#dv-bar .dv-g{font-size:.72rem;color:var(--txt2,#555)}" +
    "#dv-bar button,#dv-box button{margin-left:6px;padding:4px 10px;border-radius:8px;border:1px solid var(--bdr,#ccc);background:var(--bg2,#f4f4f5);color:inherit;font:inherit;font-weight:700;cursor:pointer}" +
    "#dv-box{margin:0 0 12px;padding:10px;border:2px solid #c026d3;border-radius:10px}#dv-box .dv-h{font-weight:700;margin-bottom:4px}#dv-box .dv-s{font-size:.78rem;color:var(--txt2,#555);margin-bottom:8px;line-height:1.5}" +
    "#dv-box .dv-ok{background:#16a34a;color:#fff;border:0;margin-left:0}#dv-box .dv-no{background:#64748b;color:#fff;border:0}";
  document.head.appendChild(s);
}
function dvStart() {
  DV.region = dvParam(); if (!DV.region) return;
  if (typeof map === "undefined" || typeof openPass !== "function" || typeof renderPassPanel !== "function" || typeof L === "undefined") { setTimeout(dvStart, 400); return; }
  dvLoadDec(); dvStyle();
  var rp = renderPassPanel;
  renderPassPanel = function (p) { var r = rp.apply(this, arguments); try { dvPanelBox(p); } catch (e) { /* ignore */ } return r; };
  fetch(DATA_DIR + "discover_" + DV.region + ".json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(dvShow)
    .catch(function () { alert("File data/discover_" + DV.region + ".json non trovato: prima va lanciato il workflow \"OSM discover\" su GitHub."); });
}
if (typeof document !== "undefined" && document.addEventListener && typeof location !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", dvStart); else dvStart();
}
