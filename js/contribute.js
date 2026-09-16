/* ============================================================================
 * contribute.js - proposte di salite dagli utenti, revisione admin, livelli.
 * ----------------------------------------------------------------------------
 * Flusso:
 *   1. il contributore disegna la salita col route builder (rbTrack e' gia' li',
 *      con [lat, lon, quota] per punto) e apre "Proponi salita";
 *   2. la proposta va in Firestore, collection "proposals", stato "pending";
 *   3. l'admin la vede in coda, la controlla sulla mappa e approva o rifiuta;
 *   4. appena approvata e' visibile a tutti (l'app legge le approvate),
 *      e scripts/import_proposals.mjs la travasa in data/manual_overrides.json
 *      cosi' entra nella pipeline e riceve quota, ombra, meteo come le altre.
 *
 * NOTA IMPORTANTE: Firestore non supporta array annidati, quindi il tracciato
 * NON puo' essere [[lat,lon,ele],...]. Lo salviamo piatto [lat,lon,ele,lat,...]
 * ricampionato a 800 punti: basta per disegnarlo, e i numeri veri li ricalcola
 * comunque la pipeline dal DEM.
 *
 * Modulo autonomo: si aggancia ai menu esistenti dall'esterno, non modifica
 * uikit.js ne' panel.js. Per rimuoverlo basta togliere il suo <script>.
 * Dipende da: FB / FBUSER (auth.js), rbTrack / rbStops (routebuilder.js). ASCII.
 * ==========================================================================*/

var LRC = {
  MAXPTS: 800,              // punti massimi salvati per versante
  MINKM: 1.5,               // sotto questa lunghezza non e' una salita
  MINGAIN: 100,             // metri di dislivello minimi
  /* soglie di livello: contributi ACCETTATI, non proposte inviate. Un passo vale
     1, il secondo versante dello stesso passo vale 0.5 (lavoro vero ma minore). */
  LEVELS: [
    { min: 0, it: "Foresto", en: "Out-of-Towner", ic: "&#x1F9F3;" },
    { min: 1, it: "Turista del pedale", en: "Pedal Tourist", ic: "&#x1F4F8;" },
    { min: 5, it: "Cane Sciolto", en: "Stray Dog", ic: "&#x1F415;" },
    { min: 15, it: "Local Rider", en: "Local Rider", ic: "&#x1F3C5;" }
  ],
  me: null                  // { canPropose, role } dell'utente corrente
};

function lrcT(it, en) { try { return (window.gref && gref("LR_LANG") === "en") || window.LR_LANG === "en" ? en : it; } catch (e) { return it; } }
function lrcEl(t, a, h) { var e = document.createElement(t); if (a) for (var k in a) e.setAttribute(k, a[k]); if (h != null) e.innerHTML = h; return e; }
function lrcId(i) { return document.getElementById(i); }
function lrcUser() { return (typeof FBUSER !== "undefined" && FBUSER) ? FBUSER : null; }
function lrcDb() { return (typeof FB !== "undefined" && FB && FB.db) ? FB.db : null; }
function lrcEsc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

