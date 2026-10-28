/* ==========================================================================
 * panelplus.js - nel pannello di una salita, i numeri che un ciclista cerca subito.
 *
 *  1. Tornanti per versante, contati sulla traccia (verificati: Stelvio da Prato 48,
 *     Finestre da Susa ~45). Il "km piu' duro" NON c'e': il profilo a 30 punti ha salti
 *     da DEM (Finestre 18-24%) e mostrerebbe numeri falsi.
 *  2. "Quanto ci metto": tempo di salita a 2-3-4-5 W/kg e con i TUOI W/kg (salvati
 *     sul telefono). Velocita' con lo stesso modello del meteo del giro (rwSpeed):
 *     un solo modello in tutta l'app. W/kg -> VAM con la formula di Ferrari
 *     (VAM = W/kg x (200 + 10 x pendenza%)): e' una stima, e lo diciamo.
 *  3. Sulla mappa, bandierine di quota alla partenza di ogni versante e in cima.
 *
 * Modulo autonomo, caricato dopo panel.js: avvolge renderPassPanel e openPass senza
 * modificarli. Le funzioni pp* senza DOM sono pure e testate. ASCII.
 * ==========================================================================*/

var PP = { WKG_REF: [2, 3, 4, 5], KEY: "lr_wkg" };

function ppT(it, en) { try { return window.LR_LANG === "en" ? en : it; } catch (e) { return it; } }
function ppEsc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function ppNum(x, d) { return String((+x).toFixed(d == null ? 1 : d)).replace(".", ","); }
function ppHav(a, b, c, d) { var r = Math.PI / 180, x = Math.pow(Math.sin((c - a) * r / 2), 2) + Math.cos(a * r) * Math.cos(c * r) * Math.pow(Math.sin((d - b) * r / 2), 2); return 2 * 6371 * Math.asin(Math.sqrt(x)); }
function ppBear(a, b, c, d) { var r = Math.PI / 180, y = Math.sin((d - b) * r) * Math.cos(c * r), x = Math.cos(a * r) * Math.sin(c * r) - Math.sin(a * r) * Math.cos(c * r) * Math.cos((d - b) * r); return Math.atan2(y, x) / r; }

/* ------------------------------------------------------------- pure */
/* Tornanti: una svolta che gira di almeno 150 gradi nello stesso verso entro 150 m
   di strada. Sulle tracce semplificate il tornante cade su 1-3 vertici: per questo si
   somma la curva su una finestra di distanza invece di guardare il singolo angolo. */
