/* ==========================================================================
 * discoverview.js - revisione delle salite trovate dalla rete stradale.
 *
 * Attivo SOLO con https://locaride.app/?discover=er (per gli altri utenti non fa nulla e non
 * scarica niente). Carica data/discover_<regione>.json, prodotto dal workflow "OSM discover"
 * (build_osm_passes.mjs --discover), e mostra ogni salita nuova come cerchio viola sulla mappa.
 * Si apre come una salita vera (tracce, profilo, tempi), e in cima al pannello ci sono
 * "Buona" / "Da scartare". Le scelte restano sul dispositivo; "Copia esito" le copia per
 * incollarle in chat: e' cosi' che una salita passa da prova a pubblicata.
 * Modulo autonomo, caricato per ultimo. ASCII.
 * ==========================================================================*/

var DV = { region: null, list: [], byId: {}, layer: null, marks: {}, dec: {} };

function dvParam() { var m = /[?&]discover=([a-z_]+)/.exec(location.search || ""); return m ? m[1] : null; }
function dvKey() { return "lr_disc_" + DV.region; }
function dvLoadDec() { try { DV.dec = JSON.parse(localStorage.getItem(dvKey()) || "{}") || {}; } catch (e) { DV.dec = {}; } }
function dvSaveDec() { try { localStorage.setItem(dvKey(), JSON.stringify(DV.dec)); } catch (e) { /* ignore */ } }
function dvEsc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function dvGain(p) { var g = 0; (p.versanti || []).forEach(function (v) { var d = (v.endElevation || 0) - (v.startElevation || 0); if (d > g) g = d; }); return g; }
function dvColor(id) { return DV.dec[id] === 1 ? "#16a34a" : DV.dec[id] === 0 ? "#64748b" : "#c026d3"; }

/* pure: ordine di revisione = prima le non decise, dalla piu' dura */
function dvOrder(list, dec) {
  return list.slice().sort(function (a, b) {
    var da = dec[a.id] == null ? 0 : 1, db = dec[b.id] == null ? 0 : 1;
    return da - db || dvGain(b) - dvGain(a);
  });
}
function dvCounts(list, dec) {
  var c = { ok: 0, no: 0, todo: 0 };
  list.forEach(function (p) { if (dec[p.id] === 1) c.ok++; else if (dec[p.id] === 0) c.no++; else c.todo++; });
  return c;
}

function dvBar() {
  var b = document.getElementById("dv-bar");
  if (!b) { b = document.createElement("div"); b.id = "dv-bar"; document.body.appendChild(b); }
  var c = dvCounts(DV.list, DV.dec);
  b.innerHTML = '<b>Prova ' + dvEsc(DV.region.toUpperCase()) + "</b> &middot; " + DV.list.length + " salite nuove"
    + ' &middot; <span style="color:#16a34a">&#x2714; ' + c.ok + '</span> &middot; <span style="color:#64748b">&#x2716; ' + c.no + "</span> &middot; da vedere " + c.todo
    + ' <button type="button" id="dv-next">Prossima &#x203A;</button><button type="button" id="dv-copy">Copia esito</button>';
  document.getElementById("dv-next").onclick = dvNext;
  document.getElementById("dv-copy").onclick = dvCopy;
}
function dvOpen(p) {
  if (!p) return;
  map.setView([p.lat, p.lon], Math.max(map.getZoom(), 12));
  openPass(p, true);
}
function dvNext() {
  var cur = (typeof CUR_PASS !== "undefined" && CUR_PASS) ? CUR_PASS.id : null;
  var todo = dvOrder(DV.list, DV.dec).filter(function (p) { return DV.dec[p.id] == null && p.id !== cur; });
  if (!todo.length) { alert("Finito: tutte le salite hanno un giudizio. Premi \"Copia esito\" e incollalo in chat."); return; }
  dvOpen(todo[0]);
}
function dvCopy() {
  var ok = [], no = [];
  DV.list.forEach(function (p) { if (DV.dec[p.id] === 1) ok.push(p.id); else if (DV.dec[p.id] === 0) no.push(p.id); });
  var txt = JSON.stringify({ region: DV.region, ok: ok, no: no });
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
  box.innerHTML = '<div class="dv-h">&#x1F50E; Salita trovata dalla rete stradale (' + st + ")</div>"
    + '<div class="dv-s">Cima a ' + (p.elevation || "?") + " m &middot; bisogna scendere almeno " + (p.prom || "?") + " m prima di trovare strada pi&ugrave; alta. Controlla: &egrave; una salita vera? asfaltata? il nome va bene? la partenza &egrave; giusta?</div>"
    + '<button type="button" class="dv-ok">&#x2714; Buona</button><button type="button" class="dv-no">&#x2716; Da scartare</button>';
  var body = dp.querySelector(".dp-body"); if (!body) return;
  body.insertBefore(box, body.firstChild);
  box.querySelector(".dv-ok").onclick = function () { dvDecide(p.id, 1); };
  box.querySelector(".dv-no").onclick = function () { dvDecide(p.id, 0); };
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
}
function dvStyle() {
  var s = document.createElement("style");
  s.textContent = "#dv-bar{position:fixed;top:118px;left:50%;transform:translateX(-50%);z-index:1100;background:var(--bg,#fff);color:var(--txt,#111);border:2px solid #c026d3;border-radius:12px;padding:6px 10px;font-size:.8rem;box-shadow:0 4px 14px rgba(0,0,0,.18);white-space:nowrap;max-width:96vw;overflow-x:auto}" +
    "body.dp-open #dv-bar{top:auto;bottom:80px;left:12px;transform:none;white-space:normal;max-width:280px;line-height:1.9}" +
    "#dv-bar button,#dv-box button{margin-left:6px;padding:4px 10px;border-radius:8px;border:1px solid var(--bdr,#ccc);background:var(--bg2,#f4f4f5);color:inherit;font:inherit;font-weight:700;cursor:pointer}" +
    "#dv-box{margin:0 0 12px;padding:10px;border:2px solid #c026d3;border-radius:10px}#dv-box .dv-h{font-weight:700;margin-bottom:4px}#dv-box .dv-s{font-size:.78rem;color:var(--txt2,#555);margin-bottom:8px}" +
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