/* ---------------------------------------------------------------- stile */
function lrcStyle() {
  if (lrcId("lrc-style")) return;
  var css =
    "#lrc-mask{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:100003;display:none;align-items:center;justify-content:center;padding:12px}#lrc-mask.open{display:flex}" +
    ".lrc-dlg{background:var(--bg2);color:var(--txt);border-radius:16px;padding:20px;width:440px;max-width:96vw;max-height:88vh;overflow:auto;box-shadow:0 20px 50px rgba(0,0,0,.3)}" +
    ".lrc-dlg h3{margin:0 0 3px;font-size:1.05rem}.lrc-sub{color:var(--txt2);font-size:.83rem;margin:0 0 14px}" +
    ".lrc-dlg label{display:block;font-size:.82rem;margin:11px 0 3px;color:var(--txt2)}" +
    ".lrc-dlg input,.lrc-dlg textarea,.lrc-dlg select{width:100%;padding:8px;border-radius:8px;border:1px solid var(--bdr);background:var(--bg);color:var(--txt);font:inherit;box-sizing:border-box}" +
    ".lrc-dlg textarea{min-height:64px;resize:vertical}" +
    ".lrc-facts{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:12px 0;padding:10px;background:var(--bg);border-radius:10px;font-size:.82rem}" +
    ".lrc-facts b{display:block;font-size:1rem}" +
    ".lrc-btns{display:flex;gap:8px;margin-top:18px}.lrc-btns button{flex:1;padding:10px;border-radius:9px;border:1px solid var(--bdr);background:var(--bg);color:var(--txt);font-weight:600;cursor:pointer}" +
    ".lrc-go{background:var(--ac)!important;color:#fff!important;border-color:var(--ac)!important}" +
    ".lrc-msg{margin-top:10px;font-size:.84rem}.lrc-err{color:var(--err)}.lrc-ok{color:#16a34a}" +
    ".lrc-item{border:1px solid var(--bdr);border-radius:11px;padding:10px 12px;margin-bottom:8px}" +
    ".lrc-item h4{margin:0 0 2px;font-size:.93rem}.lrc-meta{color:var(--txt2);font-size:.76rem}" +
    ".lrc-st{float:right;font-size:.7rem;font-weight:700;padding:2px 8px;border-radius:20px}" +
    ".lrc-st.pending{background:#fef3c7;color:#92400e}.lrc-st.approved{background:#dcfce7;color:#166534}.lrc-st.rejected{background:#fee2e2;color:#991b1b}" +
    ".lrc-badge{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:20px;background:var(--bg);border:1px solid var(--bdr);font-weight:700;font-size:.85rem}" +
    ".lrc-bar{height:6px;border-radius:3px;background:var(--bdr);margin:8px 0 4px;overflow:hidden}.lrc-bar i{display:block;height:100%;background:var(--ac)}" +
    ".lrc-empty{color:var(--txt2);font-size:.86rem;padding:8px 0}";
  document.head.appendChild(lrcEl("style", { id: "lrc-style" }, css));
}

function lrcModal(html) {
  lrcStyle();
  var m = lrcId("lrc-mask");
  if (!m) {
    m = lrcEl("div", { id: "lrc-mask" });
    m.addEventListener("click", function (e) { if (e.target === m) lrcClose(); });
    document.body.appendChild(m);
  }
  m.innerHTML = '<div class="lrc-dlg">' + html + "</div>";
  m.classList.add("open");
  return m;
}
function lrcClose() { var m = lrcId("lrc-mask"); if (m) m.classList.remove("open"); }

/* ------------------------------------------------------- permessi utente */
/* canPropose e role stanno sul documento users/{uid}: li abiliti tu a mano dalla
   console Firebase finche' siamo in beta (scelta: solo tester autorizzati). */
function lrcWhoAmI() {
  var u = lrcUser(), db = lrcDb();
  if (!u || !db) { LRC.me = null; return Promise.resolve(null); }
  if (LRC.me && LRC.me.uid === u.uid) return Promise.resolve(LRC.me);
  return db.collection("users").doc(u.uid).get().then(function (d) {
    var o = d.exists ? d.data() : {};
    LRC.me = { uid: u.uid, canPropose: !!o.canPropose, admin: o.role === "admin", pts: o.contribPoints || 0 };
    return LRC.me;
  }).catch(function () { LRC.me = { uid: u.uid, canPropose: false, admin: false, pts: 0 }; return LRC.me; });
}

