/* ===========================================================================
   LocaRide - Condivisione e pagina pubblica di un giro
   ---------------------------------------------------------------------------
   - "Condividi" su un giro salvato -> ne pubblica una copia in `shared/{id}`
     e produce un link del tipo  https://locaride.app/?g=ID
   - Chi apre quel link vede il giro sulla mappa SENZA doversi registrare,
     e con un tocco puo' copiarlo nei propri giri (se ha un account).
   - Condivisione via WhatsApp, Telegram, copia link e "condivisione di sistema"
     (su telefono apre il menu nativo: Instagram, Messaggi, Mail...).

   COME E' AGGANCIATO
   Come reviews.js: viene caricato DOPO myrides.js e ridefinisce renderMyRides()
   per aggiungere il pulsante "Condividi". Per annullare l'iterazione basta
   togliere il tag <script> da index.html.

   PRIVACY: un giro condiviso e' PUBBLICO (chiunque abbia il link lo vede).
   Contiene nome del giro, tracciato, tappe e nome pubblico dell'autore.
   =========================================================================== */

var sharedRide = null;        // giro aperto da link (se presente)

/* ------------------------------ utilita' link ------------------------------ */
function shareBaseUrl() {
  return location.origin + location.pathname;      // funziona sia su locaride.app sia su github.io
}
function shareUrlFor(id) { return shareBaseUrl() + "?g=" + encodeURIComponent(id); }

/* --------------------- profilo: pulsante Condividi ------------------------- */
/* Ridefinisce la lista dei giri aggiungendo "Condividi" accanto agli altri. */
function renderMyRides() {
  var dp = document.getElementById("dp"); if (!dp) return;
  var h = mrHeader() + '<div class="dp-body">';
  if (!myRidesCache.length) {
    h += '<p style="color:var(--txt2)">Non hai ancora salvato nessun giro.<br>Crea un percorso e premi <b>&#x1F4BE; Salva giro</b> nel pannello Percorso.</p>';
  } else {
    var tKm = 0, tAsc = 0;
    myRidesCache.forEach(function (r) { tKm += (r.distKm || 0); tAsc += (r.ascent || 0); });
    h += '<div class="rstats"><div>Giri<b>' + myRidesCache.length + '</b></div><div>Totale<b>' + tKm.toFixed(0) + ' km</b></div><div>Dislivello<b>' + tAsc + ' m</b></div></div>';
    myRidesCache.forEach(function (r, i) {
      var d = r.savedAt ? new Date(r.savedAt) : null;
      var ds = d ? ("0" + d.getDate()).slice(-2) + "/" + ("0" + (d.getMonth() + 1)).slice(-2) + "/" + d.getFullYear() : "";
      h += '<div style="border:1px solid var(--bdr);border-radius:12px;padding:11px 13px;margin:9px 0;background:var(--bg)">'
        + '<div style="font-weight:700;margin-bottom:3px">' + esc(r.name || "Giro") + (r.sharedId ? ' <span style="font-size:.7rem;background:#dcfce7;color:#166534;padding:1px 7px;border-radius:20px;vertical-align:middle">pubblico</span>' : '') + '</div>'
        + '<div style="font-size:.8rem;color:var(--txt2);margin-bottom:8px">' + (r.distKm || 0).toFixed(1) + ' km &middot; &#x2197;&#xFE0F; ' + (r.ascent || 0) + ' m &middot; ' + (r.stops ? r.stops.length : 0) + ' tappe &middot; ' + ds + '</div>'
        + '<div style="display:flex;flex-wrap:wrap;gap:6px">'
        + '<button class="rb-btn go" data-act="rideOpen" data-i="' + i + '">Apri</button>'
        + '<button class="rb-btn" style="background:#7c3aed" data-act="rideShare" data-i="' + i + '">&#x1F517; Condividi</button>'
        + '<button class="rb-btn" style="background:#0891b2" data-act="rideDup" data-i="' + i + '">Duplica</button>'
        + '<button class="rb-btn gpx" data-act="rideGpx" data-i="' + i + '">GPX</button>'
        + '<button class="rb-btn" style="background:#0d9488" data-act="rideTcx" data-i="' + i + '">TCX</button>'
        + '<button class="rb-btn rst" data-act="rideDel" data-i="' + i + '">Elimina</button>'
        + '</div></div>';
    });
    h += '<p style="font-size:.76rem;color:var(--txt2);margin-top:10px">&#x1F4A1; Per il <b>GPX con fontanelle e ristori</b>: apri il giro, calcola il meteo del percorso e usa &#x201C;GPX + punti utili&#x201D;.</p>';
  }
  h += '</div>';
  dp.innerHTML = h;
}

