/* uikit.js v8 — interfaccia LocaRide. Modulo AUTONOMO e reversibile. */
(function () {
  "use strict";
  function el(t, a, h) { var e = document.createElement(t); if (a) for (var k in a) e.setAttribute(k, a[k]); if (h != null) e.innerHTML = h; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function byId(id) { return document.getElementById(id); }
  function gref(n) { try { return (new Function("try{return typeof " + n + "!=='undefined'?" + n + ":(window." + n + "||null)}catch(e){return null}"))(); } catch (e) { return null; } }
  function getMap() { return window.map || gref("map"); }
  function EN() { return gref("LR_LANG") === "en"; }
  function L(it, en) { return EN() ? en : it; }

  var LOGO = '<svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><defs><linearGradient id="uklg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2563eb"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs><path d="M17 2C10.6 2 5.4 7.1 5.4 13.4 5.4 21.6 17 32 17 32s11.6-10.4 11.6-18.6C28.6 7.1 23.4 2 17 2z" fill="url(#uklg)"/><path d="M9 19.5 13.6 13l3 3.7 3-4.6L25 19.5z" fill="#fff"/><circle cx="17" cy="9.2" r="1.9" fill="#f59e0b"/></svg>';
  /* ruota aero deep-section: cerchione profondo (anello pieno), raggi sottili, mozzo */
  var WHEEL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" fill="currentColor" d="M12 1.2a10.8 10.8 0 1 0 0 21.6 10.8 10.8 0 1 0 0-21.6zM12 6.6a5.4 5.4 0 1 0 0 10.8 5.4 5.4 0 1 0 0-10.8z"/><path stroke="currentColor" stroke-width="0.9" d="M12 12 18 12M12 12 16.24 16.24M12 12 12 18M12 12 7.76 16.24M12 12 6 12M12 12 7.76 7.76M12 12 12 6M12 12 16.24 7.76"/><circle cx="12" cy="12" r="2.1" fill="currentColor"/></svg>';

  function injectStyle() {
    if (byId("uk-style")) return;
    var css =
      "#place-wrap{display:none!important}#uk-more,#uk-more-wrap{display:none!important}" +
      "#hdr .btn{padding:8px 12px}#rbb{display:none!important}" +
      "#uk-left{display:flex;align-items:center;gap:12px;flex:1;min-width:0}#uk-left #search-wrap{flex:1}" +
      "#uk-center{display:flex;align-items:center;gap:9px;padding:0 6px}#uk-right{display:flex;align-items:center;gap:9px;flex:1;justify-content:flex-end}" +
      "#uk-plus{background:var(--ac)!important;color:#fff!important;border-color:var(--ac)!important;width:42px;height:42px;padding:0!important;border-radius:50%!important;justify-content:center}#uk-plus .bi{font-size:1.5rem;line-height:1}" +
      "#hdr #fountBtn,#hdr #uk-food,#uk-gear{width:40px;height:40px;padding:0!important;border-radius:50%!important;justify-content:center}" +
      "#hdr #fountBtn .bl,#hdr #uk-food .bl{display:none!important}#hdr #fountBtn.active,#hdr #uk-food.active{background:var(--ac)!important;color:#fff!important}" +
      "#acct.uk-profile{width:44px;height:44px;padding:0!important;border-radius:50%!important;justify-content:center;border-color:var(--ac)!important;color:var(--ac)!important;overflow:hidden}" +
      "#acct.uk-profile.uk-logged{background:var(--ac)!important;color:#fff!important}" +
      "#acct.uk-profile .uk-av{position:relative;display:flex;align-items:center;justify-content:center;width:100%;height:100%;background-size:cover;background-position:center;font-weight:700;font-size:.95rem;text-shadow:0 1px 3px rgba(0,0,0,.5)}#acct.uk-profile .uk-av svg{width:24px;height:24px}" +
      ".uk-menu{position:fixed;min-width:214px;background:var(--bg2);border:1px solid var(--bdr);border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,.2);padding:6px;z-index:100000;display:none}.uk-menu.open{display:block}" +
      ".uk-menu .btn,.uk-mi{display:flex!important;width:100%;justify-content:flex-start;align-items:center;gap:8px;border:none;background:transparent;border-radius:8px;padding:9px 12px;margin:0;font-size:.9rem;color:var(--txt);cursor:pointer}.uk-menu .btn:hover,.uk-mi:hover{background:var(--bg)}.uk-menu .btn .bl{display:inline!important}.uk-mi .bi{font-size:1.15rem}" +
      ".uk-sec{padding:6px 12px 4px;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--txt2);border-top:1px solid var(--bdr)}.uk-place{padding:8px 12px;cursor:pointer;font-size:.86rem;display:flex;flex-direction:column;gap:1px}.uk-place:hover{background:var(--bg)}.uk-place small{color:var(--txt2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      "#uk-legend{position:fixed;left:50%;transform:translateX(-50%);bottom:60px;z-index:960;background:var(--bg2);border:1px solid var(--bdr);border-radius:10px;padding:6px 11px;font-size:.72rem;color:var(--txt2);box-shadow:0 3px 12px rgba(0,0,0,.14);display:flex;gap:9px;align-items:center;flex-wrap:wrap}#uk-legend b{color:var(--txt);font-weight:600}#uk-legend span{display:inline-flex;align-items:center;gap:4px}#uk-legend i{width:12px;height:12px;border-radius:3px;display:inline-block}" +
      "body.fp-open #be-btn{transform:translateX(266px)}body.rb-open #be-btn{transform:translateX(352px)}#be-btn{transition:transform .28s ease}" +
      "#uk-hint{position:fixed;left:50%;top:calc(var(--hdr) + 14px);transform:translateX(-50%);z-index:100001;background:var(--bg2);border:1px solid var(--bdr);border-left:4px solid var(--ac);border-radius:12px;padding:12px 14px;max-width:340px;box-shadow:0 12px 30px rgba(0,0,0,.2);font-size:.85rem;color:var(--txt)}#uk-hint button{margin-top:8px;padding:6px 14px;border:none;border-radius:8px;background:var(--ac);color:#fff;font-weight:600;cursor:pointer}" +
      "#uk-auto{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:100002;display:none;align-items:center;justify-content:center}#uk-auto.open{display:flex}" +
      ".uk-dlg{background:var(--bg2);color:var(--txt);border-radius:16px;padding:22px;width:340px;max-width:92vw;box-shadow:0 20px 50px rgba(0,0,0,.3)}.uk-dlg h3{margin:0 0 4px}.uk-dh{color:var(--txt2);font-size:.85rem;margin:0 0 14px}.uk-dlg label{display:block;font-size:.85rem;margin:12px 0 4px}.uk-dlg input[type=range]{width:100%}.uk-dbtn{display:flex;gap:8px;margin-top:18px}.uk-dbtn button{flex:1;padding:9px;border-radius:8px;border:1px solid var(--bdr);background:var(--bg);color:var(--txt);font-weight:600;cursor:pointer}#uk-agen{background:var(--ac)!important;color:#fff!important;border-color:var(--ac)!important}" +
      "#uk-tabs{display:none}" +
      "@media(max-width:640px){#uk-tabs{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:1300;background:var(--bg2);border-top:1px solid var(--bdr);padding:4px 0 max(4px,env(safe-area-inset-bottom));box-shadow:0 -2px 12px rgba(0,0,0,.08)}#uk-tabs button{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;background:transparent;border:none;color:var(--txt2);font-size:.62rem;padding:5px 0;cursor:pointer}#uk-tabs button .ic{font-size:1.25rem;line-height:1}#uk-legend{bottom:120px}#be-btn{bottom:74px}}";
    document.head.appendChild(el("style", { id: "uk-style" }, css));
  }

  function newLogo() { var sv = document.querySelector("#hdr h1 svg"); if (sv) sv.outerHTML = LOGO; }
  function dropdown(btn) { var menu = el("div", { "class": "uk-menu" }); document.body.appendChild(menu); function place() { var r = btn.getBoundingClientRect(); menu.style.top = (r.bottom + 6) + "px"; menu.style.left = Math.max(8, r.right - menu.offsetWidth) + "px"; } btn.addEventListener("click", function (e) { e.stopPropagation(); if (menu.classList.toggle("open")) place(); }); document.addEventListener("click", function (e) { if (e.target !== btn && !btn.contains(e.target) && !menu.contains(e.target)) menu.classList.remove("open"); }); menu.addEventListener("click", function () { setTimeout(function () { menu.classList.remove("open"); }, 0); }); window.addEventListener("resize", function () { if (menu.classList.contains("open")) place(); }); return menu; }
  function mi(icon, label, fn) { var b = el("button", { "class": "uk-mi" }, '<span class="bi">' + icon + '</span>' + label); b.addEventListener("click", fn); return b; }

  function buildHeader() {
    var hdr = byId("hdr"); if (!hdr || byId("uk-left")) return;
    var h1 = hdr.querySelector("h1"), sw = byId("search-wrap"), acct = byId("acct"), fount = byId("fountBtn"), lang = byId("langBtn");
    var left = el("div", { id: "uk-left" }), center = el("div", { id: "uk-center" }), right = el("div", { id: "uk-right" });
    var plus = el("button", { "class": "btn", id: "uk-plus", title: L("Crea", "Create") }, '<span class="bi">+</span>');
    var gear = el("button", { "class": "btn", id: "uk-gear", title: L("Impostazioni", "Settings") }, '<span class="bi">&#x2699;&#xFE0F;</span>');
    var food = el("button", { "class": "btn", id: "uk-food", title: L("Ristori aperti ora", "Food open now") }, '<span class="bi">&#x1F37D;&#xFE0F;</span><span class="bl">Cibo</span>');
    food.addEventListener("click", function () { toggleFood(food); });
    if (h1) left.appendChild(h1); if (sw) left.appendChild(sw);
    if (fount) center.appendChild(fount); center.appendChild(food);
    if (lang) right.appendChild(lang); right.appendChild(plus); right.appendChild(gear); if (acct) right.appendChild(acct);
    hdr.appendChild(left); hdr.appendChild(center); hdr.appendChild(right);
    var pm = dropdown(plus);
    pm.appendChild(mi("&#x1F4E5;", L("Importa GPX", "Import GPX"), function () { var f = gref("pickGPX"); if (typeof f === "function") { try { f(); return; } catch (e) {} } var b = document.querySelector('[data-act="pickGPX"]'); if (b) b.click(); }));
    pm.appendChild(mi("&#x1F6A9;", L("Crea giro", "Plan a ride"), function () { var b = byId("rbb"); if (b) b.click(); }));
    pm.appendChild(mi("&#x2728;", L("Giro automatico", "Auto route"), autoRoute));
    var gm = dropdown(gear);
    ["fb", "tb", "ed", "db", "myrides"].forEach(function (id) { var b = byId(id); if (b) gm.appendChild(b); });
    gm.appendChild(mi("&#x1F5BC;&#xFE0F;", L("Cambia foto profilo", "Change profile photo"), pickPhoto));
  }
  function setPlaceholder() { var s = byId("search"); if (s) s.placeholder = L("Cerca passo o localita", "Search a climb or place"); }

  /* profilo */
  function getPhoto() { try { return localStorage.getItem("uk_photo") || ""; } catch (e) { return ""; } }
  function setPhoto(d) { try { if (d) localStorage.setItem("uk_photo", d); else localStorage.removeItem("uk_photo"); } catch (e) {} renderAvatar(); }
  function pickPhoto() { var inp = el("input", { type: "file", accept: "image/*" }); inp.style.display = "none"; document.body.appendChild(inp); inp.onchange = function () { var f = inp.files && inp.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { setPhoto(rd.result); }; rd.readAsDataURL(f); setTimeout(function () { inp.remove(); }, 0); }; inp.click(); }
  function curInitials() { var a = byId("acct"), bl = a && a.querySelector(".bl"); var name = (bl ? bl.textContent : "").trim(); if (!name || /accedi|login|sign|entra/i.test(name)) return null; var p = name.split(/\s+/).filter(Boolean); return ((p[0] ? p[0][0] : "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase().slice(0, 2); }
  function renderAvatar() { var a = byId("acct"); if (!a) return; var av = a.querySelector(".uk-av"); if (!av) return; var ini = curInitials(), photo = getPhoto(); if (photo) { av.style.backgroundImage = "url(" + photo + ")"; av.innerHTML = ini ? esc(ini) : ""; a.classList.add("uk-logged"); } else { av.style.backgroundImage = ""; av.innerHTML = ini ? esc(ini) : WHEEL; a.classList.toggle("uk-logged", !!ini); } }
  function profileBtn() { var a = byId("acct"); if (!a) return; a.classList.add("uk-profile"); a.title = L("Profilo / accedi", "Profile / sign in"); var bl = a.querySelector(".bl"), bi = a.querySelector(".bi"); if (bi) bi.style.display = "none"; if (bl) bl.style.display = "none"; if (!a.querySelector(".uk-av")) a.appendChild(el("span", { "class": "uk-av" })); renderAvatar(); if (bl && window.MutationObserver) new MutationObserver(renderAvatar).observe(bl, { childList: true, characterData: true, subtree: true }); }

  /* fix ghost profilo */
  function fixRbCursor() { if (typeof window.rbCursor !== "function" || window.rbCursor._uk) return; var f = function (px) { var rp = gref("rbProf"); if (!rp) return; var c = rp.c; if (px == null) { hideElevCursor(); window.rbHoverKm = null; drawRouteProfile(); return; } drawProfileCanvas(c); var P = gref("rbProf"); var k = Math.max(0, Math.min(P.S.n - 1, Math.round(((px - P.PL) / P.S.iw) * P.S.n))); window.rbHoverKm = (k / P.S.n) * P.S.tot; drawProfileOverlay(k); var tr = gref("rbTrack"), ti = P.S.idx[k]; if (tr && tr[ti]) showElevCursor(tr[ti][0], tr[ti][1]); var other = c.id === "relev" ? byId("rb-elev") : byId("relev"); if (other && other.offsetWidth) drawProfileCanvasOverlayOn(other, window.rbHoverKm); }; f._uk = 1; window.rbCursor = f; }

  /* giro automatico: finestra km/dislivello, anello */
  function autoRoute() { var map = getMap(); if (!map) return; if (map.getZoom() < 9) { alert(L("Zooma su un'area (una regione, non tutta Europa) per generare un giro.", "Zoom into an area (a region, not all Europe) to generate a ride.")); return; } buildAutoDialog(); byId("uk-auto").classList.add("open"); }
  function buildAutoDialog() {
    if (byId("uk-auto")) return;
    var ov = el("div", { id: "uk-auto" });
    ov.innerHTML = '<div class="uk-dlg"><h3>' + L("Giro automatico", "Auto route") + '</h3><p class="uk-dh">' + L("Un anello con le salite nell'area visibile.", "A loop from the climbs in view.") + '</p>' +
      '<label>' + L("Distanza", "Distance") + ': <b id="uk-km">60</b> km</label><input type="range" id="uk-kmR" min="20" max="200" value="60" step="5">' +
      '<label>' + L("Dislivello", "Elevation gain") + ': <b id="uk-el">1500</b> m</label><input type="range" id="uk-elR" min="300" max="4000" value="1500" step="100">' +
      '<div class="uk-dbtn"><button id="uk-agen">' + L("Genera", "Generate") + '</button><button id="uk-acan">' + L("Annulla", "Cancel") + '</button></div></div>';
    document.body.appendChild(ov);
    var km = byId("uk-kmR"), e2 = byId("uk-elR");
    km.oninput = function () { byId("uk-km").textContent = km.value; };
    e2.oninput = function () { byId("uk-el").textContent = e2.value; };
    byId("uk-acan").onclick = function () { ov.classList.remove("open"); };
    byId("uk-agen").onclick = function () { ov.classList.remove("open"); generateAuto(+km.value, +e2.value); };
    ov.addEventListener("click", function (e) { if (e.target === ov) ov.classList.remove("open"); });
  }
  function generateAuto(km, dl) {
    var map = getMap(); if (!map) return; var b = map.getBounds(), c = map.getCenter();
    function mk(p, osm) { var v = (p.versanti || [])[0] || {}; return { id: p.id, osm: osm, lat: p.lat, lon: p.lon, dist: v.distance_km || 5, gain: (v.endElevation - v.startElevation) || 300, ang: Math.atan2(p.lat - c.lat, p.lon - c.lng) }; }
    var cand = [];
    (gref("PASSES_DATA") || []).forEach(function (p) { if (p && p.lat != null && b.contains([p.lat, p.lon]) && p.versanti && p.versanti.length) cand.push(mk(p, false)); });
    (gref("osmPasses") || []).forEach(function (p) { if (p && p.lat != null && b.contains([p.lat, p.lon]) && p.versanti && p.versanti.length) cand.push(mk(p, true)); });
    if (cand.length < 2) { alert(L("Poche salite nell'area: zooma su una zona con piu passi.", "Too few climbs here: zoom to an area with more climbs.")); return; }
    cand.sort(function (a, b) { return a.ang - b.ang; }); // ordine ad anello attorno al centro
    var pick = [], sk = 0, sg = 0;
    for (var i = 0; i < cand.length && sk < km; i++) { var x = cand[i]; if (sk + x.dist * 2 <= km * 1.2 && sg + x.gain <= dl * 1.25) { pick.push(x); sk += x.dist * 2; sg += x.gain; } }
    if (pick.length < 2) pick = cand.slice(0, 3);
    var rbb = byId("rbb"); if (rbb) rbb.click();
    var add = gref("addToRoute"), addO = gref("addOsmToRoute");
    function push(x) { try { if (x.osm && typeof addO === "function") addO(x.id); else if (typeof add === "function") add(x.id); } catch (e) {} }
    pick.forEach(push); push(pick[0]); // chiudi ad anello: torna al primo
    var calc = gref("calcRoute"); setTimeout(function () { if (typeof calc === "function") { try { calc(); } catch (e) {} } }, 400);
  }

  /* cibo: usa il motore Overpass funzionante dell'app + "aperto ora" */
  var OVMIR = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
  function overpass(q) { var op = gref("overpassPost"), mir = gref("shuffledMirrors"); var urls = (typeof mir === "function") ? mir() : OVMIR; return new Promise(function (res, rej) { var i = 0; (function go() { if (i >= urls.length) { rej(); return; } var u = urls[i++]; var pr = (typeof op === "function") ? op(u, q, 12000) : fetch(u, { method: "POST", body: "data=" + encodeURIComponent(q) }).then(function (r) { if (!r.ok) throw 0; return r.json(); }); pr.then(res).catch(function () { go(); }); })(); }); }
  function ohOpen(oh) {
    if (!oh) return null; oh = String(oh).toLowerCase(); if (oh.indexOf("24/7") >= 0) return true;
    var d = new Date(), day = ["su", "mo", "tu", "we", "th", "fr", "sa"][d.getDay()], mins = d.getHours() * 60 + d.getMinutes(), res = null, days = ["mo", "tu", "we", "th", "fr", "sa", "su"];
    oh.split(";").forEach(function (rule) {
      rule = rule.trim(); if (!rule) return;
      var times = rule.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g); if (!times) return;
      var dp = rule.replace(/\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/g, "").trim(), applies = true;
      if (/[a-z]/.test(dp)) { applies = false; dp.split(/[ ,]+/).forEach(function (tok) { var rg = tok.match(/^([a-z]{2})-([a-z]{2})$/); if (rg) { var a = days.indexOf(rg[1]); if (a >= 0) for (var k = 0; k < 7; k++) { var dd = days[(a + k) % 7]; if (dd === day) applies = true; if (dd === rg[2]) break; } } else if (tok === day) applies = true; }); }
      if (!applies) return;
      times.forEach(function (t) { var m = t.match(/(\d{1,2}):(\d{2}).*?(\d{1,2}):(\d{2})/); var s = +m[1] * 60 + +m[2], e = +m[3] * 60 + +m[4]; if (e <= s) e += 1440; if (mins >= s && mins < e) res = true; else if (res !== true) res = false; });
    });
    return res;
  }
  var foodOn = false, foodLayer = null, foodTimer = null, foodIds = {};
  function foodMove() { clearTimeout(foodTimer); foodTimer = setTimeout(loadFood, 600); }
  function loadFood() {
    var map = getMap(); if (!foodOn || !map || !window.L) return; if (!foodLayer) foodLayer = L.layerGroup().addTo(map);
    if (map.getZoom() < 12) { foodLayer.clearLayers(); foodIds = {}; if (typeof showRSBrief === "function") try { showRSBrief(L("Zooma per vedere i ristori", "Zoom in to see food")); } catch (e) {} return; }
    var bb = map.getBounds(), box = "(" + bb.getSouth().toFixed(4) + "," + bb.getWest().toFixed(4) + "," + bb.getNorth().toFixed(4) + "," + bb.getEast().toFixed(4) + ")";
    var q = '[out:json][timeout:20];(node["amenity"~"^(cafe|restaurant|fast_food|bar|pub|ice_cream)$"]' + box + ';node["shop"~"^(bakery|convenience|supermarket|greengrocer)$"]' + box + ';);out body 300;';
    overpass(q).then(function (d) {
      (d.elements || []).forEach(function (e2) {
        if (e2.type !== "node" || foodIds[e2.id]) return; var t = e2.tags || {}; var open = ohOpen(t.opening_hours);
        if (open === false) return; // salta i chiusi
        foodIds[e2.id] = 1;
        var col = open === true ? "#16a34a" : "#f59e0b";
        var ic = L.divIcon({ className: "uk-food-ic", html: '<div style="font-size:15px;filter:drop-shadow(0 0 2px ' + col + ') drop-shadow(0 1px 1px rgba(0,0,0,.4))">&#x1F37D;&#xFE0F;</div>', iconSize: [20, 20], iconAnchor: [10, 10] });
        var st = open === true ? ("<span style='color:#16a34a'>" + L("Aperto ora", "Open now") + "</span>") : (open === false ? "" : ("<span style='color:#94a3b8'>" + L("Orario n/d", "Hours n/a") + "</span>"));
        L.marker([e2.lat, e2.lon], { icon: ic }).bindPopup("&#x1F37D;&#xFE0F; <b>" + esc(t.name || L("Ristoro", "Food")) + "</b><br>" + esc(t.amenity || t.shop || "") + "<br>" + st).addTo(foodLayer);
      });
    }).catch(function () {});
  }
  function toggleFood(btn) { var map = getMap(); if (!map) return; foodOn = !foodOn; if (btn) btn.classList.toggle("active", foodOn); if (foodOn) { map.on("moveend", foodMove); loadFood(); } else { map.off("moveend", foodMove); if (foodLayer) foodLayer.clearLayers(); foodIds = {}; } }

  function buildLegend() { if (byId("uk-legend")) return; var cats = [["HC", "#7c1d1d"], ["1", "#b91c1c"], ["2", "#ea580c"], ["3", "#ca8a04"], ["4", "#16a34a"]]; try { var cc = gref("catColor"); if (typeof cc === "function") cats = cats.map(function (c) { var v = cc(c[0]); return [c[0], v || c[1]]; }); } catch (e) {} var g = el("div", { id: "uk-legend" }); var html = "<b>" + L("Difficolta", "Difficulty") + "</b>"; cats.forEach(function (c) { html += '<span><i style="background:' + c[1] + '"></i>' + c[0] + "</span>"; }); g.innerHTML = html; document.body.appendChild(g); }

  var stimer = null, sctrl = null;
  function goPlace(r) { var map = getMap(); var lat = parseFloat(r.lat), lon = parseFloat(r.lon), bb = r.boundingbox; if (map && map.fitBounds) { if (bb && bb.length === 4) map.fitBounds([[+bb[0], +bb[2]], [+bb[1], +bb[3]]], { maxZoom: 13, padding: [30, 30] }); else if (!isNaN(lat) && !isNaN(lon)) map.flyTo([lat, lon], 11); } var box = byId("sresults"); if (box) box.classList.remove("open"); }
  function placeAppend() { var q = byId("search"); if (!q) return; var v = q.value.trim(); if (v.length < 3) return; if (sctrl) { try { sctrl.abort(); } catch (e) {} } sctrl = ("AbortController" in window) ? new AbortController() : null; fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=4&accept-language=it&q=" + encodeURIComponent(v), { signal: sctrl ? sctrl.signal : undefined, headers: { "Accept": "application/json" } }).then(function (r) { return r.ok ? r.json() : []; }).then(function (list) { if (!Array.isArray(list) || !list.length || q.value.trim() !== v) return; var box = byId("sresults"); if (!box) return; var old = box.querySelector(".uk-secwrap"); if (old) old.remove(); var wrap = el("div", { "class": "uk-secwrap" }); wrap.appendChild(el("div", { "class": "uk-sec" }, L("Luoghi", "Places"))); list.forEach(function (r) { var it = el("div", { "class": "uk-place" }, "<span>&#x1F4CD; " + esc(r.name || (r.display_name || "").split(",")[0]) + "</span><small>" + esc(r.display_name || "") + "</small>"); it.addEventListener("click", function () { goPlace(r); }); wrap.appendChild(it); }); box.appendChild(wrap); box.classList.add("open"); }).catch(function () {}); }
  function wireSearch() { var q = byId("search"); if (!q) return; q.addEventListener("input", function () { if (stimer) clearTimeout(stimer); stimer = setTimeout(placeAppend, 500); }); }
  function neutralizeSearchFilter() { var af = window.applyFilters; if (typeof af !== "function" || af._uk) return; var w = function () { var s = byId("search"), saved = s ? s.value : null; if (s) s.value = ""; try { return af.apply(this, arguments); } finally { if (s && saved != null) s.value = saved; } }; w._uk = 1; window.applyFilters = w; }

  function tab(ic, label, fn) { var b = el("button", null, '<span class="ic">' + ic + '</span><span>' + label + '</span>'); b.addEventListener("click", fn); return b; }
  function buildTabs() { if (byId("uk-tabs")) return; var bar = el("div", { id: "uk-tabs" }); bar.appendChild(tab("&#x1F5FA;&#xFE0F;", L("Mappa", "Map"), function () { var h = document.querySelector('#hdr h1'); if (h) h.click(); })); bar.appendChild(tab("&#x1F50D;", L("Cerca", "Search"), function () { var s = byId("search"); if (s) { s.focus(); s.scrollIntoView(); } })); bar.appendChild(tab("&#x2B;", L("Crea", "Create"), function () { var b = byId("uk-plus"); if (b) b.click(); })); bar.appendChild(tab("&#x1F6B5;", L("Profilo", "Profile"), function () { var b = byId("acct"); if (b) b.click(); })); bar.appendChild(tab("&#x2699;&#xFE0F;", "Menu", function () { var b = byId("uk-gear"); if (b) b.click(); })); document.body.appendChild(bar); }
  function firstHint() { try { if (localStorage.getItem("uk_hint_seen")) return; } catch (e) {} var h = el("div", { id: "uk-hint" }, L("&#x1F44B; I pallini colorati sono le salite: il <b>colore</b> e' la difficolta (HC = piu dura). Col <b>+</b> importi un GPX o crei un giro; con &#x2699;&#xFE0F; filtri e impostazioni.", "&#x1F44B; The colored dots are climbs: the <b>color</b> is the difficulty (HC = hardest). Use <b>+</b> to import a GPX or plan a ride; &#x2699;&#xFE0F; for filters and settings.") + "<br><button id='uk-hint-ok'>" + L("Ho capito", "Got it") + "</button>"); document.body.appendChild(h); var ok = byId("uk-hint-ok"); if (ok) ok.addEventListener("click", function () { try { localStorage.setItem("uk_hint_seen", "1"); } catch (e) {} h.remove(); }); }

  function start() { injectStyle(); [newLogo, profileBtn, buildHeader, setPlaceholder, buildLegend, wireSearch, buildTabs, firstHint, neutralizeSearchFilter, fixRbCursor].forEach(function (f) { try { f(); } catch (e) {} }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