/* ----------------------------------------------------- tracciato -> dati */
function lrcFlatTrack(tr) {
  var n = tr.length, step = n > LRC.MAXPTS ? (n - 1) / (LRC.MAXPTS - 1) : 1, out = [];
  for (var i = 0; i < (step > 1 ? LRC.MAXPTS : n); i++) {
    var p = tr[Math.round(i * step)] || tr[n - 1];
    out.push(+(+p[0]).toFixed(5), +(+p[1]).toFixed(5), p[2] == null ? 0 : Math.round(p[2]));
  }
  return out;
}
/* misure dal tracciato disegnato, riusando le funzioni del route builder */
function lrcFacts(tr) {
  var km = (typeof trackDist === "function") ? trackDist(tr) : 0;
  var gain = (typeof trackAscent === "function") ? trackAscent(tr) : 0;
  var a = tr[0], b = tr[tr.length - 1];
  return {
    km: km, gain: gain,
    startLat: +(+a[0]).toFixed(5), startLon: +(+a[1]).toFixed(5),
    endLat: +(+b[0]).toFixed(5), endLon: +(+b[1]).toFixed(5),
    startElevation: a[2] == null ? null : Math.round(a[2]),
    endElevation: b[2] == null ? null : Math.round(b[2]),
    avgGradient: km > 0 ? +(gain / (km * 10)).toFixed(1) : 0
  };
}

/* ------------------------------------------------------------ proponi */
function lrcPropose() {
  var u = lrcUser();
  if (!u) { alert(lrcT("Accedi per proporre una salita.", "Sign in to suggest a climb.")); return; }
  var tr = (typeof rbTrack !== "undefined" && rbTrack) ? rbTrack : null;
  if (!tr || tr.length < 8) {
    lrcModal("<h3>" + lrcT("Proponi una salita", "Suggest a climb") + "</h3>"
      + '<p class="lrc-sub">' + lrcT(
        "Serve prima il tracciato. Apri <b>Crea giro</b>, clicca sulla mappa dove la salita comincia, poi sulla cima, e premi <b>Calcola percorso</b>. A quel punto trovi <b>Proponi salita</b> li' dentro, sotto Salva giro.",
        "The track comes first. Open <b>Plan a ride</b>, click where the climb starts, then the summit, and hit <b>Calculate route</b>. You'll then find <b>Suggest climb</b> right there, under Save ride.") + "</p>"
      + '<div class="lrc-btns"><button onclick="lrcClose()">' + lrcT("Chiudi", "Close") + "</button>"
      + '<button class="lrc-go" onclick="lrcClose();var b=document.getElementById(\'rbb\');if(b)b.click();">' + lrcT("Apri Crea giro", "Open planner") + "</button></div>");
    return;
  }
  var f = lrcFacts(tr);
  if (f.km < LRC.MINKM || f.gain < LRC.MINGAIN) {
    alert(lrcT("Tracciato troppo corto: servono almeno " + LRC.MINKM + " km e " + LRC.MINGAIN + " m di dislivello.",
      "Track too short: at least " + LRC.MINKM + " km and " + LRC.MINGAIN + " m of gain."));
    return;
  }
  lrcWhoAmI().then(function (me) {
    if (!me || !me.canPropose) {
      lrcModal("<h3>" + lrcT("Proposte su invito", "Invite-only") + "</h3>"
        + '<p class="lrc-sub">' + lrcT(
          "In beta le proposte sono aperte ai soli tester autorizzati. Scrivici se vuoi partecipare: hai gia' l'account, serve solo l'abilitazione.",
          "During beta, suggestions are open to approved testers only. Get in touch if you want in: you have the account, you just need the flag.") + "</p>"
        + '<div class="lrc-btns"><button onclick="lrcClose()">' + lrcT("Ho capito", "Got it") + "</button></div>");
      return;
    }
    lrcModal("<h3>" + lrcT("Proponi una salita", "Suggest a climb") + "</h3>"
      + '<p class="lrc-sub">' + lrcT("Il tracciato e' quello che hai appena disegnato. Pendenze e quote le ricalcoliamo noi.",
        "The track is the one you just drew. We recompute gradients and elevations.") + "</p>"
      + '<div class="lrc-facts">'
      + "<div>" + lrcT("Distanza", "Distance") + "<b>" + f.km.toFixed(1).replace(".", ",") + " km</b></div>"
      + "<div>" + lrcT("Dislivello", "Elevation gain") + "<b>" + f.gain + " m</b></div>"
      + "<div>" + lrcT("Pendenza media", "Avg gradient") + "<b>" + String(f.avgGradient).replace(".", ",") + "%</b></div>"
      + "<div>" + lrcT("Punti", "Points") + "<b>" + tr.length + "</b></div></div>"
      + "<label>" + lrcT("Nome della salita", "Climb name") + "</label>"
      + '<input id="lrc-name" maxlength="70" placeholder="' + lrcT("es. Monte Nerone", "e.g. Monte Nerone") + '">'
      + "<label>" + lrcT("Da dove si sale", "Which side") + "</label>"
      + '<input id="lrc-side" maxlength="50" placeholder="' + lrcT("es. Da Piobbico", "e.g. From Piobbico") + '">'
      + "<label>" + lrcT("Note per il revisore (facoltative)", "Notes for the reviewer (optional)") + "</label>"
      + '<textarea id="lrc-note" maxlength="400" placeholder="' + lrcT("fondo, traffico, tratti al 15%, chiusure...", "surface, traffic, 15% ramps, closures...") + '"></textarea>'
      + '<div class="lrc-btns"><button onclick="lrcClose()">' + lrcT("Annulla", "Cancel") + "</button>"
      + '<button class="lrc-go" id="lrc-send">' + lrcT("Invia proposta", "Send") + "</button></div>"
      + '<div class="lrc-msg" id="lrc-msg"></div>');
    lrcId("lrc-send").addEventListener("click", function () { lrcSubmit(tr, f); });
  });
}

