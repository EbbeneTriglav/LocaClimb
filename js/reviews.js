/* ===========================================================================
   LocaRide - Recensioni con commento
   ---------------------------------------------------------------------------
   Aggiunge un commento testuale al voto a 4 assi gia' esistente, mostra i
   commenti degli altri sulla scheda del passo, e crea la sezione
   "Le mie recensioni" nel profilo (modificabili ed eliminabili).

   COME E' AGGANCIATO (importante da sapere)
   Questo file NON modifica auth.js: viene caricato DOPO e ridefinisce tre
   funzioni (renderRatings, submitVote, mrHeader). In JavaScript vince
   l'ultima definizione, quindi l'app usa queste. Vantaggio: per annullare
   l'intera iterazione basta togliere il tag <script> da index.html, senza
   toccare nient'altro.

   DOVE FINISCONO I DATI
   - Il commento sta nello stesso documento del voto: ratings/{passo}/votes/{utente}
     (gia' per-utente, quindi gia' modificabile dal solo autore).
   - Una copia sta in users/{utente}/reviews/{passo}, che serve solo a costruire
     la lista "Le mie recensioni" senza dover interrogare tutti i passi.
   =========================================================================== */

var REV_MAX = 300;          // caratteri: una recensione utile, non un forum
var REV_SHOW = 20;          // quanti commenti mostrare sulla scheda del passo
var myReviewsCache = [];
var mrTab = "rides";        // scheda attiva nel profilo: "rides" | "reviews"

/* --------------------------- profilo: barra schede -------------------------
   Ridefinisce l'intestazione del pannello profilo aggiungendo le due schede. */
function mrHeader() {
  var who = (typeof FBUSER !== "undefined" && FBUSER) ? (FBUSER.displayName || FBUSER.email || "") : "";
  var tab = function (id, label, act) {
    var on = mrTab === id;
    return '<button data-act="' + act + '" style="border:none;cursor:pointer;font:inherit;font-weight:600;font-size:.85rem;padding:6px 14px;border-radius:999px;'
      + (on ? 'background:#fff;color:#1e3a5f' : 'background:rgba(255,255,255,.18);color:#fff') + '">' + label + '</button>';
  };
  return '<div class="dp-hdr"><div style="display:flex;justify-content:space-between;align-items:start"><div>'
    + '<h2 style="margin:0;font-size:1.3em">&#x1F464; Il mio profilo</h2>'
    + '<p style="margin:3px 0;opacity:.9">' + esc(who) + '</p>'
    + '</div><button data-act="closeD" style="background:rgba(255,255,255,.2);border:none;color:#fff;font-size:1.3em;cursor:pointer;border-radius:8px;padding:4px 10px">&#x2715;</button></div>'
    + '<div style="display:flex;gap:7px;margin-top:12px">' + tab("rides", "&#x1F6B5; I miei giri", "openMyRides") + tab("reviews", "&#x2B50; Le mie recensioni", "openMyReviews") + '</div>'
    + '</div>';
}