/* ------------------------------ pubblicazione ------------------------------ */
function rideShare(i) {
  var r = myRidesCache[+i]; if (!r) return;
  if (!window.FB || !FBUSER) { if (typeof acctOpen === "function") acctOpen(); return; }
  if (r.sharedId) { shareDialog(r.sharedId, r.name, +i); return; }   // gia' pubblicato

  var payload = {
    owner: FBUSER.uid,
    author: FBUSER.displayName || "Ciclista",
    name: r.name || "Giro",
    stops: r.stops || [],
    track: r.track,
    distKm: r.distKm || 0,
    ascent: r.ascent || 0,
    createdAt: Date.now()
  };
  FB.db.collection("shared").add(payload).then(function (ref) {
    r.sharedId = ref.id;
    // memorizza il riferimento anche sul giro personale, per non ripubblicarlo due volte
    FB.db.collection("users").doc(FBUSER.uid).collection("routes").doc(r.id)
      .update({ sharedId: ref.id }).catch(function () {});
    renderMyRides();
    shareDialog(ref.id, r.name, +i);
  }).catch(function (e) { alert("Non riesco a pubblicare il giro: " + (e.message || e)); });
}

/* Finestra con il link e i pulsanti di condivisione. */
function shareDialog(sid, name, idx) {
  var url = shareUrlFor(sid);
  var txt = "Guarda questo giro su LocaRide: " + (name || "");
  var ex = document.getElementById("shareModal"); if (ex) ex.remove();
  var d = document.createElement("div");
  d.id = "shareModal";
  d.style.cssText = "position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px";
  var btn = "display:block;width:100%;margin:6px 0;padding:10px;border:none;border-radius:9px;cursor:pointer;font:inherit;font-weight:600;color:#fff";
  d.innerHTML = '<div style="background:var(--bg2);color:var(--txt);border-radius:14px;padding:18px;width:340px;max-width:100%;font:14px system-ui">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><b>&#x1F517; Condividi il giro</b>'
    + '<span data-act="shareClose" style="cursor:pointer;font-size:20px">&times;</span></div>'
    + '<div style="font-size:.85rem;color:var(--txt2);margin-bottom:8px">' + esc(name || "") + '</div>'
    + '<input id="shareUrl" readonly value="' + esc(url) + '" style="width:100%;padding:8px;border:1px solid var(--bdr);border-radius:8px;background:var(--bg);color:var(--txt);font-size:.8rem;margin-bottom:8px">'
    + '<button style="' + btn + ';background:#2563eb" data-act="shareCopy">&#x1F4CB; Copia link</button>'
    + '<button style="' + btn + ';background:#25D366" data-act="shareWa">WhatsApp</button>'
    + '<button style="' + btn + ';background:#229ED9" data-act="shareTg">Telegram</button>'
    + (navigator.share ? '<button style="' + btn + ';background:#7c3aed" data-act="shareNative">&#x1F4F1; Altre app (Instagram, Mail&#8230;)</button>' : '')
    + '<button style="' + btn + ';background:#ef4444" data-act="shareStop" data-i="' + idx + '">Rendi di nuovo privato</button>'
    + '<div style="font-size:.72rem;color:var(--txt2);margin-top:8px">Chiunque abbia il link puo' + '’' + ' vedere e copiare questo giro.</div>'
    + '</div>';
  document.body.appendChild(d);
  window.__shareUrl = url; window.__shareTxt = txt;
}
function shareClose() { var m = document.getElementById("shareModal"); if (m) m.remove(); }
function shareCopy() {
  var i = document.getElementById("shareUrl"); if (!i) return;
  i.select(); i.setSelectionRange(0, 99999);
  var done = function () { var b = document.querySelector('[data-act="shareCopy"]'); if (b) b.textContent = "✅ Link copiato"; };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(i.value).then(done, function () { document.execCommand("copy"); done(); });
  else { document.execCommand("copy"); done(); }
}
function shareWa() { window.open("https://wa.me/?text=" + encodeURIComponent(window.__shareTxt + " " + window.__shareUrl), "_blank"); }
function shareTg() { window.open("https://t.me/share/url?url=" + encodeURIComponent(window.__shareUrl) + "&text=" + encodeURIComponent(window.__shareTxt), "_blank"); }
function shareNative() {
  if (!navigator.share) return;
  navigator.share({ title: "LocaRide", text: window.__shareTxt, url: window.__shareUrl }).catch(function () {});
}
/* Ritira la condivisione: cancella il documento pubblico. */
function shareStop(i) {
  var r = myRidesCache[+i]; if (!r || !r.sharedId) { shareClose(); return; }
  if (!confirm("Il link smettera' di funzionare. Continuare?")) return;
  FB.db.collection("shared").doc(r.sharedId).delete().then(function () {
    FB.db.collection("users").doc(FBUSER.uid).collection("routes").doc(r.id)
      .update({ sharedId: firebase.firestore.FieldValue.delete() }).catch(function () {});
    r.sharedId = null; shareClose(); renderMyRides();
  }).catch(function (e) { alert("Errore: " + (e.message || e)); });
}