function lrcSubmit(tr, f) {
  var name = (lrcId("lrc-name").value || "").trim();
  var side = (lrcId("lrc-side").value || "").trim();
  var note = (lrcId("lrc-note").value || "").trim();
  var msg = lrcId("lrc-msg");
  if (name.length < 3) { msg.className = "lrc-msg lrc-err"; msg.textContent = lrcT("Manca il nome della salita.", "The climb name is missing."); return; }
  var u = lrcUser(), db = lrcDb();
  if (!u || !db) return;
  var btn = lrcId("lrc-send"); btn.disabled = true;
  msg.className = "lrc-msg"; msg.textContent = lrcT("Invio...", "Sending...");
  db.collection("proposals").add({
    uid: u.uid,
    author: u.displayName || (u.email || "").split("@")[0] || "anonimo",
    name: name,
    side: side || lrcT("Versante unico", "Single side"),
    note: note,
    status: "pending",
    lat: f.endLat, lon: f.endLon,          // la cima: serve per il marker
    elevation: f.endElevation,
    km: +f.km.toFixed(2), gain: f.gain, avgGradient: f.avgGradient,
    startLat: f.startLat, startLon: f.startLon,
    startElevation: f.startElevation, endElevation: f.endElevation,
    flat: lrcFlatTrack(tr),                // [lat,lon,ele, lat,lon,ele, ...]
    createdAt: Date.now()
  }).then(function () {
    msg.className = "lrc-msg lrc-ok";
    msg.innerHTML = lrcT("Proposta inviata. La trovi nel tuo profilo, sotto <b>Le mie proposte</b>.",
      "Sent. You'll find it in your profile under <b>My suggestions</b>.");
    setTimeout(lrcClose, 2200);
  }).catch(function (e) {
    btn.disabled = false;
    msg.className = "lrc-msg lrc-err";
    msg.textContent = lrcT("Errore: ", "Error: ") + (e && e.message ? e.message : e);
  });
}

/* ------------------------------------------------------ le mie proposte */
function lrcLevelOf(pts) {
  var lv = LRC.LEVELS[0];
  for (var i = 0; i < LRC.LEVELS.length; i++) if (pts >= LRC.LEVELS[i].min) lv = LRC.LEVELS[i];
  return lv;
}
function lrcNextLevel(pts) {
  for (var i = 0; i < LRC.LEVELS.length; i++) if (LRC.LEVELS[i].min > pts) return LRC.LEVELS[i];
  return null;
}
function lrcBadgeHTML(pts) {
  var lv = lrcLevelOf(pts), nx = lrcNextLevel(pts);
  var h = '<div class="lrc-badge">' + lv.ic + " " + lrcT(lv.it, lv.en) + "</div>";
  if (nx) {
    var prev = lv.min, span = nx.min - prev, done = Math.max(0, Math.min(1, (pts - prev) / (span || 1)));
    h += '<div class="lrc-bar"><i style="width:' + Math.round(done * 100) + '%"></i></div>';
    h += '<div class="lrc-meta">' + lrcT("Ancora " + (nx.min - pts) + " per diventare ", (nx.min - pts) + " more to reach ") + "<b>" + lrcT(nx.it, nx.en) + "</b></div>";
  } else {
    h += '<div class="lrc-meta">' + lrcT("Livello massimo. Grazie.", "Top level. Thank you.") + "</div>";
  }
  return h;
}