/* ------------------------- scheda passo: recensioni ------------------------ */
function renderRatings(p) {
  var box = document.getElementById("ratebox"); if (!box) return;
  if (!fbReady()) { box.innerHTML = 'Account/valutazioni disponibili dopo la configurazione Firebase.'; return; }
  if (!FB) { box.innerHTML = 'Servizio non disponibile.'; return; }
  var pid = p.id;
  FB.db.collection("ratings").doc(pid).get().then(function (d) {
    var a = d.exists ? d.data() : { n: 0, eSum: 0, pSum: 0, tSum: 0, aSum: 0 }, n = a.n || 0;
    function av(s) { return n ? s / n : 0; }
    var aE = av(a.eSum), aP = av(a.pSum), aT = av(a.tSum), aA = av(a.aSum), ov = n ? (aE + aP + aT + aA) / 4 : 0;
    var html = '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px"><b style="font-size:1.35rem;color:var(--txt)">' + (n ? ov.toFixed(1) : "-") + '</b><span style="color:var(--txt2)">/5 &middot; ' + n + ' voti</span></div>';
    html += axisRow("Emozione", aE, n) + axisRow("Paesaggio", aP, n) + axisRow("Traffico", aT, n) + axisRow("Asfalto", aA, n);

    if (FBUSER && FBUSER.emailVerified) {
      html += '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--bdr)"><div style="font-weight:600;margin-bottom:4px">Il tuo voto</div>'
        + voteSel("e", "Emozione") + voteSel("p", "Paesaggio") + voteSel("t", "Traffico") + voteSel("a", "Asfalto")
        + '<textarea id="rv_txt" maxlength="' + REV_MAX + '" placeholder="Racconta in due righe com\'e\' andata (facoltativo)" '
        + 'style="width:100%;margin-top:7px;padding:7px;border:1px solid var(--bdr);border-radius:8px;background:var(--bg);color:var(--txt);font:inherit;font-size:.85rem;resize:vertical;min-height:56px"></textarea>'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:5px">'
        + '<button class="btn" data-act="submitVote" data-id="' + esc(pid) + '">Invia recensione</button>'
        + '<span id="rv_count" style="font-size:.72rem;color:var(--txt2)">0/' + REV_MAX + '</span></div></div>';
      html += '<div id="revlist"></div>';
      box.innerHTML = html;
      // precarica il voto/commento gia' dato da questo utente
      FB.db.collection("ratings").doc(pid).collection("votes").doc(FBUSER.uid).get().then(function (vd) {
        if (!vd.exists) return;
        var v = vd.data();
        ["e", "p", "t", "a"].forEach(function (k) { var s = document.getElementById("rv_" + k); if (s && v[k]) s.value = v[k]; });
        var ta = document.getElementById("rv_txt");
        if (ta && v.txt) { ta.value = v.txt; revCount(); }
      });
      var ta0 = document.getElementById("rv_txt");
      if (ta0) ta0.addEventListener("input", revCount);
      loadReviewList(pid);
    } else if (FBUSER) {
      html += '<div style="margin-top:6px;color:var(--txt2)">Conferma la mail per votare e recensire. <a href="#" data-act="fbResend">Reinvia conferma</a></div><div id="revlist"></div>';
      box.innerHTML = html; loadReviewList(pid);
    } else {
      html += '<div style="margin-top:8px"><button class="btn" data-act="acctOpen">Accedi per votare</button></div><div id="revlist"></div>';
      box.innerHTML = html; loadReviewList(pid);
    }
  }).catch(function () { box.innerHTML = 'Valutazioni non disponibili (controlla le regole Firestore).'; });
}

function revCount() {
  var ta = document.getElementById("rv_txt"), c = document.getElementById("rv_count");
  if (ta && c) c.textContent = ta.value.length + "/" + REV_MAX;
}

/* Commenti degli altri utenti sul passo. */
function loadReviewList(pid) {
  var box = document.getElementById("revlist"); if (!box || !FB) return;
  FB.db.collection("ratings").doc(pid).collection("votes").orderBy("ts", "desc").limit(REV_SHOW).get()
    .then(function (snap) {
      var items = [];
      snap.forEach(function (d) { var v = d.data(); if (v && v.txt) items.push(v); });
      if (!items.length) { box.innerHTML = ''; return; }
      var h = '<div class="section-title" style="margin-top:14px">&#x1F4AC; Cosa dicono i ciclisti</div>';
      items.forEach(function (v) {
        var dt = v.ts ? new Date(v.ts) : null;
        var ds = dt ? ("0" + dt.getDate()).slice(-2) + "/" + ("0" + (dt.getMonth() + 1)).slice(-2) + "/" + dt.getFullYear() : "";
        var med = ((+v.e || 0) + (+v.p || 0) + (+v.t || 0) + (+v.a || 0)) / 4;
        h += '<div style="padding:8px 10px;border-radius:9px;background:var(--bg);margin:6px 0;border-left:3px solid var(--ac)">'
          + '<div style="display:flex;justify-content:space-between;gap:8px;font-size:.76rem;color:var(--txt2);margin-bottom:3px">'
          + '<b style="color:var(--txt)">' + esc(v.by || "Ciclista") + '</b><span>&#x2B50; ' + med.toFixed(1) + ' &middot; ' + ds + '</span></div>'
          + '<div style="font-size:.85rem;white-space:pre-wrap">' + esc(String(v.txt).substring(0, REV_MAX)) + '</div></div>';
      });
      box.innerHTML = h;
    }).catch(function () { box.innerHTML = ''; });
}

