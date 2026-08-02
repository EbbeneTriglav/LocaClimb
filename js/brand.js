/* ===========================================================================
   LocaRide - logo e marchio
   ---------------------------------------------------------------------------
   Sostituisce il logo nell'intestazione con la versione coordinata all'icona
   dell'app (due cime + strada arancione) e registra il service worker.

   Perche' via JavaScript invece di modificare l'HTML: il logo sta dentro una
   riga lunghissima di index.html, e sostituirla con un comando da terminale e'
   il tipo di operazione che va storta. Cosi' e' pulito e reversibile: togli il
   <script> e torna il logo di prima.
   =========================================================================== */

function brandSvg(size) {
  var s = size || 34;
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 48 48" aria-hidden="true" style="display:block">'
    + '<defs>'
    + '<linearGradient id="lrBg" x1="0" y1="0" x2="1" y2="1">'
    + '<stop offset="0" stop-color="#1e40af"/><stop offset="1" stop-color="#7c3aed"/></linearGradient>'
    + '</defs>'
    + '<rect x="1" y="1" width="46" height="46" rx="12" fill="url(#lrBg)"/>'
    + '<path d="M17 38 L30 17 L43 38 Z" fill="#94a3b8"/>'
    + '<path d="M4 38 L17 12 L30 38 Z" fill="#e9eef5"/>'
    + '<path d="M17 12 L13.5 19 L15 18 L16.5 20 L18.5 17 L20.5 19 Z" fill="#ffffff"/>'
    + '<path d="M2 32 C 11 26, 15 37, 24 32 C 33 27, 38 36, 46 31" fill="none" stroke="#ffffff" stroke-width="7.5" stroke-linecap="round"/>'
    + '<path d="M2 32 C 11 26, 15 37, 24 32 C 33 27, 38 36, 46 31" fill="none" stroke="#f59e0b" stroke-width="4.6" stroke-linecap="round"/>'
    + '</svg>';
}

function applyBrand() {
  var h1 = document.querySelector('#hdr h1');
  if (!h1) return;
  h1.innerHTML = brandSvg(34)
    + '<span class="wordmark">Loca<b>Ride</b></span>'
    + '<span class="tag">&#x2014; ride like a local</span>';
  h1.setAttribute("title", "Torna alla mappa");
}

/* Registrazione del service worker: e' cio' che rende l'app installabile.
   Percorso relativo, cosi' funziona sia su locaride.app sia in sottocartella. */
function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost") return;
  navigator.serviceWorker.register("sw.js").catch(function (e) {
    console.warn("Service worker non registrato:", e && e.message);
  });
}

(function brandBoot() {
  function go() { applyBrand(); registerSW(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go);
  else go();
})();