function lrcMine() {
  var u = lrcUser(), db = lrcDb();
  if (!u || !db) { alert(lrcT("Accedi per vedere le tue proposte.", "Sign in to see your suggestions.")); return; }
  lrcModal("<h3>" + lrcT("Le mie proposte", "My suggestions") + '</h3><div id="lrc-list" class="lrc-sub">' + lrcT("Carico...", "Loading...") + "</div>"
    + '<div class="lrc-btns"><button onclick="lrcClose()">' + lrcT("Chiudi", "Close") + "</button></div>");
  db.collection("proposals").where("uid", "==", u.uid).limit(100).get().then(function (qs) {
    var rows = [];
    qs.forEach(function (d) { rows.push(Object.assign({ id: d.id }, d.data())); });
    rows.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    var ok = 0;
    rows.forEach(function (r) { if (r.status === "approved") ok += r.secondSide ? 0.5 : 1; });
    var h = lrcBadgeHTML(ok) + '<div style="margin-top:14px"></div>';
    if (!rows.length) h += '<div class="lrc-empty">' + lrcT("Nessuna proposta ancora. Disegna una salita che manca e mandacela.", "Nothing yet. Draw a missing climb and send it over.") + "</div>";
    rows.forEach(function (r) {
      var st = r.status === "approved" ? lrcT("Pubblicata", "Published") : r.status === "rejected" ? lrcT("Non accolta", "Declined") : lrcT("In revisione", "Under review");
      h += '<div class="lrc-item"><span class="lrc-st ' + r.status + '">' + st + "</span>"
        + "<h4>" + lrcEsc(r.name) + "</h4>"
        + '<div class="lrc-meta">' + lrcEsc(r.side) + " &middot; " + (r.km || 0) + " km &middot; " + (r.gain || 0) + " m"
        + (r.reviewNote ? "<br>" + lrcT("Nota: ", "Note: ") + lrcEsc(r.reviewNote) : "") + "</div>";
      /* finche' e' in revisione si puo' correggere o ritirare: dopo l'approvazione
         il contenuto e' congelato, altrimenti si potrebbe cambiare cio' che e'
         gia' stato pubblicato. Il tracciato non si modifica a mano: si ritira e
         si ridisegna, che e' piu' rapido di qualsiasi editor. */
      if (r.status === "pending") {
        h += '<div class="lrc-btns" style="margin-top:9px">'
          + '<button onclick="lrcEdit(\'' + r.id + '\')">' + lrcT("Modifica", "Edit") + "</button>"
          + '<button onclick="lrcWithdraw(\'' + r.id + '\')">' + lrcT("Ritira", "Withdraw") + "</button></div>";
      }
      h += "</div>";
    });
    lrcId("lrc-list").className = "";
    lrcId("lrc-list").innerHTML = h;
  }).catch(function (e) {
    lrcId("lrc-list").innerHTML = '<span class="lrc-err">' + lrcEsc(e.message || e) + "</span>";
  });
}

/* Correzione dei dati testuali di una proposta ancora in attesa. Il tracciato
   resta quello: per cambiarlo si ritira e si ridisegna. */