/* Invio voto + commento: aggiorna gli aggregati in transazione (come prima) e
   scrive la copia per la lista personale. */
function submitVote(pid) {
  if (!FB || !FBUSER) return;
  var e = +document.getElementById("rv_e").value, p2 = +document.getElementById("rv_p").value,
      t = +document.getElementById("rv_t").value, a = +document.getElementById("rv_a").value;
  var taEl = document.getElementById("rv_txt");
  var txt = taEl ? String(taEl.value || "").trim().substring(0, REV_MAX) : "";
  var passRef = FB.db.collection("ratings").doc(pid), voteRef = passRef.collection("votes").doc(FBUSER.uid);

  FB.db.runTransaction(function (tx) {
    return tx.get(voteRef).then(function (vs) {
      return tx.get(passRef).then(function (ps) {
        var agg = ps.exists ? ps.data() : { n: 0, eSum: 0, pSum: 0, tSum: 0, aSum: 0 }, old = vs.exists ? vs.data() : null;
        if (old) { agg.eSum -= old.e; agg.pSum -= old.p; agg.tSum -= old.t; agg.aSum -= old.a; agg.n -= 1; }
        agg.eSum += e; agg.pSum += p2; agg.tSum += t; agg.aSum += a; agg.n += 1;
        tx.set(passRef, agg);
        tx.set(voteRef, { e: e, p: p2, t: t, a: a, txt: txt, by: FBUSER.displayName || "", ts: Date.now() });
      });
    });
  }).then(function () {
    // copia nel profilo (non blocca: se fallisce, il voto e' comunque salvato)
    var pname = (typeof CUR_PASS !== "undefined" && CUR_PASS && CUR_PASS.name) ? CUR_PASS.name : pid;
    FB.db.collection("users").doc(FBUSER.uid).collection("reviews").doc(pid)
      .set({ passId: pid, passName: pname, txt: txt, e: e, p: p2, t: t, a: a, ts: Date.now() })
      .catch(function () {});
    if (typeof CUR_PASS !== "undefined" && CUR_PASS) renderRatings(CUR_PASS);
  }).catch(function (err) { alert("Errore voto: " + (err.message || err)); });
}

/* ------------------------- profilo: le mie recensioni ---------------------- */
function openMyReviews() {
  if (!window.FB || !FBUSER) { if (typeof acctOpen === "function") acctOpen(); return; }
  mrTab = "reviews";
  var dp = document.getElementById("dp"); if (!dp) return;
  dp.innerHTML = mrHeader() + '<div class="dp-body"><p style="color:var(--txt2)">Carico le tue recensioni&#8230;</p></div>';
  setPanel("dp", true);
  FB.db.collection("users").doc(FBUSER.uid).collection("reviews").orderBy("ts", "desc").limit(100).get()
    .then(function (snap) {
      myReviewsCache = [];
      snap.forEach(function (d) { var o = d.data(); o.id = d.id; myReviewsCache.push(o); });
      renderMyReviews();
    })
    .catch(function (e) {
      dp.innerHTML = mrHeader() + '<div class="dp-body"><p style="color:var(--err)">Impossibile caricare: ' + esc(e.message || String(e)) + '</p></div>';
    });
}

