/* ===========================================================================
   LocaRide - riquadro dei risultati di ricerca sempre visibile
   ---------------------------------------------------------------------------
   IL PROBLEMA (introdotto dal foglio di stile dell'iterazione 7)
   Per non far schiacciare i pulsanti su schermo stretto la barra superiore e'
   stata resa scorrevole in orizzontale (`overflow-x:auto`). Effetto collaterale
   delle regole CSS: quando un elemento scorre su un asse, l'altro asse smette
   di essere "visibile" e il contenuto che esce dai bordi viene TAGLIATO. Il
   menu dei risultati, che scende sotto la barra, finiva quindi ritagliato e
   nascosto dietro la mappa.

   LA SOLUZIONE
   Il riquadro viene sganciato dal flusso della barra (position: fixed) e
   posizionato con precisione sotto il campo di ricerca. Cosi' la barra puo'
   continuare a scorrere e i risultati restano sopra tutto il resto.

   Nessuna modifica ai file esistenti: basta togliere il <script> per annullare.
   =========================================================================== */

function srBox() { return document.getElementById("sresults"); }
function srWrap() { return document.getElementById("search-wrap"); }

function srPlace() {
  var box = srBox(), wrap = srWrap();
  if (!box || !wrap) return;
  var r = wrap.getBoundingClientRect();
  var margin = 8;
  var w = r.width, left = r.left;

  // Su schermo stretto il campo e' minuscolo: il riquadro prende quasi tutta la
  // larghezza della finestra, altrimenti i nomi dei passi vanno a capo.
  if (window.innerWidth < 620) {
    w = window.innerWidth - margin * 2;
    left = margin;
  }
  box.style.position = "fixed";
  box.style.top = Math.round(r.bottom + 6) + "px";
  box.style.left = Math.round(left) + "px";
  box.style.width = Math.round(w) + "px";
  box.style.right = "auto";
  box.style.zIndex = "2500";
  box.style.maxHeight = Math.max(160, Math.min(360, window.innerHeight - r.bottom - 28)) + "px";
  box.style.overflowY = "auto";
}

/* Si riposiziona quando: si digita, si apre/chiude, si ridimensiona la finestra,
   si scorre la barra dei pulsanti. */
function srBind() {
  var inp = document.getElementById("search"), box = srBox(), hdr = document.getElementById("hdr");
  if (!inp || !box) return;

  ["input", "focus", "click"].forEach(function (ev) {
    inp.addEventListener(ev, function () { setTimeout(srPlace, 0); });
  });
  window.addEventListener("resize", srPlace);
  window.addEventListener("orientationchange", function () { setTimeout(srPlace, 250); });
  if (hdr) hdr.addEventListener("scroll", srPlace, { passive: true });

  // L'app apre/chiude il riquadro aggiungendo la classe "open": riposizioniamo
  // nel momento esatto in cui compare, non prima.
  if (window.MutationObserver) {
    new MutationObserver(function () {
      if (box.classList.contains("open")) srPlace();
    }).observe(box, { attributes: true, attributeFilter: ["class"] });
  }
  srPlace();
}

(function srBoot() {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", srBind);
  else srBind();
})();