function lrcEdit(id) {
  var db = lrcDb();
  if (!db) return;
  db.collection("proposals").doc(id).get().then(function (d) {
    if (!d.exists) return;
    var r = d.data();
    var u = lrcUser();
    var back = (u && r.uid === u.uid) ? lrcMine : lrcQueue;   // dove torno dopo
    lrcModal("<h3>" + lrcT("Correggi la proposta", "Fix your suggestion") + "</h3>"
      + '<p class="lrc-sub">' + lrcT("Il tracciato non si tocca: se e' quello sbagliato, ritira la proposta e ridisegnala.",
        "The track stays as is: if that's what's wrong, withdraw and draw it again.") + "</p>"
      + "<label>" + lrcT("Nome della salita", "Climb name") + "</label>"
      + '<input id="lrc-ename" maxlength="70" value="' + lrcEsc(r.name) + '">'
      + "<label>" + lrcT("Da dove si sale", "Which side") + "</label>"
      + '<input id="lrc-eside" maxlength="50" value="' + lrcEsc(r.side) + '">'
      + "<label>" + lrcT("Note per il revisore", "Notes for the reviewer") + "</label>"
      + '<textarea id="lrc-enote" maxlength="400">' + lrcEsc(r.note || "") + "</textarea>"
      + '<div class="lrc-btns"><button id="lrc-eback">' + lrcT("Annulla", "Cancel") + "</button>"
      + '<button class="lrc-go" id="lrc-esave">' + lrcT("Salva", "Save") + "</button></div>"
      + '<div class="lrc-msg" id="lrc-msg"></div>');
    lrcId("lrc-eback").addEventListener("click", back);
    lrcId("lrc-esave").addEventListener("click", function () {
      var name = (lrcId("lrc-ename").value || "").trim();
      var msg = lrcId("lrc-msg");
      if (name.length < 3) { msg.className = "lrc-msg lrc-err"; msg.textContent = lrcT("Il nome e' troppo corto.", "Name too short."); return; }
      db.collection("proposals").doc(id).update({
        name: name,
        side: (lrcId("lrc-eside").value || "").trim() || r.side,
        note: (lrcId("lrc-enote").value || "").trim(),
        editedAt: Date.now()
      }).then(back).catch(function (e) {
        msg.className = "lrc-msg lrc-err";
        msg.textContent = lrcT("Errore: ", "Error: ") + (e.message || e);
      });
    });
  });
}

function lrcWithdraw(id) {
  var db = lrcDb();
  if (!db) return;
  if (!confirm(lrcT("Ritiro la proposta? Potrai ridisegnarla e rimandarla.",
    "Withdraw this suggestion? You can draw it again and resend."))) return;
  db.collection("proposals").doc(id).delete()
    .then(lrcMine)
    .catch(function (e) { alert(lrcT("Errore: ", "Error: ") + (e.message || e)); });
}

/* -------------------------------------------------------- coda di revisione */
function lrcQueue() {
  var db = lrcDb();
  if (!db) return;
  lrcWhoAmI().then(function (me) {
    if (!me || !me.admin) { alert(lrcT("Solo per l'amministratore.", "Admins only.")); return; }
    lrcModal("<h3>" + lrcT("Proposte da rivedere", "Review queue") + '</h3><div id="lrc-list" class="lrc-sub">' + lrcT("Carico...", "Loading...") + "</div>"
      + '<div class="lrc-btns"><button onclick="lrcClose()">' + lrcT("Chiudi", "Close") + "</button></div>");
    db.collection("proposals").where("status", "==", "pending").limit(50).get().then(function (qs) {
      var rows = [];
      qs.forEach(function (d) { rows.push(Object.assign({ id: d.id }, d.data())); });
      rows.sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
      var h = "";
      if (!rows.length) h = '<div class="lrc-empty">' + lrcT("Coda vuota.", "Queue is empty.") + "</div>";
      rows.forEach(function (r) {
        h += '<div class="lrc-item"><h4>' + lrcEsc(r.name) + "</h4>"
          + '<div class="lrc-meta">' + lrcEsc(r.side) + " &middot; " + (r.km || 0) + " km &middot; " + (r.gain || 0) + " m &middot; "
          + (r.avgGradient || 0) + "% &middot; " + lrcT("da ", "by ") + lrcEsc(r.author)
          + (r.note ? "<br><i>" + lrcEsc(r.note) + "</i>" : "") + "</div>"
          + '<div class="lrc-btns" style="margin-top:9px">'
          + '<button onclick="lrcShow(\'' + r.id + '\')">' + lrcT("Vedi", "Show") + "</button>"
          + '<button onclick="lrcEdit(\'' + r.id + '\')">' + lrcT("Correggi", "Fix") + "</button>"
          + '<button onclick="lrcReject(\'' + r.id + '\')">' + lrcT("Rifiuta", "Reject") + "</button>"
          + '<button class="lrc-go" onclick="lrcApprove(\'' + r.id + '\')">' + lrcT("Approva", "Approve") + "</button>"
          + "</div></div>";
      });
      lrcId("lrc-list").className = "";
      lrcId("lrc-list").innerHTML = h;
    });
  });
}

