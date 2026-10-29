/* ==========================================================================
 * signage.js - nuova identita' grafica, passo 1: la scheda della salita.
 *
 * Direzione (scelta col mockup del 29/10/2026): la segnaletica italiana dei passi.
 *  - il nome della salita sta su una TARGA marrone come i cartelli dei passi;
 *  - il profilo viene per primo, con quattro numeri sopra (km, dislivello, media, tempo);
 *  - un versante alla volta (schede), il confronto resta a un tocco;
 *  - icone Lucide (SVG, licenza ISC) al posto delle emoji; carattere Overpass (dalla
 *    segnaletica stradale, licenza OFL) servito dal sito, niente Google Fonts;
 *  - sul telefono la scheda sale dal basso e si trascina in tre altezze: la mappa resta
 *    visibile sopra, e la salita viene inquadrata nello spazio libero.
 * Modulo autonomo caricato per ULTIMO (con css/brand.css): ridefinisce passHeader() e avvolge
 * renderPassPanel() senza modificare panel.js. Togliendo i due file torna tutto come prima.
 * Funzioni sg* senza DOM pure e testate. ASCII.
 * ==========================================================================*/

var SG_ICONS = {
  "mountain": '<path d="m8 3 4 8 5-5 5 15H2L8 3z" />',
  "trending-up": '<path d="M16 7h6v6" /><path d="m22 7-8.5 8.5-5-5L2 17" />',
  "columns-2": '<rect width="18" height="18" x="3" y="3" rx="2" /><path d="M12 3v18" />',
  "droplet": '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />',
  "cloud-sun": '<path d="M12 2v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="M20 12h2" /><path d="m19.07 4.93-1.41 1.41" /><path d="M15.947 12.65a4 4 0 0 0-5.925-4.128" /><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z" />',
  "newspaper": '<path d="M15 18h-5" /><path d="M18 14h-8" /><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2" /><rect width="8" height="4" x="10" y="6" rx="1" />',
  "star": '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />',
  "lightbulb": '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" /><path d="M9 18h6" /><path d="M10 22h4" />',
  "timer": '<line x1="10" x2="14" y1="2" y2="2" /><line x1="12" x2="15" y1="14" y2="11" /><circle cx="12" cy="14" r="8" />',
  "bike": '<circle cx="18.5" cy="17.5" r="3.5" /><circle cx="5.5" cy="17.5" r="3.5" /><circle cx="15" cy="5" r="1" /><path d="M12 17.5V14l-3-3 4-3 2 3h2" />',
  "map": '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" /><path d="M15 5.764v15" /><path d="M9 3.236v15" />',
  "search": '<path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" />',
  "plus": '<path d="M5 12h14" /><path d="M12 5v14" />',
  "user": '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />',
  "menu": '<path d="M4 5h16" /><path d="M4 12h16" /><path d="M4 19h16" />',
  "x": '<path d="M18 6 6 18" /><path d="m6 6 12 12" />',
  "download": '<path d="M12 15V3" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" />',
  "flag": '<path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528" />',
  "sun": '<circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />',
  "wind": '<path d="M12.8 19.6A2 2 0 1 0 14 16H2" /><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2" /><path d="M9.8 4.4A2 2 0 1 1 11 8H2" />',
  "activity": '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />',
  "calendar-days": '<path d="M8 2v3" /><path d="M16 2v3" /><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M8 13h.01" /><path d="M12 13h.01" /><path d="M16 13h.01" /><path d="M8 17h.01" /><path d="M12 17h.01" /><path d="M16 17h.01" />',
  "info": '<circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />',
  "route": '<circle cx="6" cy="19" r="3" /><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" /><circle cx="18" cy="5" r="3" />',
  "languages": '<path d="m5 8 6 6" /><path d="m4 14 6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" /><path d="m22 22-5-10-5 10" /><path d="M14 18h6" />',
  "utensils": '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" /><path d="M7 2v20" /><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />'
};

var SG = { sel: 0, snaps: [0.36, 0.62, 0.93], sheet: 0.62 };

function sgIcon(name, size) {
  var s = size || 18, d = SG_ICONS[name] || "";
  return '<svg class="sg-ic" viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
}
function sgEsc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function sgNum(x, d) { return String((+x).toFixed(d == null ? 1 : d)).replace(".", ","); }