/* ------------------- apertura di un giro condiviso da link ----------------- */
function sharedIdFromUrl() {
  var m = /[?&]g=([^&#]+)/.exec(location.search);
  return m ? decodeURIComponent(m[1]) : null;
}
function loadSharedRide(sid) {
  if (!window.FB) return;
  FB.db.collection("shared").doc(sid).get().then(function (d) {
    if (!d.exists) { alert("Questo giro condiviso non esiste piu'."); return; }
    var r = d.data(); r.id = sid; sharedRide = r;
    var track = strToTrack(r.track);
    if (track.length < 2) return;
    if (typeof rbMode !== "undefined" && !rbMode && typeof toggleRB === "function") toggleRB();
    if (typeof resetRoute === "function") resetRoute();
    rbStops = (r.stops || []).map(function (s) {
      return { type: s.type || "point", name: s.name || "Punto", lat: s.lat, lon: s.lon, elevation: s.elevation == null ? undefined : s.elevation };
    });
    rbTrack = track;
    updateRBList(); drawRouteLine();
    finishRoute(trackDist(rbTrack), trackAscent(rbTrack), null, false);
    showSharedBanner(r);
  }).catch(function (e) { console.error("shared", e); });
}
/* Striscia in alto: chi ha creato il giro + invito a copiarlo. */
function showSharedBanner(r) {
  var ex = document.getElementById("sharedBanner"); if (ex) ex.remove();
  var b = document.createElement("div");
  b.id = "sharedBanner";
  b.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);top:calc(var(--hdr) + 10px);z-index:1200;background:var(--bg2);border:1px solid var(--bdr);border-top:3px solid #7c3aed;border-radius:12px;padding:10px 14px;box-shadow:0 10px 26px rgba(0,0,0,.18);max-width:92vw;font:14px system-ui;color:var(--txt)";
  b.innerHTML = '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">'
    + '<div><div style="font-weight:700">' + esc(r.name || "Giro condiviso") + '</div>'
    + '<div style="font-size:.78rem;color:var(--txt2)">di ' + esc(r.author || "un ciclista") + ' &middot; ' + (r.distKm || 0).toFixed(1) + ' km &middot; &#x2197;&#xFE0F; ' + (r.ascent || 0) + ' m</div></div>'
    + '<button class="rb-btn go" data-act="sharedCopyMine">&#x2B07;&#xFE0F; Copia nei miei giri</button>'
    + '<span data-act="sharedBannerClose" style="cursor:pointer;color:var(--txt2);font-size:18px">&times;</span></div>';
  document.body.appendChild(b);
}
function sharedBannerClose() { var b = document.getElementById("sharedBanner"); if (b) b.remove(); }

/* Copia il giro condiviso nei propri giri (richiede account). */
function sharedCopyMine() {
  if (!sharedRide) return;
  if (!window.FB || !FBUSER) { alert("Accedi (o registrati) per salvare questo giro nel tuo profilo."); if (typeof acctOpen === "function") acctOpen(); return; }
  FB.db.collection("users").doc(FBUSER.uid).collection("routes").add({
    name: (sharedRide.name || "Giro") + " (da " + (sharedRide.author || "LocaRide") + ")",
    stops: sharedRide.stops || [], track: sharedRide.track,
    distKm: sharedRide.distKm || 0, ascent: sharedRide.ascent || 0, savedAt: Date.now()
  }).then(function () {
    var b = document.getElementById("sharedBanner");
    if (b) b.innerHTML = '<div style="font-weight:700;color:#16a34a">&#x2705; Giro salvato nei tuoi giri</div>';
    setTimeout(sharedBannerClose, 2500);
  }).catch(function (e) { alert("Errore: " + (e.message || e)); });
}

/* ---------------------------- avvio automatico ----------------------------- */
/* Se l'indirizzo contiene ?g=ID, aspetta che mappa e Firebase siano pronti e
   carica il giro condiviso. Nessun login richiesto per la sola visualizzazione. */
(function shareBoot() {
  var sid = sharedIdFromUrl(); if (!sid) return;
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    var ready = (typeof map !== "undefined" && map) && window.FB && typeof strToTrack === "function";
    if (ready) { clearInterval(timer); loadSharedRide(sid); }
    else if (tries > 60) { clearInterval(timer); }      // ~18 s poi rinuncia
  }, 300);
})();