/* disegna la proposta sulla mappa per controllarla prima di decidere */
var lrcPreview = null;
function lrcShow(id) {
  var db = lrcDb();
  if (!db || typeof L === "undefined" || typeof map === "undefined") return;
  db.collection("proposals").doc(id).get().then(function (d) {
    if (!d.exists) return;
    var r = d.data(), ll = [];
    for (var i = 0; i + 2 < r.flat.length; i += 3) ll.push([r.flat[i], r.flat[i + 1]]);
    if (lrcPreview) map.removeLayer(lrcPreview);
    lrcPreview = L.polyline(ll, { color: "#a855f7", weight: 6, opacity: .9, dashArray: "1 8", lineCap: "round" }).addTo(map);
    lrcClose();
    map.fitBounds(lrcPreview.getBounds().pad(0.15));
  });
}

function lrcApprove(id) {
  var db = lrcDb(), u = lrcUser();
  if (!db || !u) return;
  db.collection("proposals").doc(id).update({
    status: "approved", reviewedAt: Date.now(), reviewedBy: u.uid
  }).then(function () { lrcQueue(); lrcLoadApproved(true); })
    .catch(function (e) { alert(lrcT("Errore: ", "Error: ") + (e.message || e)); });
}
function lrcReject(id) {
  var db = lrcDb(), u = lrcUser();
  if (!db || !u) return;
  var why = prompt(lrcT("Motivo (lo vede chi ha proposto):", "Reason (visible to the author):"), "");
  if (why === null) return;
  db.collection("proposals").doc(id).update({
    status: "rejected", reviewNote: why, reviewedAt: Date.now(), reviewedBy: u.uid
  }).then(function () { lrcQueue(); })
    .catch(function (e) { alert(lrcT("Errore: ", "Error: ") + (e.message || e)); });
}

/* --------------------------------------- salite approvate: visibili subito */
/* Le approvate vivono su Firestore finche' import_proposals.mjs non le travasa
   nel repo. Le trasformiamo nella stessa forma dei passi manuali e le diamo in
   pasto alle funzioni dell'app. Difensivo: se una funzione non c'e', si salta. */
function lrcToPass(r, id) {
  var track = [];
  for (var i = 0; i + 2 < r.flat.length; i += 3) track.push([r.flat[i], r.flat[i + 1], r.flat[i + 2]]);
  return {
    id: "usr-" + id,
    name: r.name,
    lat: r.lat, lon: r.lon, elevation: r.elevation,
    userSubmitted: true, author: r.author,
    versanti: [{
      side: r.side,
      startLat: r.startLat, startLon: r.startLon,
      startElevation: r.startElevation, endElevation: r.endElevation,
      distance_km: r.km, avgGradient: r.avgGradient, maxGradient: r.maxGradient || null,
      track: track, elevSource: "user"
    }]
  };
}
function lrcLoadApproved(force) {
  var db = lrcDb();
  if (!db) return;
  if (LRC._loaded && !force) return;
  LRC._loaded = true;
  db.collection("proposals").where("status", "==", "approved").limit(300).get().then(function (qs) {
    var list = [];
    qs.forEach(function (d) { try { list.push(lrcToPass(d.data(), d.id)); } catch (e) {} });
    if (!list.length) return;
    LRC.approved = list;
    try {
      var arr = window.OSM_PASSES || window.osmPasses;
      if (arr && arr.push) {
        var have = {};
        for (var i = 0; i < arr.length; i++) have[arr[i].id] = 1;
        list.forEach(function (p) { if (!have[p.id]) arr.push(p); });
      }
      ["hydrateOsm", "applyManual", "addMarkers", "applyFilters"].forEach(function (fn) {
        var f = window[fn]; if (typeof f === "function") { try { f(); } catch (e) {} }
      });
    } catch (e) {}
  }).catch(function () { /* regole o rete: l'app funziona lo stesso */ });
}