/* pure: which icon a section title gets, from its words (titles are built in many modules) */
function sgTitleIcon(text) {
  var t = String(text || "").toLowerCase(), M = [
    [/profilo|elevation/, "trending-up"], [/confronto|versanti|sides/, "columns-2"], [/acqua|water/, "droplet"],
    [/meteo|weather/, "cloud-sun"], [/news|stato/, "newspaper"], [/valutazion|rating/, "star"],
    [/consigli|tips/, "lightbulb"], [/tornanti|tempi|hairpin/, "timer"], [/bike day|solo bici/, "bike"],
    [/strava|segment/, "activity"], [/ristor|food|cibo/, "utensils"], [/vento|wind/, "wind"]];
  for (var i = 0; i < M.length; i++) if (M[i][0].test(t)) return M[i][1];
  return null;
}
/* pure: the leading emoji / symbols of a title, removed */
function sgStripEmoji(s) { return String(s || "").replace(/^[\s\u00a9\u00ae\u2000-\u2bff\u2e00-\u2e7f\u3000-\u303f\ud83c-\udbff\udc00-\udfff\ufe0f\u200d]+/, ""); }
/* pure: the four numbers of a versante; tmin = minutes (or null) */
function sgNumbers(v, tmin) {
  var gain = (v.endElevation != null && v.startElevation != null) ? Math.round(v.endElevation - v.startElevation) : null;
  var clock = (typeof ppClock === "function" && tmin != null) ? ppClock(tmin) : null;
  return [
    { n: sgNum(v.distance_km, 1), l: "km" },
    { n: gain == null ? "-" : String(gain), l: "m di dislivello" },
    { n: v.avgGradient != null ? sgNum(v.avgGradient, 1) + "%" : "-", l: "pendenza media" },
    { n: clock || "-", l: "" }
  ];
}
/* pure: nearest snap height (fraction of the screen) for a dragged sheet; 0 = close */
function sgSnap(frac, snaps) {
  if (frac < snaps[0] * 0.6) return 0;
  var best = snaps[0];
  snaps.forEach(function (s) { if (Math.abs(s - frac) < Math.abs(best - frac)) best = s; });
  return best;
}

/* ------------------------------------------------------------- header */
function sgHeader(p, isOsm, bare) {
  var h = '<div class="dp-hdr sg-hdr"><div class="sg-plate"><h2 class="sg-plate-n">' + sgEsc(p.name) + "</h2>"
    + '<div class="sg-plate-s">' + (p.elevation ? p.elevation + " m" : "") + (p.region ? " &middot; " + sgEsc(p.region) : "") + "</div></div>";
  if (!bare) {
    var meta = "";
    if (p.cat && typeof catColor === "function") meta += '<span class="sg-cat" style="background:' + catColor(p.cat) + '">' + (p.cat === "HC" ? "HC" : "Cat " + sgEsc(p.cat)) + "</span>";
    if (!isOsm && p.status && typeof statusKey === "function") {
      var k = statusKey(p.status);
      meta += '<span class="sg-st sg-st-' + k + '">' + (k === "open" ? "Aperto" : k === "seasonal" ? "Stagionale" : "Chiuso") + "</span>";
    }
    if (p.difficulty) meta += '<span class="sg-diff">Difficolt&agrave; ' + p.difficulty + "/10</span>";
    h += '<div class="sg-meta">' + meta + "</div>";
  }
  h += '<button type="button" data-act="closeD" class="sg-close" aria-label="Chiudi">' + sgIcon("x", 20) + "</button></div>";
  return h;
}

