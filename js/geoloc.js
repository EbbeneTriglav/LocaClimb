/* ===========================================================================
   LocaRide - "dove sono" e cosa ho intorno
   ---------------------------------------------------------------------------
   Pulsante di posizione nella barra comandi della mappa, pensato per l'uso in
   strada: sei in giro, hai finito l'acqua, apri l'app e vuoi sapere dov'e' la
   fontanella piu' vicina.

   TRE STATI, come nelle app di navigazione:
     spento -> INSEGUIMENTO (la mappa segue la tua posizione)
            -> LIBERO (il puntino resta aggiornato, la mappa la muovi tu)
            -> spento
   Trascinando la mappa durante l'inseguimento si passa da soli a "libero":
   e' il comportamento che l'utente si aspetta, senza dover premere niente.

   ALLA PRIMA POSIZIONE accende le fontanelle e dice quanto dista la piu' vicina.
   E' esattamente il motivo per cui uno tira fuori il telefono a meta' salita.

   PRIVACY: la posizione resta nel browser. Non viene salvata ne' inviata a
   nessuno: serve solo a centrare la mappa e a misurare una distanza.

   Nessuna modifica ai file esistenti: il pulsante viene creato e inserito nella
   barra comandi. Togliendo il <script> sparisce tutto.
   =========================================================================== */

var GEO_STATE = 0;            // 0 spento, 1 inseguimento, 2 libero
var geoWatch = null;
var geoMarker = null, geoCircle = null;
var geoLast = null;           // {lat, lon, acc}
var geoDidFountains = false;  // le fontanelle si accendono da sole una volta sola

(function geoStyle() {
  var css = ''
    + '#geoBtn.on{background:var(--ac)!important;color:#fff!important;border-color:var(--ac)!important}'
    + '#geoBtn.free{background:#0891b2!important;color:#fff!important;border-color:#0891b2!important}'
    + '#geoBtn.wait .bi{animation:geospin 1s linear infinite;display:inline-block}'
    + '@keyframes geospin{to{transform:rotate(360deg)}}'
    + '.geo-dot{position:relative}'
    + '.geo-dot .gd{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:16px;height:16px;'
    + 'border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.5)}'
    + '.geo-dot .gr{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:16px;height:16px;'
    + 'border-radius:50%;background:rgba(37,99,235,.35);animation:geopulse 1.8s ease-out infinite}'
    + '@keyframes geopulse{0%{width:16px;height:16px;opacity:.85}100%{width:56px;height:56px;opacity:0}}';
  var s = document.createElement("style");
  s.id = "geo-style";
  s.textContent = css;
  document.head.appendChild(s);
})();

/* --------------------------------- pulsante -------------------------------- */
function geoBuildButton() {
  if (document.getElementById("geoBtn")) return true;
  var host = document.getElementById("mapctl");
  if (!host) return false;
  var b = document.createElement("button");
  b.id = "geoBtn";
  b.className = "btn";
  b.title = "Dove sono";
  b.innerHTML = '<span class="bi">&#x25CE;</span><span class="bl">Posizione</span>';
  b.addEventListener("click", toggleGeo);
  host.insertBefore(b, host.firstChild);   // in cima: e' il comando piu' usato in strada
  if (typeof lrTranslate === "function") lrTranslate(b);
  return true;
}

function geoSetBtn(cls, spin) {
  var b = document.getElementById("geoBtn"); if (!b) return;
  b.classList.remove("on", "free", "wait");
  if (cls) b.classList.add(cls);
  if (spin) b.classList.add("wait");
  b.title = GEO_STATE === 1 ? "La mappa segue la tua posizione" : GEO_STATE === 2 ? "Posizione attiva (mappa libera)" : "Dove sono";
}

/* ------------------------------- ciclo stati -------------------------------- */
function toggleGeo() {
  if (!navigator.geolocation) {
    alert("Il tuo browser non permette la geolocalizzazione.");
    return;
  }
  if (GEO_STATE === 0) { GEO_STATE = 1; geoStart(); }
  else if (GEO_STATE === 1) { GEO_STATE = 2; geoSetBtn("free", false); geoToast("&#x1F4CD; Posizione attiva. La mappa ora la muovi tu."); }
  else { geoStop(); }
}

function geoStart() {
  geoSetBtn("on", true);
  geoToast("&#x1F4CD; Cerco la tua posizione&#8230;");
  var opts = { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 };

  navigator.geolocation.getCurrentPosition(function (pos) {
    geoOnPos(pos, true);
    // aggiornamento continuo: in bici ci si sposta
    if (geoWatch == null) {
      geoWatch = navigator.geolocation.watchPosition(function (p) { geoOnPos(p, false); },
        function () { /* un errore momentaneo non spegne nulla */ }, opts);
    }
  }, geoOnErr, opts);
}

function geoStop() {
  GEO_STATE = 0;
  if (geoWatch != null && navigator.geolocation) { navigator.geolocation.clearWatch(geoWatch); geoWatch = null; }
  if (geoMarker && map) { map.removeLayer(geoMarker); geoMarker = null; }
  if (geoCircle && map) { map.removeLayer(geoCircle); geoCircle = null; }
  geoSetBtn(null, false);
  if (typeof hideRS === "function") hideRS();
}