/* ------------------------------------------------- aggancio ai menu esistenti */
/* Non tocchiamo uikit.js: aggiungiamo le voci ai suoi menu dall'esterno, quando
   compaiono nel DOM. Se uikit non c'e', il modulo resta inerte ma non rompe. */
/* stessa marcatura di uikit.mi(): icona in .bi, etichetta come testo nudo */
function lrcMenuItem(icon, label, fn) {
  var b = lrcEl("button", { "class": "uk-mi" }, '<span class="bi">' + icon + "</span>" + label);
  b.addEventListener("click", fn);
  return b;
}
/* uikit appende i menu al <body>, non accanto al bottone: li riconosciamo da
   cosa contengono, con l'ordine di creazione come rete di sicurezza. */
function lrcFindMenus() {
  var all = document.querySelectorAll(".uk-menu"), plus = null, gear = null;
  for (var i = 0; i < all.length; i++) {
    var t = all[i].textContent || "";
    if (/GPX/i.test(t)) plus = all[i];
    else if (/impostazion|settings|foto|photo|tema|theme|database|editor/i.test(t)) gear = all[i];
  }
  if (!plus && all.length > 0) plus = all[0];
  if (!gear && all.length > 1) gear = all[1];
  return { plus: plus, gear: gear };
}
/* Il posto naturale per proporre e' il pannello del route builder, appena finito
   di disegnare: niente giro "apri il menu, scopri che manca il tracciato, torna
   indietro". Il bottone appare accanto a "Salva giro" e si attiva da solo quando
   c'e' un percorso calcolato. */
function lrcWireRB() {
  var save = document.querySelector('[data-act="saveRide"]');
  if (!save || save._lrcDone === 1) return;
  save._lrcDone = 1;
  var b = lrcEl("button", { "class": "rb-btn", id: "lrc-rbprop", style: "background:#a855f7" },
    "&#x1F3D4;&#xFE0F; " + lrcT("Proponi salita", "Suggest climb"));
  b.addEventListener("click", lrcPropose);
  save.parentNode.insertBefore(b, save.nextSibling);
}

function lrcWire() {
  lrcWireRB();
  var m = lrcFindMenus();
  if (m.plus && m.plus._lrcDone !== 1) {
    m.plus.appendChild(lrcMenuItem("&#x1F3D4;&#xFE0F;", lrcT("Proponi salita", "Suggest a climb"), lrcPropose));
    m.plus._lrcDone = 1;
  }
  if (m.gear && m.gear._lrcDone !== 1) {
    m.gear._lrcDone = 1;
    m.gear.appendChild(lrcMenuItem("&#x1F4DD;", lrcT("Le mie proposte", "My suggestions"), lrcMine));
    var gm = m.gear;
    lrcWhoAmI().then(function (me) {
      if (me && me.admin && gm._lrcAdmin !== 1) {
        gm._lrcAdmin = 1;
        gm.appendChild(lrcMenuItem("&#x2705;", lrcT("Revisione proposte", "Review queue"), lrcQueue));
      }
    });
  }
}

function lrcStart() {
  lrcStyle();
  lrcWire();
  new MutationObserver(function () { try { lrcWire(); } catch (e) {} }).observe(document.body, { childList: true, subtree: true });
  setTimeout(function () { try { lrcLoadApproved(); } catch (e) {} }, 1500);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", lrcStart); else lrcStart();
