/* ==========================================================================
 * myclimbs.js - "Le mie salite": le salite che hai fatto davvero, dai tuoi GPX.
 *
 * Si alimenta da gpxclimbs.js: dopo l'analisi di un giro, "Segna come fatte" salva
 * le salite di passi che conosciamo (anche i versanti nuovi e quelle in cui passi da
 * un passo noto). Le salite senza nome no: prima vanno proposte e approvate.
 *
 * Dati: users/{uid}/climbs/{passId}, privati (le regole gia' coprono le
 * sottocollezioni di users). Conta i GIORNI distinti: ricaricare lo stesso GPX,
 * o fare due volte la stessa salita nello stesso giro, non gonfia il numero.
 *
 * Dipende da: contribute.js (lrcModal, lrcClose, lrcT, lrcUser, lrcDb, lrcFindMenus,
 * lrcMenuItem), gpxclimbs.js (GC_LAST, gcEsc, gcNum, gcDur). mcMerge, mcBestTimes e mcStats sono pure. ASCII.
 * ==========================================================================*/

var MC = { cache: null, MAXDATES: 60 };
function mcT(it, en) { return typeof lrcT === "function" ? lrcT(it, en) : it; }
function mcE(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

/* entry: {passId,name,lat,lon,elevation,side,date,km,gain}. Unisce senza doppioni. */
function mcMerge(doc, en) {
  var d = doc ? JSON.parse(JSON.stringify(doc)) : { passId: en.passId, dates: [], sides: {} };
  d.name = en.name || d.name; d.lat = en.lat; d.lon = en.lon; d.elevation = en.elevation || d.elevation || null;
  var day = en.date || "senza-data";
  if (d.dates.indexOf(day) < 0) d.dates.push(day);
  d.dates.sort(); if (d.dates.length > MC.MAXDATES) d.dates = d.dates.slice(-MC.MAXDATES);
  var sd = en.side || "?";
  d.sides[sd] = d.sides[sd] || [];
  if (d.sides[sd].indexOf(day) < 0) d.sides[sd].push(day);
  if (!d.best || (en.gain || 0) > (d.best.gain || 0)) d.best = { km: en.km, gain: en.gain };
  var real = d.dates.filter(function (x) { return x !== "senza-data"; });
  d.firstAt = real[0] || null; d.lastAt = real[real.length - 1] || null;
  /* tempi misurati (giri con orario: GPX/FIT/TCX). Un passaggio = un'uscita su quel versante;
     la chiave e' l'ora di partenza, cosi' ricaricare lo stesso file non lo duplica. */
  if (en.sec > 0) {
    d.efforts = d.efforts || [];
    var key = en.start || (day + "|" + sd);
    var dup = d.efforts.some(function (x) { return (x.start || (x.date + "|" + x.side)) === key; });
    if (!dup) {
      d.efforts.push({ date: en.date || null, side: sd, sec: en.sec, moving: en.moving || null, vam: en.vam || null,
        km: en.tkm || en.km || null, gain: en.tgain || en.gain || null, canon: !!en.canon, start: en.start || null, src: en.src || "gpx" });
      d.efforts.sort(function (a, b) { return String(a.start || a.date || "").localeCompare(String(b.start || b.date || "")); });
      if (d.efforts.length > MC.MAXDATES) d.efforts = d.efforts.slice(-MC.MAXDATES);
    }
    d.bestTime = mcBestTimes(d.efforts);
  }
  return d;
}

/* miglior tempo per versante: il tempo in movimento (le soste non contano), poi il totale.
   Solo i passaggi cronometrati dalla partenza ufficiale (canon) sono confrontabili tra loro;
   se un versante non ne ha, vale il migliore che c'e'. */
function mcBestTimes(efforts) {
  var by = {};
  (efforts || []).forEach(function (x) {
    var t = x.moving || x.sec, cur = by[x.side];
    if (!(t > 0)) return;
    if (!cur || (x.canon && !cur.canon) || (x.canon === cur.canon && t < (cur.moving || cur.sec)))
      by[x.side] = { sec: x.sec, moving: x.moving || null, date: x.date, canon: !!x.canon, vam: x.vam || null };
  });
  return by;
}

function mcStats(list) {
  var s = { passes: list.length, times: 0, sides: 0, top: null };
  list.forEach(function (d) {
    s.times += (d.dates || []).length;
    s.sides += Object.keys(d.sides || {}).filter(function (k) { return k !== "?"; }).length || 1;
    if (!s.top || (d.elevation || 0) > (s.top.elevation || 0)) s.top = d;
  });
  return s;
}

/* da un'analisi GPX alle voci da salvare */
function mcEntriesFrom(res) {
  var out = [];
  (res && res.climbs || []).forEach(function (c) {
    var m = c.match, p = m && m.pass; if (!p) return;
    var tm = c.timing;
    out.push({ passId: String(p.id), name: p.name, lat: p.lat, lon: p.lon, elevation: p.elevation || null,
      side: m.kind === "known" ? (m.side || "?") : m.kind === "newside" ? mcT("versante nuovo", "new side") : "?",
      date: res.date, km: c.km, gain: c.gain,
      sec: tm ? tm.sec : null, moving: tm ? tm.moving : null, vam: tm ? tm.vam : null, start: tm ? tm.start : null,
      canon: tm ? tm.canon : false, tkm: tm ? tm.km : null, tgain: tm ? tm.gain : null, src: res.src || "gpx" });
  });
  return out;
}

/* Salva voci (anche centinaia, da un export completo): prima le unisce per salita in memoria,
   poi UNA lettura + UNA scrittura per salita, 4 alla volta. onProgress(fatte, totale). */
function mcSaveEntries(ens, onProgress) {
  var u = typeof lrcUser === "function" ? lrcUser() : null, db = typeof lrcDb === "function" ? lrcDb() : null;
  if (!u || !db) return Promise.reject(new Error(mcT("Accedi per salvare le tue salite.", "Sign in to save your climbs.")));
  var groups = {}, ids = [];
  (ens || []).forEach(function (en) { var k = en.passId.replace(/\//g, "_"); if (!groups[k]) { groups[k] = []; ids.push(k); } groups[k].push(en); });
  var col = db.collection("users").doc(u.uid).collection("climbs"), done = 0, next = 0;
  function one(k) {
    var ref = col.doc(k);
    return ref.get().then(function (snap) {
      var d = snap.exists ? snap.data() : null;
      groups[k].forEach(function (en) { d = mcMerge(d, en); });
      return ref.set(d);
    }).then(function () { done++; if (onProgress) onProgress(done, ids.length); });
  }
  function worker() { if (next >= ids.length) return Promise.resolve(); var k = ids[next++]; return one(k).then(worker); }
  var w = []; for (var i = 0; i < Math.min(4, ids.length); i++) w.push(worker());
  return Promise.all(w).then(function () { MC.cache = null; return ids.length; });
}

function mcSaveFromGpx() {
  var msg = document.getElementById("gc-save-msg"), btn = document.getElementById("gc-save");
  var ens = mcEntriesFrom(typeof GC_LAST !== "undefined" ? GC_LAST : null);
  if (!ens.length) return;
  if (btn) btn.disabled = true;
  mcSaveEntries(ens).then(function () {
    if (msg) { msg.className = "lrc-msg lrc-ok"; msg.innerHTML = mcT("Salvate. Le trovi in <b>Le mie salite</b>.", "Saved. You'll find them in <b>My climbs</b>."); }
  }).catch(function (e) {
    if (btn) btn.disabled = false;
    if (msg) { msg.className = "lrc-msg lrc-err"; msg.textContent = (e && e.message ? e.message : String(e)); }
  });
}

/* "Record: Da Bormio 1:12:05 (12/07/2026) - VAM 1270" una riga per versante cronometrato */
function mcBestHtml(d) {
  var bt = d && d.bestTime, keys = bt ? Object.keys(bt) : [];
  if (!keys.length || typeof gcDur !== "function") return "";
  return keys.map(function (k) {
    var b = bt[k];
    return '<div class="lrc-meta">&#x23F1; ' + mcT("Record", "Best") + (k !== "?" ? " " + mcE(k) : "") + ": <b>" + gcDur(b.moving || b.sec) + "</b>"
      + (b.date ? " (" + mcFmtDate(b.date) + ")" : "") + (b.vam ? " &middot; VAM " + b.vam : "")
      + " &middot; " + ((d.efforts || []).filter(function (x) { return x.side === k; }).length) + "&times;</div>";
  }).join("");
}

function mcFmtDate(iso) { if (!iso) return ""; var p = iso.split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : iso; }

function mcOpenList() {
  var u = typeof lrcUser === "function" ? lrcUser() : null, db = typeof lrcDb === "function" ? lrcDb() : null;
  if (!u || !db) { lrcModal("<h3>" + mcT("Le mie salite", "My climbs") + '</h3><p class="lrc-sub">' + mcT("Accedi per vedere le tue salite.", "Sign in to see your climbs.") + '</p><div class="lrc-btns"><button onclick="lrcClose()">' + mcT("Chiudi", "Close") + "</button></div>"); return; }
  lrcModal("<h3>" + mcT("Le mie salite", "My climbs") + "</h3><p class=\"lrc-sub\">" + mcT("Carico...", "Loading...") + "</p>");
  db.collection("users").doc(u.uid).collection("climbs").get().then(function (qs) {
    var list = []; qs.forEach(function (d) { var o = d.data(); o._doc = d.id; list.push(o); });
    list.sort(function (a, b) { return String(b.lastAt || "").localeCompare(String(a.lastAt || "")); });
    MC.cache = list; mcRender();
  }).catch(function (e) { lrcModal("<h3>" + mcT("Le mie salite", "My climbs") + '</h3><p class="lrc-msg lrc-err">' + mcE(e && e.message ? e.message : e) + '</p><div class="lrc-btns"><button onclick="lrcClose()">OK</button></div>'); });
}

function mcRender() {
  var list = MC.cache || [], s = mcStats(list);
  var h = "<h3>" + mcT("Le mie salite", "My climbs") + "</h3>";
  if (!list.length) {
    h += '<p class="lrc-sub">' + mcT("Ancora nessuna. Carica i tuoi giri: un GPX o FIT, oppure lo <b>zip dell'export completo</b> di Strava o Garmin Connect per avere tutto lo storico con i tempi.",
      "None yet. Load your rides: a GPX or FIT, or the <b>full export zip</b> from Strava or Garmin Connect to get your whole history with times.") + "</p>";
  } else {
    h += '<div class="lrc-facts">'
      + "<div>" + mcT("Passi", "Passes") + "<b>" + s.passes + "</b></div>"
      + "<div>" + mcT("Salite (giorni)", "Climbs (days)") + "<b>" + s.times + "</b></div>"
      + "<div>" + mcT("Versanti", "Sides") + "<b>" + s.sides + "</b></div>"
      + "<div>" + mcT("Il piu' alto", "Highest") + "<b>" + (s.top && s.top.elevation ? s.top.elevation + " m" : "-") + "</b></div></div>";
    list.forEach(function (d, i) {
      var sides = Object.keys(d.sides || {}).filter(function (k) { return k !== "?"; });
      h += '<div class="lrc-item"><span class="lrc-st approved">' + (d.dates || []).length + "&times;</span>"
        + "<h4>" + mcE(d.name) + (d.elevation ? ' <span class="lrc-meta">' + d.elevation + " m</span>" : "") + "</h4>"
        + '<div class="lrc-meta">' + (sides.length ? mcE(sides.join(", ")) + " &middot; " : "")
        + (d.lastAt ? mcT("ultima ", "last ") + mcFmtDate(d.lastAt) : mcT("senza data", "no date")) + "</div>"
        + mcBestHtml(d)
        + '<div class="lrc-btns" style="margin-top:6px"><button onclick="mcOpen(' + i + ')">' + mcT("Apri", "Open") + "</button>"
        + '<button onclick="mcDel(' + i + ')">' + mcT("Rimuovi", "Remove") + "</button></div></div>";
    });
  }
  h += '<div class="lrc-btns"><button onclick="lrcClose()">' + mcT("Chiudi", "Close") + "</button>"
    + (typeof gcPick === "function" ? '<button class="lrc-go" onclick="lrcClose();gcPick()">' + mcT("Carica un giro", "Load a ride") + "</button>" : "") + "</div>";
  lrcModal(h);
}

function mcOpen(i) {
  var d = MC.cache && MC.cache[i]; if (!d) return;
  lrcClose();
  try { if (/^(osm|usr)-/.test(d.passId)) openOsmD(d.passId); else openD(d.passId); } catch (e) {}
}
function mcDel(i) {
  var d = MC.cache && MC.cache[i], u = lrcUser(), db = lrcDb(); if (!d || !u || !db) return;
  if (!confirm(mcT("Rimuovere " + d.name + " dalle tue salite?", "Remove " + d.name + " from your climbs?"))) return;
  db.collection("users").doc(u.uid).collection("climbs").doc(d._doc).delete().then(function () { MC.cache.splice(i, 1); mcRender(); });
}

/* voce "Le mie salite" accanto a "Le mie proposte" */
function mcWire() {
  if (typeof lrcFindMenus !== "function" || typeof lrcMenuItem !== "function") return;
  var m = lrcFindMenus(), host = (typeof LRC !== "undefined" && LRC._menu) || m.gear || m.plus;
  if (!host || host._mcDone === 1) return;
  host._mcDone = 1;
  host.appendChild(lrcMenuItem("&#x26F0;&#xFE0F;", mcT("Le mie salite", "My climbs"), mcOpenList));
}
function mcStart() {
  mcWire();
  new MutationObserver(function () { try { mcWire(); } catch (e) {} }).observe(document.body, { childList: true, subtree: true });
}
if (typeof document !== "undefined" && document.addEventListener) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mcStart); else mcStart();
}
