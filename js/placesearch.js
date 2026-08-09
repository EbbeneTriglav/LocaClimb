/* placesearch.js — cerca luogo/zona stile Google Maps (geocoder Nominatim/OSM).
 *
 * Modulo AUTONOMO: crea la propria barra accanto al cerca-passi, il proprio menu a
 * tendina e il proprio stile. Non tocca nessun file esistente. Per rimuoverlo basta
 * togliere la riga <script src="js/placesearch.js"></script> da index.html.
 *
 * Perche' Nominatim: e' il geocoder ufficiale di OpenStreetMap, gratuito e senza chiavi
 * (siamo gia' in casa OSM). Ha una sola regola d'uso seria: max ~1 richiesta al secondo.
 * La rispettiamo con un debounce di 450 ms e annullando la richiesta precedente a ogni
 * tasto (AbortController), cosi' parte una sola query quando l'utente smette di digitare.
 */
(function () {
  "use strict";

  var ENDPOINT = "https://nominatim.openstreetmap.org/search";
  var MINCHARS = 3;
  var DEBOUNCE = 450;
  var timer = null, ctrl = null, hiMarker = null, sel = -1, items = [];

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (html != null) e.innerHTML = html;
    return e;
  }

  // --- stile (rispecchia il look del cerca-passi, usa le variabili del tema) ---
  function injectStyle() {
    if (document.getElementById("ps-style")) return;
    var css =
      "#place-wrap{position:relative;flex:1;max-width:300px;display:flex}" +
      "#placeq{width:100%;padding:10px 16px 10px 34px;border:1px solid var(--bdr);border-radius:22px;" +
        "background:var(--bg) url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z'/><circle cx='12' cy='10' r='3'/></svg>\") no-repeat 12px center;" +
        "color:var(--txt);font-size:1rem;outline:none}" +
      "#placeq:focus{border-color:var(--ac);box-shadow:0 0 0 3px rgba(37,99,235,.12)}" +
      "#presults{position:absolute;top:44px;left:0;right:0;background:var(--bg2);border:1px solid var(--bdr);" +
        "border-radius:10px;box-shadow:0 8px 22px rgba(0,0,0,.14);max-height:340px;overflow-y:auto;z-index:1100;display:none}" +
      "#presults.open{display:block}" +
      ".ps-item{padding:8px 12px;cursor:pointer;font-size:.86rem;border-bottom:1px solid var(--bdr);display:flex;flex-direction:column;gap:1px}" +
      ".ps-item:last-child{border-bottom:none}" +
      ".ps-item:hover,.ps-item.sel{background:var(--bg)}" +
      ".ps-item b{font-weight:600;color:var(--txt)}" +
      ".ps-item small{color:var(--txt2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".ps-msg{padding:9px 12px;font-size:.82rem;color:var(--txt2)}" +
      "@media(max-width:640px){#place-wrap{max-width:none}}";
    document.head.appendChild(el("style", { id: "ps-style" }, css));
  }

  // --- inserimento nella barra, subito dopo il cerca-passi ---
  function mount() {
    var hdr = document.getElementById("hdr");
    if (!hdr || document.getElementById("place-wrap")) return;
    injectStyle();
    var wrap = el("div", { id: "place-wrap" });
    wrap.appendChild(el("input", {
      type: "text", id: "placeq", autocomplete: "off",
      "aria-label": "Cerca un luogo o una zona",
      placeholder: "Vai a… paese, citta, zona"
    }));
    wrap.appendChild(el("div", { id: "presults" }));
    // affianca al #search-wrap se c'e', altrimenti in fondo all'header
    var anchor = document.getElementById("search-wrap");
    if (anchor && anchor.parentNode === hdr) hdr.insertBefore(wrap, anchor.nextSibling);
    else hdr.appendChild(wrap);
    wire();
  }

  function box() { return document.getElementById("presults"); }
  function closeBox() { var b = box(); if (b) { b.classList.remove("open"); b.innerHTML = ""; } sel = -1; items = []; }
  function msg(t) { var b = box(); if (b) { b.innerHTML = ""; b.appendChild(el("div", { "class": "ps-msg" }, t)); b.classList.add("open"); } }

  function render(list) {
    var b = box(); if (!b) return;
    b.innerHTML = ""; items = list; sel = -1;
    if (!list.length) { msg("Nessun luogo trovato."); return; }
    list.forEach(function (r, i) {
      var title = r.name || (r.display_name || "").split(",")[0];
      var it = el("div", { "class": "ps-item", "data-i": i });
      it.appendChild(el("b", null, esc(title)));
      it.appendChild(el("small", null, esc(r.display_name || "")));
      it.addEventListener("click", function () { go(r); });
      b.appendChild(it);
    });
    b.classList.add("open");
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // --- vola alla destinazione scelta ---
  function go(r) {
    closeBox();
    var q = document.getElementById("placeq"); if (q) q.value = r.name || (r.display_name || "").split(",")[0];
    var map = window.map;
    if (!map || typeof map.fitBounds !== "function") return;
    var lat = parseFloat(r.lat), lon = parseFloat(r.lon);
    var bb = r.boundingbox;
    if (bb && bb.length === 4) {
      map.fitBounds([[+bb[0], +bb[2]], [+bb[1], +bb[3]]], { maxZoom: 13, padding: [30, 30] });
    } else if (!isNaN(lat) && !isNaN(lon)) {
      map.flyTo([lat, lon], 11);
    }
    // segnaposto temporaneo, cosi' l'utente vede dove e' atterrato
    if (window.L && !isNaN(lat) && !isNaN(lon)) {
      if (hiMarker) { try { map.removeLayer(hiMarker); } catch (e) {} }
      hiMarker = L.circleMarker([lat, lon], {
        radius: 9, color: "#2563eb", weight: 3, fillColor: "#2563eb", fillOpacity: .25
      }).addTo(map);
      setTimeout(function () { if (hiMarker) { try { map.removeLayer(hiMarker); } catch (e) {} hiMarker = null; } }, 6000);
    }
  }

  // --- query a Nominatim (annulla la precedente, rispetta il rate limit) ---
  function search(q) {
    if (ctrl) { try { ctrl.abort(); } catch (e) {} }
    ctrl = ("AbortController" in window) ? new AbortController() : null;
    var url = ENDPOINT + "?format=jsonv2&limit=6&accept-language=it&q=" + encodeURIComponent(q);
    msg("Cerco…");
    fetch(url, { signal: ctrl ? ctrl.signal : undefined, headers: { "Accept": "application/json" } })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (list) { render(Array.isArray(list) ? list : []); })
      .catch(function (e) { if (e && e.name === "AbortError") return; msg("Ricerca non disponibile, riprova."); });
  }

  function wire() {
    var q = document.getElementById("placeq"); if (!q) return;
    q.addEventListener("input", function () {
      var v = q.value.trim();
      if (timer) clearTimeout(timer);
      if (v.length < MINCHARS) { closeBox(); return; }
      timer = setTimeout(function () { search(v); }, DEBOUNCE);
    });
    q.addEventListener("keydown", function (e) {
      var b = box(); if (!b || !b.classList.contains("open")) return;
      var rows = b.querySelectorAll(".ps-item");
      if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(sel + 1, rows.length - 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(sel - 1, 0); }
      else if (e.key === "Enter") { if (sel >= 0 && items[sel]) { e.preventDefault(); go(items[sel]); } return; }
      else if (e.key === "Escape") { closeBox(); return; }
      else return;
      rows.forEach(function (el2, i) { el2.classList.toggle("sel", i === sel); });
    });
    document.addEventListener("click", function (e) {
      var w = document.getElementById("place-wrap");
      if (w && !w.contains(e.target)) closeBox();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