/* ------------------------------------------------------------- body */
function sgMinutes(v) {
  if (typeof ppMinutes !== "function" || typeof ppVam !== "function") return null;
  var w = (typeof ppMyWkg === "function" && ppMyWkg()) || 3;
  var d = typeof ppDists === "function" ? ppDists(v) : null;
  return { m: ppMinutes(v.elevationProfile, v.distance_km, ppVam(w, v.avgGradient), d), w: w, mine: !!(typeof ppMyWkg === "function" && ppMyWkg()) };
}
function sgRenderKey(p) {
  var box = document.getElementById("sg-key"); if (!box) return;
  var vs = p.versanti || [], i = SG.sel < 0 ? 0 : Math.min(SG.sel, vs.length - 1), v = vs[i]; if (!v) return;
  var t = sgMinutes(v), nums = sgNumbers(v, t ? t.m : null);
  nums[3].l = t ? (t.mine ? "il tuo tempo" : "a " + sgNum(t.w, 0) + " W/kg") : "";
  var h = "";
  if (vs.length > 1) {
    h += '<div class="sg-seg" role="tablist">';
    vs.forEach(function (w, k) { h += '<button type="button" role="tab" aria-selected="' + (SG.sel === k) + '" data-sgv="' + k + '">' + sgEsc(w.side || "Versante " + (k + 1)) + "</button>"; });
    h += '<button type="button" role="tab" aria-selected="' + (SG.sel < 0) + '" data-sgv="-1">Confronta</button></div>';
  }
  h += '<div class="sg-nums">' + nums.map(function (x) { return '<div><b>' + x.n + "</b><span>" + x.l + "</span></div>"; }).join("") + "</div>";
  box.innerHTML = h;
  Array.prototype.forEach.call(box.querySelectorAll("[data-sgv]"), function (b) {
    b.addEventListener("click", function () { sgSelect(p, +b.getAttribute("data-sgv")); });
  });
}
function sgSelect(p, i) {
  SG.sel = i;
  if (typeof setElev === "function") try { setElev(i); } catch (e) { /* ignore */ }
  sgRenderKey(p);
}
function sgIcons(root) {
  Array.prototype.forEach.call(root.querySelectorAll(".section-title"), function (t) {
    if (t.getAttribute("data-sg")) return;
    var ic = sgTitleIcon(t.textContent);
    var first = t.firstChild;
    if (first && first.nodeType === 3) first.nodeValue = sgStripEmoji(first.nodeValue);
    if (ic) t.insertAdjacentHTML("afterbegin", sgIcon(ic, 18));
    t.setAttribute("data-sg", "1");
  });
}
function sgArrange(p) {
  var dp = document.getElementById("dp"); if (!dp) return;
  var body = dp.querySelector(".dp-body"); if (!body) return;
  // drag handle (the sheet is re-rendered on every open)
  if (!dp.querySelector(".sg-grab")) { var g = document.createElement("div"); g.className = "sg-grab"; g.setAttribute("aria-hidden", "true"); dp.insertBefore(g, dp.firstChild); sgDrag(g); }
  // developer words out of the user's way: keep only the date of the last update
  Array.prototype.forEach.call(body.querySelectorAll("p"), function (el) {
    if (/Salita aggiornata il/.test(el.textContent)) { Array.prototype.forEach.call(el.querySelectorAll("b"), function (b) { b.parentNode.removeChild(b); }); el.textContent = el.textContent.replace(/^[\s\ud83d\udd04]+/, "").replace(/[\s\u00b7]+$/, "").replace("Salita aggiornata il", "Aggiornata il"); }
  });
  if (p && p.versanti && p.versanti.length) {
    var titles = body.querySelectorAll(".section-title"), prof = null, i;
    for (i = 0; i < titles.length; i++) if (/Profilo|Elevation/i.test(titles[i].textContent)) { prof = titles[i]; break; }
    var key = document.createElement("div"); key.id = "sg-key";
    body.insertBefore(key, body.firstChild);
    var dv = document.getElementById("dv-box"); if (dv) body.insertBefore(dv, body.firstChild);  // review box stays on top
    if (prof) {
      var moving = [], n = prof.nextSibling;
      while (n && !(n.classList && n.classList.contains("section-title"))) { moving.push(n); n = n.nextSibling; }
      prof.parentNode.removeChild(prof);                              // the numbers above are its heading
      var after = key.nextSibling;
      moving.forEach(function (m) { body.insertBefore(m, after); });
      var pp = document.getElementById("pp-box"); if (pp) body.insertBefore(pp, after);
    }
    var tog = document.getElementById("elev-tog"); if (tog) tog.style.display = "none";
    SG.sel = 0;
    sgRenderKey(p);
    if (p.versanti.length > 1) setTimeout(function () { sgSelect(p, 0); }, 140);  // after drawElev (80 ms)
  }
  sgIcons(dp);
  setTimeout(sgFrame, 60);
}