function geoOnErr(err) {
  GEO_STATE = 0; geoSetBtn(null, false);
  var m = "Posizione non disponibile.";
  if (err && err.code === 1) m = "Permesso negato: per usare questa funzione consenti l'accesso alla posizione nelle impostazioni del browser.";
  else if (err && err.code === 2) m = "Segnale GPS assente: prova all'aperto.";
  else if (err && err.code === 3) m = "Ricerca troppo lenta: riprova.";
  geoToast("&#x26A0;&#xFE0F; " + m, 6000);
}

/* ------------------------------- posizione --------------------------------- */
function geoOnPos(pos, first) {
  if (!map || GEO_STATE === 0) return;
  var la = pos.coords.latitude, lo = pos.coords.longitude, acc = pos.coords.accuracy || 0;
  geoLast = { lat: la, lon: lo, acc: acc };

  if (!geoMarker) {
    var ic = L.divIcon({ className: "geo-dot", html: '<div class="gr"></div><div class="gd"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
    geoMarker = L.marker([la, lo], { icon: ic, zIndexOffset: 1000, interactive: false }).addTo(map);
  } else geoMarker.setLatLng([la, lo]);

  // cerchio di precisione: onesto su quanto il dato e' affidabile
  if (acc > 25) {
    if (!geoCircle) geoCircle = L.circle([la, lo], { radius: acc, color: "#2563eb", weight: 1, opacity: .5, fillColor: "#2563eb", fillOpacity: .08, interactive: false }).addTo(map);
    else { geoCircle.setLatLng([la, lo]); geoCircle.setRadius(acc); }
  } else if (geoCircle) { map.removeLayer(geoCircle); geoCircle = null; }

  if (GEO_STATE === 1) {
    var z = Math.max(map.getZoom(), 15);
    map.setView([la, lo], z, { animate: true });
  }

  if (first) {
    geoSetBtn("on", false);
    geoAfterFirstFix(la, lo, acc);
    // se l'utente trascina la mappa mentre lo stiamo inseguendo, smettiamo:
    // vuole guardare altrove, non combattere con la mappa.
    map.once("dragstart", function () {
      if (GEO_STATE === 1) { GEO_STATE = 2; geoSetBtn("free", false); }
    });
  }
}

/* Al primo aggancio: accende le fontanelle (una volta sola) e dice quanto dista
   la piu' vicina, che e' il motivo per cui si apre l'app in mezzo a una salita. */
function geoAfterFirstFix(la, lo, acc) {
  var accTxt = acc ? " (precisione ~" + Math.round(acc) + " m)" : "";
  if (typeof fountOn !== "undefined" && !fountOn && typeof toggleFount === "function" && !geoDidFountains) {
    geoDidFountains = true;
    toggleFount();
    geoToast("&#x1F4CD; Ci sei" + accTxt + " &middot; carico le fontanelle qui intorno&#8230;");
    setTimeout(function () { geoNearestWater(la, lo); }, 2500);
    setTimeout(function () { geoNearestWater(la, lo); }, 6000);   // secondo tentativo: Overpass a volte tarda
  } else {
    geoToast("&#x1F4CD; Ci sei" + accTxt);
    setTimeout(function () { geoNearestWater(la, lo); }, 1200);
  }
}

/* Fontanella piu' vicina tra quelle gia' disegnate sulla mappa. */
function geoNearestWater(la, lo) {
  if (GEO_STATE === 0) return;
  var best = null, bd = 1e9;
  function scan(layer) {
    if (!layer || !layer.getLayers) return;
    layer.getLayers().forEach(function (m) {
      if (!m.getLatLng) return;
      var ll = m.getLatLng(), d = hav(la, lo, ll.lat, ll.lng);
      if (d < bd) { bd = d; best = ll; }
    });
  }
  if (typeof fountLayer !== "undefined") scan(fountLayer);
  if (typeof routeWaterLayer !== "undefined") scan(routeWaterLayer);
  if (!best) return;
  var m = bd * 1000;
  var dir = (typeof compass === "function") ? compass(la, lo, best.lat, best.lng) : "";
  geoToast("&#x1F4A7; Fontanella piu' vicina: <b>" + (m < 950 ? Math.round(m) + " m" : bd.toFixed(1) + " km") + "</b>"
    + (dir ? " verso " + dir : "") + " &middot; tocca il puntino blu per i dettagli", 7000);
}

/* Messaggio temporaneo: riusa la barra gia' presente nell'app. */
function geoToast(html, ms) {
  if (typeof showRS !== "function") return;
  showRS(html);
  clearTimeout(window.__geoToast);
  window.__geoToast = setTimeout(function () { if (typeof hideRS === "function") hideRS(); }, ms || 4000);
}

/* --------------------------------- avvio ----------------------------------- */
(function geoBoot() {
  var tries = 0;
  var t = setInterval(function () {
    tries++;
    // aspetta che ui2.js abbia creato la barra comandi
    if (geoBuildButton() || tries > 40) clearInterval(t);
  }, 250);
})();