function renderMyReviews() {
  var dp = document.getElementById("dp"); if (!dp) return;
  var h = mrHeader() + '<div class="dp-body">';
  if (!myReviewsCache.length) {
    h += '<p style="color:var(--txt2)">Non hai ancora scritto recensioni.<br>Apri un passo, dai i tuoi voti e aggiungi un commento.</p>';
  } else {
    h += '<div class="rstats"><div>Recensioni<b>' + myReviewsCache.length + '</b></div></div>';
    myReviewsCache.forEach(function (r, i) {
      var dt = r.ts ? new Date(r.ts) : null;
      var ds = dt ? ("0" + dt.getDate()).slice(-2) + "/" + ("0" + (dt.getMonth() + 1)).slice(-2) + "/" + dt.getFullYear() : "";
      var med = ((+r.e || 0) + (+r.p || 0) + (+r.t || 0) + (+r.a || 0)) / 4;
      h += '<div style="border:1px solid var(--bdr);border-radius:12px;padding:11px 13px;margin:9px 0;background:var(--bg)">'
        + '<div style="font-weight:700">' + esc(r.passName || r.passId) + '</div>'
        + '<div style="font-size:.78rem;color:var(--txt2);margin-bottom:6px">&#x2B50; ' + med.toFixed(1) + '/5 &middot; ' + ds + '</div>'
        + (r.txt ? '<div style="font-size:.85rem;white-space:pre-wrap;margin-bottom:8px">' + esc(r.txt) + '</div>'
                 : '<div style="font-size:.82rem;color:var(--txt2);margin-bottom:8px"><i>Solo voto, nessun commento.</i></div>')
        + '<div style="display:flex;gap:6px;flex-wrap:wrap">'
        + '<button class="rb-btn go" data-act="revEdit" data-i="' + i + '">Apri e modifica</button>'
        + '<button class="rb-btn rst" data-act="revDel" data-i="' + i + '">Elimina</button>'
        + '</div></div>';
    });
  }
  h += '</div>';
  dp.innerHTML = h;
}

/* Apre la scheda del passo: li' il commento e' gia' precaricato e modificabile. */
function revEdit(i) {
  var r = myReviewsCache[+i]; if (!r) return;
  if (typeof openD === "function") openD(r.passId);
  else alert("Apri il passo dalla mappa per modificare la recensione.");
}

/* Elimina la recensione: toglie il voto dagli aggregati e cancella entrambe le copie. */
function revDel(i) {
  var r = myReviewsCache[+i]; if (!r) return;
  if (!confirm("Eliminare la tua recensione di \"" + (r.passName || r.passId) + "\"?")) return;
  var passRef = FB.db.collection("ratings").doc(r.passId), voteRef = passRef.collection("votes").doc(FBUSER.uid);
  FB.db.runTransaction(function (tx) {
    return tx.get(voteRef).then(function (vs) {
      return tx.get(passRef).then(function (ps) {
        if (vs.exists && ps.exists) {
          var agg = ps.data(), old = vs.data();
          agg.eSum -= old.e; agg.pSum -= old.p; agg.tSum -= old.t; agg.aSum -= old.a; agg.n = Math.max(0, (agg.n || 1) - 1);
          tx.set(passRef, agg);
        }
        tx.delete(voteRef);
      });
    });
  }).then(function () {
    return FB.db.collection("users").doc(FBUSER.uid).collection("reviews").doc(r.passId).delete();
  }).then(function () { openMyReviews(); })
    .catch(function (e) { alert("Errore: " + (e.message || e)); });
}

/* Quando si apre "I miei giri" la scheda attiva torna a essere quella dei giri.
   Avvolgiamo la funzione di myrides.js invece di modificarla. */
if (typeof openMyRides === "function") {
  var _mrOpenRides = openMyRides;
  openMyRides = function () { mrTab = "rides"; return _mrOpenRides.apply(this, arguments); };
}