/* ------------------------------------------------------------- sheet + map framing */
function sgMobile() { return window.matchMedia && window.matchMedia("(max-width: 760px)").matches; }
function sgSetSheet(frac) {
  SG.sheet = frac;
  document.documentElement.style.setProperty("--sg-sheet", Math.round(frac * 100) + "vh");
}
function sgDrag(handle) {
  var y0 = 0, h0 = 0, dragging = false;
  handle.addEventListener("pointerdown", function (e) {
    if (!sgMobile()) return;
    dragging = true; y0 = e.clientY; h0 = SG.sheet * window.innerHeight;
    handle.setPointerCapture && handle.setPointerCapture(e.pointerId);
    document.getElementById("dp").classList.add("sg-dragging");
  });
  handle.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    var h = Math.max(80, Math.min(window.innerHeight * 0.96, h0 + (y0 - e.clientY)));
    document.documentElement.style.setProperty("--sg-sheet", h + "px");
  });
  function end(e) {
    if (!dragging) return; dragging = false;
    document.getElementById("dp").classList.remove("sg-dragging");
    var frac = (h0 + (y0 - e.clientY)) / window.innerHeight, s = sgSnap(frac, SG.snaps);
    if (!s) { sgSetSheet(SG.snaps[1]); if (typeof closeD === "function") closeD(); return; }
    sgSetSheet(s); setTimeout(sgFrame, 260);
  }
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
}
/* padding the map must keep free for the open panel: bottom sheet on the phone, side panel on desktop */
function sgPad() {
  var dp = document.getElementById("dp");
  if (!dp || !document.body.classList.contains("dp-open")) return null;
  if (sgMobile()) return [16, Math.round(SG.sheet * window.innerHeight) + 16];
  return [Math.round(dp.getBoundingClientRect().width) + 16, 16];
}
function sgFrame() {
  if (typeof map === "undefined" || typeof routeLines === "undefined" || !routeLines.length || typeof L === "undefined") return;
  try { map.fitBounds(L.featureGroup(routeLines).getBounds(), { maxZoom: 14 }); } catch (e) { /* ignore */ }
}
function sgWrapFit() {
  if (map.fitBounds._sg) return;
  var fb = map.fitBounds;
  map.fitBounds = function (b, o) {
    o = o || {};
    var pad = sgPad();
    if (pad && !o.padding && !o.paddingBottomRight) {
      var q = {}; for (var k in o) q[k] = o[k];
      q.paddingTopLeft = [16, 16]; q.paddingBottomRight = pad;
      return fb.call(map, b, q);
    }
    return fb.call(map, b, o);
  };
  map.fitBounds._sg = 1;
}

/* ------------------------------------------------------------- testata (passo 2) */
/* Sul telefono la testata aveva logo, ricerca e otto pulsanti in 375 px: la ricerca era
   tagliata ("Cerca passo o lo") e due pulsanti ci finivano sopra. Ora la testata e' logo +
   ricerca a tutta larghezza. Crea, Profilo e Menu sono gia' nella barra in basso; Acqua,
   Cibo e Lingua scendono nella colonna di pulsanti sulla mappa (#mapctl), spostati e non
   ricreati, cosi' i loro gestori restano attaccati. */
function sgPhone() { return window.matchMedia && window.matchMedia("(max-width: 640px)").matches; }
function sgHeader() {
  var ctl = document.getElementById("mapctl");
  if (!sgPhone() || !ctl) return false;
  [["fountBtn", "droplet"], ["uk-food", "utensils"], ["langBtn", "languages"]].forEach(function (x) {
    var b = document.getElementById(x[0]);
    if (!b || b.parentNode === ctl) return;
    var bi = b.querySelector(".bi"); if (bi) bi.innerHTML = sgIcon(x[1], 22);
    ctl.appendChild(b);
  });
  document.body.classList.add("sg-hdr-clean");
  return true;
}

/* ------------------------------------------------------------- tabs + start */
function sgTabs() {
  var bar = document.getElementById("uk-tabs");
  if (!bar) return false;
  var ic = ["map", "search", "plus", "user", "menu"];
  Array.prototype.forEach.call(bar.querySelectorAll("button .ic"), function (s, i) { if (ic[i] && !s.getAttribute("data-sg")) { s.innerHTML = sgIcon(ic[i], 22); s.setAttribute("data-sg", "1"); } });
  return true;
}
function sgStart() {
  if (typeof renderPassPanel !== "function" || typeof passHeader !== "function" || typeof map === "undefined") { setTimeout(sgStart, 300); return; }
  if (!renderPassPanel._sg) {
    passHeader = sgHeader;
    var rp = renderPassPanel;
    renderPassPanel = function (p) { var r = rp.apply(this, arguments); try { sgArrange(p); } catch (e) { if (window.console) console.warn("[locaClimb] signage: " + e.message); } return r; };
    renderPassPanel._sg = 1;
    if (typeof renderOsmStub === "function") {
      var rs = renderOsmStub;
      renderOsmStub = function () { var r = rs.apply(this, arguments); try { sgArrange(null); } catch (e) { /* ignore */ } return r; };
    }
  }
  sgWrapFit();
  sgSetSheet(SG.sheet);
  var tries = 0; (function t() { if (!sgTabs() && tries++ < 20) setTimeout(t, 500); })();
  var htries = 0; (function h() { if (!sgHeader() && sgPhone() && htries++ < 20) setTimeout(h, 500); })();
}
if (typeof document !== "undefined" && document.addEventListener && typeof window !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sgStart); else sgStart();
}
