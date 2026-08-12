/* uikit.js — ridisegno leggero dell'interfaccia LocaRide. Modulo AUTONOMO e reversibile:
 * togli la riga <script src="js/uikit.js"> da index.html e torna tutto com'era.
 *
 * Fa quattro cose, ognuna difensiva (se un pezzo fallisce, gli altri restano):
 *  1) BARRA SNELLA: in vista restano Filtri e Percorso; Traffico/Editor/Tema/Lingua/Acqua/
 *     Account/I miei giri finiscono in un menu "Altro". Sposto gli ELEMENTI esistenti
 *     (le loro funzioni, agganciate per id o data-act, restano valide).
 *  2) RICERCA UNICA: nascondo la seconda barra (cerca-luogo) e aggancio i risultati "Luoghi"
 *     sotto la ricerca-passi, nella stessa tendina.
 *  3) NAV MOBILE: barra a schede in basso (Mappa/Cerca/Giro/Salvati/Altro) sotto i 640px,
 *     collegata alle azioni gia' esistenti.
 *  4) LEGENDA difficolta' + hint al primo avvio.
 */
(function () {
  "use strict";

  function el(t, a, h) { var e = document.createElement(t); if (a) for (var k in a) e.setAttribute(k, a[k]); if (h != null) e.innerHTML = h; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function byId(id) { return document.getElementById(id); }

  function injectStyle() {
    if (byId("uk-style")) return;
    var css =
      /* seconda barra ricerca-luogo: nascosta, la funzione passa nella ricerca unica */
      "#place-wrap{display:none!important}" +
      /* menu Altro */
      "#uk-more-wrap{position:relative}" +
      "#uk-more-menu{position:absolute;top:46px;right:0;min-width:210px;background:var(--bg2);border:1px solid var(--bdr);border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,.18);padding:6px;z-index:1200;display:none}" +
      "#uk-more-menu.open{display:block}" +
      "#uk-more-menu .btn{display:flex!important;width:100%;justify-content:flex-start;border:none;background:transparent;border-radius:8px;padding:9px 12px;margin:0}" +
      "#uk-more-menu .btn:hover{background:var(--bg)}" +
      "#uk-more-menu .btn .bl{display:inline!important}" +
      /* sezione Luoghi nella tendina di ricerca */
      ".uk-sec{padding:6px 12px 4px;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--txt2);border-top:1px solid var(--bdr)}" +
      ".uk-place{padding:8px 12px;cursor:pointer;font-size:.86rem;display:flex;flex-direction:column;gap:1px}" +
      ".uk-place:hover{background:var(--bg)}" +
      ".uk-place small{color:var(--txt2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      /* legenda difficolta' */
      "#uk-legend{position:fixed;left:12px;bottom:70px;z-index:900;background:var(--bg2);border:1px solid var(--bdr);border-radius:10px;padding:7px 10px;font-size:.72rem;color:var(--txt2);box-shadow:0 4px 14px rgba(0,0,0,.14);display:flex;gap:9px;align-items:center;flex-wrap:wrap;max-width:calc(100vw - 24px)}" +
      "#uk-legend b{color:var(--txt);font-weight:600;margin-right:2px}" +
      "#uk-legend span{display:inline-flex;align-items:center;gap:4px}" +
      "#uk-legend i{width:12px;height:12px;border-radius:3px;display:inline-block}" +
      /* hint primo avvio */
      "#uk-hint{position:fixed;left:50%;top:calc(var(--hdr) + 14px);transform:translateX(-50%);z-index:1500;background:var(--bg2);border:1px solid var(--bdr);border-left:4px solid var(--ac);border-radius:12px;padding:12px 14px;max-width:340px;box-shadow:0 12px 30px rgba(0,0,0,.2);font-size:.85rem;color:var(--txt)}" +
      "#uk-hint button{margin-top:8px;padding:6px 14px;border:none;border-radius:8px;background:var(--ac);color:#fff;font-weight:600;cursor:pointer}" +
      /* barra mobile a schede */
      "#uk-tabs{display:none}" +
      "@media(max-width:640px){" +
        "#hdr{gap:8px}" +
        "#uk-tabs{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:1300;background:var(--bg2);border-top:1px solid var(--bdr);padding:4px 0 max(4px,env(safe-area-inset-bottom));box-shadow:0 -2px 12px rgba(0,0,0,.08)}" +
        "#uk-tabs button{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;background:transparent;border:none;color:var(--txt2);font-size:.62rem;padding:5px 0;cursor:pointer}" +
        "#uk-tabs button .ic{font-size:1.25rem;line-height:1}" +
        "#uk-tabs button.on{color:var(--ac)}" +
        "#uk-legend{bottom:74px}" +
        "#be-btn{bottom:74px}" +
      "}";
    document.head.appendChild(el("style", { id: "uk-style" }, css));
  }

  /* ---------- 1) barra snella + menu Altro ---------- */
  function buildMore() {
    var hdr = byId("hdr"); if (!hdr || byId("uk-more-wrap")) return;
    var wrap = el("div", { id: "uk-more-wrap" });
    var btn = el("button", { "class": "btn", id: "uk-more", title: "Altro" }, '<span class="bi">&#x22EF;</span><span class="bl">Altro</span>');
    var menu = el("div", { id: "uk-more-menu" });
    wrap.appendChild(btn); wrap.appendChild(menu); hdr.appendChild(wrap);
    // sposto qui gli elementi secondari (mantengono i loro listener)
    ["tb", "ed", "db", "langBtn", "myrides", "fountBtn", "acct"].forEach(function (id) {
      var b = byId(id); if (b) menu.appendChild(b);
    });
    btn.addEventListener("click", function (e) { e.stopPropagation(); menu.classList.toggle("open"); });
    document.addEventListener("click", function (e) { if (!wrap.contains(e.target)) menu.classList.remove("open"); });
    // chiudo il menu quando si sceglie una voce
    menu.addEventListener("click", function () { setTimeout(function () { menu.classList.remove("open"); }, 0); });
  }

  /* ---------- 2) ricerca unica: risultati Luoghi nella tendina passi ---------- */
  var stimer = null, sctrl = null;
  function goPlace(r) {
    var box = byId("sresults"); if (box) { box.classList.remove("open"); box.innerHTML = ""; }
    var map = window.map || (typeof map !== "undefined" ? map : null);
    if (!map || !map.fitBounds) return;
    var lat = parseFloat(r.lat), lon = parseFloat(r.lon), bb = r.boundingbox;
    if (bb && bb.length === 4) map.fitBounds([[+bb[0], +bb[2]], [+bb[1], +bb[3]]], { maxZoom: 13, padding: [30, 30] });
    else if (!isNaN(lat) && !isNaN(lon)) map.flyTo([lat, lon], 11);
  }
  function placeAppend() {
    var q = byId("search"); if (!q) return;
    var v = q.value.trim();
    if (v.length < 3) return;
    if (sctrl) { try { sctrl.abort(); } catch (e) {} }
    sctrl = ("AbortController" in window) ? new AbortController() : null;
    var url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=4&accept-language=it&q=" + encodeURIComponent(v);
    fetch(url, { signal: sctrl ? sctrl.signal : undefined, headers: { "Accept": "application/json" } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (list) {
        if (!Array.isArray(list) || !list.length) return;
        if (q.value.trim() !== v) return;                 // l'utente ha continuato a scrivere
        var box = byId("sresults"); if (!box) return;
        var old = box.querySelector(".uk-secwrap"); if (old) old.remove();
        var wrap = el("div", { "class": "uk-secwrap" });
        wrap.appendChild(el("div", { "class": "uk-sec" }, "Luoghi"));
        list.forEach(function (r) {
          var it = el("div", { "class": "uk-place" },
            "<span>&#x1F4CD; " + esc(r.name || (r.display_name || "").split(",")[0]) + "</span><small>" + esc(r.display_name || "") + "</small>");
          it.addEventListener("click", function () { goPlace(r); });
          wrap.appendChild(it);
        });
        box.appendChild(wrap); box.classList.add("open");
      }).catch(function () {});
  }
  function wireSearch() {
    var q = byId("search"); if (!q) return;
    q.addEventListener("input", function () { if (stimer) clearTimeout(stimer); stimer = setTimeout(placeAppend, 500); });
  }

  /* ---------- 3) navigazione mobile a schede ---------- */
  function tab(ic, label, fn) {
    var b = el("button", null, '<span class="ic">' + ic + '</span><span>' + label + '</span>');
    b.addEventListener("click", fn); return b;
  }
  function buildTabs() {
    if (byId("uk-tabs")) return;
    var bar = el("div", { id: "uk-tabs" });
    bar.appendChild(tab("&#x1F5FA;&#xFE0F;", "Mappa", function () { var h = document.querySelector('#hdr h1'); if (h) h.click(); }));
    bar.appendChild(tab("&#x1F50D;", "Cerca", function () { var s = byId("search"); if (s) { s.focus(); s.scrollIntoView(); } }));
    bar.appendChild(tab("&#x1F6A9;", "Giro", function () { var b = byId("rbb"); if (b) b.click(); }));
    bar.appendChild(tab("&#x1F6B5;", "Salvati", function () { var b = byId("myrides"); if (b) b.click(); }));
    bar.appendChild(tab("&#x22EF;", "Altro", function () { var m = byId("uk-more-menu"); if (m) m.classList.toggle("open"); }));
    document.body.appendChild(bar);
  }

  /* ---------- 4) legenda + hint primo avvio ---------- */
  function buildLegend() {
    if (byId("uk-legend")) return;
    var cats = [["HC", "#7c1d1d"], ["1", "#b91c1c"], ["2", "#ea580c"], ["3", "#ca8a04"], ["4", "#16a34a"]];
    try { // se l'app espone catColor, uso i colori veri
      var cc = window.catColor || (typeof catColor !== "undefined" ? catColor : null);
      if (typeof cc === "function") cats = cats.map(function (c) { var v = cc(c[0]); return [c[0], v || c[1]]; });
    } catch (e) {}
    var g = el("div", { id: "uk-legend" });
    var html = "<b>Difficolta</b>";
    cats.forEach(function (c) { html += '<span><i style="background:' + c[1] + '"></i>' + c[0] + "</span>"; });
    g.innerHTML = html; document.body.appendChild(g);
  }
  function firstHint() {
    try { if (localStorage.getItem("uk_hint_seen")) return; } catch (e) {}
    var h = el("div", { id: "uk-hint" },
      "&#x1F44B; Benvenuto! I pallini colorati sulla mappa sono le salite: il <b>colore</b> ne indica la difficolta (HC = piu dura). Tocca un pallino per i dettagli, o usa <b>Crea giro</b> per costruire un percorso." +
      "<br><button id='uk-hint-ok'>Ho capito</button>");
    document.body.appendChild(h);
    var ok = byId("uk-hint-ok");
    if (ok) ok.addEventListener("click", function () { try { localStorage.setItem("uk_hint_seen", "1"); } catch (e) {} h.remove(); });
  }

  function start() {
    injectStyle();
    try { buildMore(); } catch (e) {}
    try { wireSearch(); } catch (e) {}
    try { buildTabs(); } catch (e) {}
    try { buildLegend(); } catch (e) {}
    try { firstHint(); } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