function ppHairpins(track) {
  if (!track || track.length < 3) return 0;
  var pts = [track[0]], i;
  for (i = 1; i < track.length; i++) if (ppHav(pts[pts.length - 1][0], pts[pts.length - 1][1], track[i][0], track[i][1]) > 0.008) pts.push(track[i]);
  if (pts.length < 3) return 0;
  var turn = [], seg = [];
  for (i = 1; i < pts.length; i++) seg.push(ppHav(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
  for (i = 1; i < pts.length - 1; i++) {
    var b1 = ppBear(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]), b2 = ppBear(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    var t = b2 - b1; while (t > 180) t -= 360; while (t < -180) t += 360;
    turn.push(t);                                  // turn[k] is at vertex k+1
  }
  var n = 0, k = 0;
  while (k < turn.length) {
    var sum = 0, dist = 0, hit = -1;
    for (var j = k; j < turn.length; j++) {
      if (j > k) dist += seg[j];
      if (dist > 0.15) break;
      sum += turn[j];
      if (Math.abs(sum) >= 150) { hit = j; break; }
    }
    if (hit >= 0) { n++; k = hit + 1; } else k++;
  }
  return n;
}
function ppSpeed(g, flatKmh) {
  if (typeof rwSpeed === "function") return rwSpeed(g, flatKmh);
  var vam = flatKmh * 34;
  if (g > 0.015) return Math.max(5, Math.min(flatKmh, vam / (g * 1000)));
  if (g < -0.015) return Math.min(55, flatKmh * (1 + 12 * Math.abs(g)));
  return flatKmh;
}
/* W/kg -> VAM (m/h) alla pendenza media della salita (Ferrari) */
function ppVam(wkg, avgPct) { return wkg * (200 + 10 * Math.max(0, avgPct || 0)); }
/* tempo in minuti: il profilo percorso tratto per tratto con il modello del meteo */
function ppMinutes(prof, km, vam) {
  if (!prof || prof.length < 2 || !(km > 0) || !(vam > 0)) return null;
  var d = km / (prof.length - 1), h = 0, flat = vam / 34;
  for (var i = 1; i < prof.length; i++) h += d / ppSpeed((prof[i] - prof[i - 1]) / (d * 1000), flat);
  return h * 60;
}
function ppClock(min) {
  if (min == null || !isFinite(min)) return "-";
  var m = Math.round(min);
  return m < 60 ? m + "'" : Math.floor(m / 60) + "h" + ("0" + (m % 60)).slice(-2);
}

/* ------------------------------------------------------------- panel */
function ppMyWkg() { try { var v = parseFloat(localStorage.getItem(PP.KEY)); return v > 0.5 && v < 9 ? v : null; } catch (e) { return null; } }

function ppSection(p) {
  var vs = (p.versanti || []).filter(function (v) { return v && v.distance_km > 0; });
  if (!vs.length) return null;
  var my = ppMyWkg(), cols = vs.slice(0, 3);
  var h = '<div class="section-title">&#x23F1;&#xFE0F; ' + ppT("Tornanti e tempi di salita", "Hairpins and climbing times") + "</div>";
  h += '<table class="vtable pp-t"><thead><tr><th></th>' + cols.map(function (v, i) {
    return '<th style="color:' + (typeof VCOLS !== "undefined" ? VCOLS[i % VCOLS.length] : "inherit") + '">' + ppEsc(v.side || ppT("Versante", "Side")) + "</th>";
  }).join("") + "</tr></thead><tbody>";
  var row = function (label, fn) { h += "<tr><td>" + label + "</td>" + cols.map(function (v) { return "<td>" + fn(v) + "</td>"; }).join("") + "</tr>"; };
  row("&#x1F504; " + ppT("Tornanti", "Hairpins"), function (v) { var n = ppHairpins(v.track); return v.track && v.track.length > 2 ? "&asymp;" + n : "-"; });
  PP.WKG_REF.forEach(function (w) {
    row("&#x23F1;&#xFE0F; " + ppNum(w, 0) + " W/kg", function (v) { return ppClock(ppMinutes(v.elevationProfile, v.distance_km, ppVam(w, v.avgGradient))); });
  });
  row("<b>&#x1F464; " + ppT("Tu", "You") + "</b> " + (my ? "(" + ppNum(my) + " W/kg)" : ""), function (v) {
    return my ? "<b>" + ppClock(ppMinutes(v.elevationProfile, v.distance_km, ppVam(my, v.avgGradient))) + "</b>" : "-";
  });
  h += "</tbody></table>";
  h += '<div class="pp-my"><label>' + ppT("I tuoi W/kg", "Your W/kg") + ' <input id="pp-wkg" type="number" step="0.1" min="1" max="8" inputmode="decimal" value="' + (my ? my : "") + '" placeholder="3,0"></label>'
    + '<span class="pp-note">' + ppT("Stima: VAM da W/kg (formula di Ferrari), velocit&agrave; tratto per tratto sul profilo. Vento, peso della bici e stanchezza non contano.", "Estimate: VAM from W/kg (Ferrari formula), speed segment by segment on the profile. Wind, bike weight and fatigue not included.") + "</span></div>";
  var box = document.createElement("div"); box.id = "pp-box"; box.innerHTML = h;
  return box;
}
function ppInject(p) {
  var dp = document.getElementById("dp"); if (!dp || !p) return;
  var old = document.getElementById("pp-box"); if (old) old.parentNode.removeChild(old);
  var box = ppSection(p); if (!box) return;
  var titles = dp.querySelectorAll(".section-title"), anchor = null;
  for (var i = 0; i < titles.length; i++) if (/Profilo|Elevation/i.test(titles[i].textContent)) { anchor = titles[i]; break; }
  if (anchor) anchor.parentNode.insertBefore(box, anchor);
  else { var body = dp.querySelector(".dp-body"); if (body) body.appendChild(box); }
  var inp = document.getElementById("pp-wkg");
  if (inp) inp.addEventListener("change", function () {
    var v = parseFloat(String(inp.value).replace(",", "."));
    try { if (v > 0.5 && v < 9) localStorage.setItem(PP.KEY, String(v)); else localStorage.removeItem(PP.KEY); } catch (e) { /* ignore */ }
    ppInject(p);
  });
}

/* ------------------------------------------------------------- map flags */
function ppFlag(lat, lon, txt, top) {
  if (typeof L === "undefined" || typeof map === "undefined" || lat == null) return;
  var ic = L.divIcon({ className: "", html: '<div class="pp-flag' + (top ? " top" : "") + '">' + txt + "</div>", iconSize: null, iconAnchor: top ? [-8, 26] : [-14, 10] });
  var m = L.marker([lat, lon], { icon: ic, interactive: false, zIndexOffset: 500 }).addTo(map);
  if (typeof versStartMarkers !== "undefined") versStartMarkers.push(m);   // cleared with the pass
}
function ppFlags(p) {
  (p.versanti || []).forEach(function (v) { if (v.startElevation != null) ppFlag(v.startLat, v.startLon, Math.round(v.startElevation) + " m", false); });
  if (p.elevation) ppFlag(p.lat, p.lon, "&#x1F3C1; " + Math.round(p.elevation) + " m", true);
}

function ppStyle() {
  if (document.getElementById("pp-style")) return;
  var s = document.createElement("style"); s.id = "pp-style";
  s.textContent = ".pp-t td:first-child{white-space:nowrap}.pp-t td{text-align:center}.pp-t td:first-child{text-align:left}" +
    ".pp-my{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0 14px;font-size:.8rem;color:var(--txt2)}" +
    ".pp-my input{width:64px;padding:4px 6px;border:1px solid var(--bdr);border-radius:6px;background:var(--bg);color:var(--txt);font:inherit;margin-left:4px}" +
    ".pp-note{flex:1 1 220px;font-size:.72rem}" +
    ".pp-flag{display:inline-block;white-space:nowrap;background:#0f172a;color:#fff;font-size:11px;font-weight:700;padding:2px 7px;border-radius:9px;box-shadow:0 2px 6px rgba(0,0,0,.3)}" +
    ".pp-flag.top{background:#7f1d1d}";
  document.head.appendChild(s);
}

function ppStart() {
  if (typeof renderPassPanel !== "function" || typeof openPass !== "function") { setTimeout(ppStart, 400); return; }
  ppStyle();
  if (!renderPassPanel._pp) {
    var rp = renderPassPanel;
    renderPassPanel = function (p) { var r = rp.apply(this, arguments); try { ppInject(p); } catch (e) { if (window.console) console.warn("[locaClimb] panelplus: " + e.message); } return r; };
    renderPassPanel._pp = 1;
  }
  if (!openPass._pp) {
    var op = openPass;
    openPass = function (p) { var r = op.apply(this, arguments); try { if (p && p.versanti && p.versanti.length) ppFlags(p); } catch (e) { /* ignore */ } return r; };
    openPass._pp = 1;
  }
}
if (typeof document !== "undefined" && document.addEventListener) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ppStart); else ppStart();
}
