/* uikit.js v3 — interfaccia LocaRide. Modulo AUTONOMO e reversibile (togli la riga
 * <script src="js/uikit.js"> e torna tutto com'era).
 *
 *  - Barra: logo nuovo, ricerca, "Crea giro" (primario), "Altro" (menu attaccato al body),
 *    tasto PROFILO con ciclista (login + profilo, gestito dal tuo #acct).
 *  - Filtri spostato DENTRO "Altro".
 *  - Acqua + Cibo in BASSO-CENTRO accanto alla legenda (mai coperti dai pannelli laterali).
 *  - Bike Day scorre quando apri Filtri/Percorso.
 *  - Ricerca unica coi "Luoghi"; scegliendo un luogo la mappa vola e i passi restano.
 *  - Nav mobile a schede + hint primo avvio.
 */
(function () {
  "use strict";
  function el(t, a, h) { var e = document.createElement(t); if (a) for (var k in a) e.setAttribute(k, a[k]); if (h != null) e.innerHTML = h; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function byId(id) { return document.getElementById(id); }
  function gref(n) { try { return (new Function("try{return typeof " + n + "!=='undefined'?" + n + ":(window." + n + "||null)}catch(e){return null}"))(); } catch (e) { return null; } }
  function getMap() { return window.map || gref("map"); }

  var LOGO = '<svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><defs><linearGradient id="uklg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2563eb"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs><path d="M17 2C10.6 2 5.4 7.1 5.4 13.4 5.4 21.6 17 32 17 32s11.6-10.4 11.6-18.6C28.6 7.1 23.4 2 17 2z" fill="url(#uklg)"/><path d="M9 19.5 13.6 13l3 3.7 3-4.6L25 19.5z" fill="#fff"/><circle cx="17" cy="9.2" r="1.9" fill="#f59e0b"/></svg>';
  var HELMET = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.6c-4.7 0-8.5 3.3-8.5 7.4h17C20.5 5.9 16.7 2.6 12 2.6z"/><rect x="3.7" y="11" width="16.6" height="4" rx="2"/><path d="M7.4 16.2c1.5 2.5 7.7 2.5 9.2 0 0 2.7-2.1 4.4-4.6 4.4s-4.6-1.7-4.6-4.4z"/></svg>';
  var ROUTE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 19c0-6 7-4 7-9 0-4 5-2 6-5"/><circle cx="5" cy="19" r="2" fill="currentColor" stroke="none"/><path d="M18 3.4c-1.4 0-2.5 1.1-2.5 2.5 0 1.9 2.5 4.1 2.5 4.1s2.5-2.2 2.5-4.1c0-1.4-1.1-2.5-2.5-2.5z" fill="currentColor" stroke="none"/></svg>';

  function injectStyle() {
    if (byId("uk-style")) return;
    var css =
      "#place-wrap{display:none!important}" +
      "#rbb{background:var(--ac)!important;color:#fff!important;border-color:var(--ac)!important}" +
      "#hdr .btn{padding:8px 12px}" +
      "#acct.uk-profile{width:44px;height:44px;padding:0!important;border-radius:50%!important;justify-content:center;border-color:var(--ac)!important;color:var(--ac)!important}" +
      "#acct.uk-profile.uk-logged{background:var(--ac)!important;color:#fff!important}" +
      "#acct.uk-profile .uk-av{display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:.95rem}" +
      "#acct.uk-profile .uk-av svg{width:23px;height:23px}" +
      "#uk-more-menu{position:fixed;min-width:212px;background:var(--bg2);border:1px solid var(--bdr);border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,.2);padding:6px;z-index:100000;display:none}" +
      "#uk-more-menu.open{display:block}" +
      "#uk-more-menu .btn{display:flex!important;width:100%;justify-content:flex-start;border:none;background:transparent;border-radius:8px;padding:9px 12px;margin:0}" +
      "#uk-more-menu .btn:hover{background:var(--bg)}#uk-more-menu .btn .bl{display:inline!important}" +
      ".uk-sec{padding:6px 12px 4px;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--txt2);border-top:1px solid var(--bdr)}" +
      ".uk-place{padding:8px 12px;cursor:pointer;font-size:.86rem;display:flex;flex-direction:column;gap:1px}" +
      ".uk-place:hover{background:var(--bg)}.uk-place small{color:var(--txt2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      "#uk-bottom{position:fixed;left:50%;transform:translateX(-50%);bottom:14px;z-index:901;display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center;max-width:calc(100vw - 20px)}" +
      "#uk-bottom .btn{width:44px;height:44px;border-radius:50%;padding:0;justify-content:center;background:var(--bg2);box-shadow:0 3px 12px rgba(0,0,0,.18)}" +
      "#uk-bottom .btn .bl{display:none!important}#uk-bottom .btn .bi{font-size:1.3rem}#uk-bottom .btn.active{background:var(--ac);color:#fff}" +
      "#uk-legend{background:var(--bg2);border:1px solid var(--bdr);border-radius:10px;padding:6px 11px;font-size:.72rem;color:var(--txt2);box-shadow:0 3px 12px rgba(0,0,0,.14);display:flex;gap:9px;align-items:center;flex-wrap:wrap}" +
      "#uk-legend b{color:var(--txt);font-weight:600}#uk-legend span{display:inline-flex;align-items:center;gap:4px}#uk-legend i{width:12px;height:12px;border-radius:3px;display:inline-block}" +
      "body.fp-open #be-btn{transform:translateX(266px)}body.rb-open #be-btn{transform:translateX(352px)}#be-btn{transition:transform .28s ease}" +
      "#uk-hint{position:fixed;left:50%;top:calc(var(--hdr) + 14px);transform:translateX(-50%);z-index:100001;background:var(--bg2);border:1px solid var(--bdr);border-left:4px solid var(--ac);border-radius:12px;padding:12px 14px;max-width:340px;box-shadow:0 12px 30px rgba(0,0,0,.2);font-size:.85rem;color:var(--txt)}" +
      "#uk-hint button{margin-top:8px;padding:6px 14px;border:none;border-radius:8px;background:var(--ac);color:#fff;font-weight:600;cursor:pointer}" +
      "#uk-tabs{display:none}" +
      "@media(max-width:640px){#uk-tabs{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:1300;background:var(--bg2);border-top:1px solid var(--bdr);padding:4px 0 max(4px,env(safe-area-inset-bottom));box-shadow:0 -2px 12px rgba(0,0,0,.08)}" +
      "#uk-tabs button{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;background:transparent;border:none;color:var(--txt2);font-size:.62rem;padding:5px 0;cursor:pointer}#uk-tabs button .ic{font-size:1.25rem;line-height:1}" +
      "#uk-bottom{bottom:76px}#be-btn{bottom:74px}}";
    document.head.appendChild(el("style", { id: "uk-style" }, css));
  }

  function newLogo() { var sv = document.querySelector("#hdr h1 svg"); if (sv) sv.outerHTML = LOGO; }
  function setRouteIcon() { var rb = byId("rbb"); if (!rb) return; var bi = rb.querySelector(".bi"); if (bi) bi.innerHTML = ROUTE; }
  function profileBtn() {
    var a = byId("acct"); if (!a) return; a.classList.add("uk-profile"); a.title = "Profilo / accedi";
    var bl = a.querySelector(".bl"), bi = a.querySelector(".bi");
    if (bi) bi.style.display = "none"; if (bl) bl.style.display = "none";
    var av = a.querySelector(".uk-av"); if (!av) { av = el("span", { "class": "uk-av" }); a.appendChild(av); }
    function initials(name) { name = (name || "").trim(); if (!name || /accedi|login|sign|entra/i.test(name)) return null; var p = name.split(/\s+/).filter(Boolean); var s = (p[0] ? p[0][0] : "") + (p.length > 1 ? p[p.length - 1][0] : ""); return s.toUpperCase().slice(0, 2); }
    function upd() { var ini = initials(bl ? bl.textContent : ""); av.innerHTML = ini ? esc(ini) : HELMET; a.classList.toggle("uk-logged", !!ini); }
    upd();
    if (bl && window.MutationObserver) new MutationObserver(upd).observe(bl, { childList: true, characterData: true, subtree: true });
  }

  function buildMore() {
    var hdr = byId("hdr"); if (!hdr || byId("uk-more")) return;
    var btn = el("button", { "class": "btn", id: "uk-more", title: "Altro" }, '<span class="bi">&#x22EF;</span><span class="bl">Altro</span>');
    hdr.appendChild(btn);
    var menu = el("div", { id: "uk-more-menu" }); document.body.appendChild(menu);
    ["fb", "tb", "ed", "db", "myrides"].forEach(function (id) { var b = byId(id); if (b) menu.appendChild(b); });
    function place() { var r = btn.getBoundingClientRect(); menu.style.top = (r.bottom + 6) + "px"; menu.style.left = Math.max(8, r.right - menu.offsetWidth) + "px"; }
    btn.addEventListener("click", function (e) { e.stopPropagation(); if (menu.classList.toggle("open")) place(); });
    document.addEventListener("click", function (e) { if (e.target !== btn && !menu.contains(e.target)) menu.classList.remove("open"); });
    menu.addEventListener("click", function () { setTimeout(function () { menu.classList.remove("open"); }, 0); });
    window.addEventListener("resize", function () { if (menu.classList.contains("open")) place(); });
  }

  var OVMIR = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];
  function ovPost(q) { return new Promise(function (res, rej) { var i = 0; (function go() { if (i >= OVMIR.length) { rej(); return; } var ac = ("AbortController" in window) ? new AbortController() : null, to = ac ? setTimeout(function () { ac.abort(); }, 12000) : null; fetch(OVMIR[i++], { method: "POST", body: "data=" + encodeURIComponent(q), signal: ac ? ac.signal : undefined }).then(function (r) { if (to) clearTimeout(to); if (!r.ok) throw 0; return r.json(); }).then(res).catch(function () { go(); }); })(); }); }
  var foodOn = false, foodLayer = null, foodTimer = null, foodIds = {};
  function foodMove() { clearTimeout(foodTimer); foodTimer = setTimeout(loadFood, 600); }
  function loadFood() {
    var map = getMap(); if (!foodOn || !map || !window.L) return;
    if (!foodLayer) foodLayer = L.layerGroup().addTo(map);
    if (map.getZoom() < 12) { foodLayer.clearLayers(); foodIds = {}; return; }
    var bb = map.getBounds(), box = "(" + bb.getSouth().toFixed(4) + "," + bb.getWest().toFixed(4) + "," + bb.getNorth().toFixed(4) + "," + bb.getEast().toFixed(4) + ")";
    var q = '[out:json][timeout:20];(node["amenity"~"^(cafe|restaurant|fast_food|bar|pub|ice_cream)$"]' + box + ';node["shop"~"^(bakery|convenience|supermarket|greengrocer)$"]' + box + ';);out body 250;';
    ovPost(q).then(function (d) { (d.elements || []).forEach(function (e2) { if (e2.type !== "node" || foodIds[e2.id]) return; foodIds[e2.id] = 1; var t = e2.tags || {}; var ic = L.divIcon({ className: "uk-food-ic", html: '<div style="font-size:15px;filter:drop-shadow(0 1px 1px rgba(0,0,0,.4))">&#x1F37D;&#xFE0F;</div>', iconSize: [20, 20], iconAnchor: [10, 10] }); L.marker([e2.lat, e2.lon], { icon: ic }).bindPopup("&#x1F37D;&#xFE0F; <b>" + esc(t.name || "Ristoro") + "</b><br>" + esc(t.amenity || t.shop || "")).addTo(foodLayer); }); }).catch(function () {});
  }
  function toggleFood(btn) { var map = getMap(); if (!map) return; foodOn = !foodOn; if (btn) btn.classList.toggle("active", foodOn); if (foodOn) { map.on("moveend", foodMove); loadFood(); } else { map.off("moveend", foodMove); if (foodLayer) foodLayer.clearLayers(); foodIds = {}; } }

  function buildBottom() {
    if (byId("uk-bottom")) return;
    var box = el("div", { id: "uk-bottom" });
    var fount = byId("fountBtn"); if (fount) box.appendChild(fount);
    var food = el("button", { "class": "btn", id: "uk-food", title: "Ristori (bar, panetterie, market)" }, '<span class="bi">&#x1F37D;&#xFE0F;</span><span class="bl">Cibo</span>');
    food.addEventListener("click", function () { toggleFood(food); });
    box.appendChild(food);
    var cats = [["HC", "#7c1d1d"], ["1", "#b91c1c"], ["2", "#ea580c"], ["3", "#ca8a04"], ["4", "#16a34a"]];
    try { var cc = gref("catColor"); if (typeof cc === "function") cats = cats.map(function (c) { var v = cc(c[0]); return [c[0], v || c[1]]; }); } catch (e) {}
    var g = el("div", { id: "uk-legend" }); var html = "<b>Difficolta</b>"; cats.forEach(function (c) { html += '<span><i style="background:' + c[1] + '"></i>' + c[0] + "</span>"; }); g.innerHTML = html;
    box.appendChild(g); document.body.appendChild(box);
  }

  var stimer = null, sctrl = null;
  function restorePasses() { var q = byId("search"); if (q) q.value = ""; var af = gref("applyFilters"); if (typeof af === "function") { try { af(); } catch (e) {} } var box = byId("sresults"); if (box) { box.classList.remove("open"); box.innerHTML = ""; } }
  function goPlace(r) { var map = getMap(); var lat = parseFloat(r.lat), lon = parseFloat(r.lon), bb = r.boundingbox; if (map && map.fitBounds) { if (bb && bb.length === 4) map.fitBounds([[+bb[0], +bb[2]], [+bb[1], +bb[3]]], { maxZoom: 13, padding: [30, 30] }); else if (!isNaN(lat) && !isNaN(lon)) map.flyTo([lat, lon], 11); } var box = byId("sresults"); if (box) box.classList.remove("open"); }
  function placeAppend() {
    var q = byId("search"); if (!q) return; var v = q.value.trim(); if (v.length < 3) return;
    if (sctrl) { try { sctrl.abort(); } catch (e) {} } sctrl = ("AbortController" in window) ? new AbortController() : null;
    fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=4&accept-language=it&q=" + encodeURIComponent(v), { signal: sctrl ? sctrl.signal : undefined, headers: { "Accept": "application/json" } }).then(function (r) { return r.ok ? r.json() : []; }).then(function (list) {
      if (!Array.isArray(list) || !list.length || q.value.trim() !== v) return; var box = byId("sresults"); if (!box) return;
      var old = box.querySelector(".uk-secwrap"); if (old) old.remove(); var wrap = el("div", { "class": "uk-secwrap" }); wrap.appendChild(el("div", { "class": "uk-sec" }, "Luoghi"));
      list.forEach(function (r) { var it = el("div", { "class": "uk-place" }, "<span>&#x1F4CD; " + esc(r.name || (r.display_name || "").split(",")[0]) + "</span><small>" + esc(r.display_name || "") + "</small>"); it.addEventListener("click", function () { goPlace(r); }); wrap.appendChild(it); });
      box.appendChild(wrap); box.classList.add("open");
    }).catch(function () {});
  }
  function wireSearch() { var q = byId("search"); if (!q) return; q.addEventListener("input", function () { if (stimer) clearTimeout(stimer); stimer = setTimeout(placeAppend, 500); }); }

  function tab(ic, label, fn) { var b = el("button", null, '<span class="ic">' + ic + '</span><span>' + label + '</span>'); b.addEventListener("click", fn); return b; }
  function buildTabs() {
    if (byId("uk-tabs")) return; var bar = el("div", { id: "uk-tabs" });
    bar.appendChild(tab("&#x1F5FA;&#xFE0F;", "Mappa", function () { var h = document.querySelector('#hdr h1'); if (h) h.click(); }));
    bar.appendChild(tab("&#x1F50D;", "Cerca", function () { var s = byId("search"); if (s) { s.focus(); s.scrollIntoView(); } }));
    bar.appendChild(tab("&#x1F6A9;", "Giro", function () { var b = byId("rbb"); if (b) b.click(); }));
    bar.appendChild(tab("&#x1F6B5;", "Profilo", function () { var b = byId("acct"); if (b) b.click(); }));
    bar.appendChild(tab("&#x22EF;", "Altro", function () { var b = byId("uk-more"); if (b) b.click(); }));
    document.body.appendChild(bar);
  }

  function firstHint() {
    try { if (localStorage.getItem("uk_hint_seen")) return; } catch (e) {}
    var h = el("div", { id: "uk-hint" }, "&#x1F44B; I pallini colorati sono le salite: il <b>colore</b> e' la difficolta (HC = piu dura). Tocca un pallino per i dettagli, o <b>Crea giro</b> per un percorso. In basso trovi acqua, ristori e la legenda.<br><button id='uk-hint-ok'>Ho capito</button>");
    document.body.appendChild(h); var ok = byId("uk-hint-ok"); if (ok) ok.addEventListener("click", function () { try { localStorage.setItem("uk_hint_seen", "1"); } catch (e) {} h.remove(); });
  }
  function relabelRoute() { var rb = byId("rbb"); if (rb) { var bl = rb.querySelector(".bl"); if (bl) bl.textContent = "Crea giro"; } }

  /* la ricerca NON deve filtrare la mappa: avvolgo applyFilters cosi' ignora il testo del
     campo (i passi restano tutti). Regione/Difficolta continuano a filtrare. */
  function neutralizeSearchFilter() {
    var af = window.applyFilters;
    if (typeof af !== "function" || af._uk) return;
    var w = function () { var s = byId("search"), saved = s ? s.value : null; if (s) s.value = ""; try { return af.apply(this, arguments); } finally { if (s && saved != null) s.value = saved; } };
    w._uk = 1; window.applyFilters = w;
  }

  function start() { injectStyle(); [newLogo, setRouteIcon, profileBtn, buildMore, buildBottom, wireSearch, buildTabs, firstHint, relabelRoute, neutralizeSearchFilter].forEach(function (f) { try { f(); } catch (e) {} }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
