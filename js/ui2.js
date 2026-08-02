/* ===========================================================================
   LocaRide - Iterazione 11
   1) I comandi della mappa (Acqua, Traffico) escono dalla barra superiore e
      diventano una colonna di pulsanti flottanti SULLA mappa, che si sposta
      quando si apre un pannello.
   2) Il pulsante utente apre la PAGINA PROFILO completa invece del riquadro di
      accesso (che resta per chi non ha ancora fatto l'accesso).

   PERCHE' I PULSANTI VENGONO SPOSTATI E NON RICREATI
   Gli elementi originali sono agganciati ai loro gestori di eventi (alcuni via
   delega, altri con listener diretti registrati all'avvio). Spostando il nodo
   con appendChild i gestori viaggiano con lui: ricrearli da zero avrebbe
   significato rifare a mano quei collegamenti, con il rischio di perderne uno.

   Nessuna modifica ai file esistenti. Togliendo il <script> torna tutto com'era.
   =========================================================================== */

/* --------------------------------- stile ---------------------------------- */
/* Iniettato da qui per non aggiungere un altro foglio di stile da collegare. */
(function ui2Style() {
  var css = ''
    + '#mapctl{position:fixed;right:16px;top:calc(var(--hdr) + 96px);display:flex;flex-direction:column;gap:8px;'
    + 'z-index:900;transition:transform .28s ease,opacity .2s}'
    + '#mapctl .btn{width:46px;height:46px;padding:0;justify-content:center;border-radius:13px;'
    + 'background:var(--bg2);border:1px solid var(--bdr);box-shadow:0 3px 12px rgba(15,23,42,.20)}'
    + '#mapctl .btn .bl{display:none}'
    + '#mapctl .btn .bi{font-size:1.3rem}'
    + '#mapctl .btn:hover{background:var(--ac);color:#fff;border-color:var(--ac)}'
    + '#mapctl .btn.active{background:var(--ok);color:#fff;border-color:var(--ok)}'
    /* si sposta quando il pannello di destra copre la mappa */
    + 'body.dp-open #mapctl{transform:translateX(-528px)}'
    + '@media(max-width:900px){body.dp-open #mapctl{opacity:0;pointer-events:none;transform:none}}'
    + '@media(max-width:760px){#mapctl{right:12px;top:calc(var(--hdr) + 84px);gap:7px}'
    + '#mapctl .btn{width:44px;height:44px}}'
    /* la legenda del traffico non deve finire sotto la colonna dei comandi */
    + '#traf-leg{bottom:76px}'
    /* pagina profilo: pulsante di uscita nell'intestazione */
    + '.pf-out{background:rgba(255,255,255,.18);border:none;color:#fff;cursor:pointer;font:inherit;'
    + 'font-size:.78rem;font-weight:600;padding:5px 12px;border-radius:999px;margin-left:6px}'
    + '.pf-out:hover{background:rgba(255,255,255,.32)}';
  var s = document.createElement("style");
  s.id = "ui2-style";
  s.textContent = css;
  document.head.appendChild(s);
})();

/* ------------------------ 1. comandi dentro la mappa ----------------------- */
function buildMapControls() {
  if (document.getElementById("mapctl")) return;
  var box = document.createElement("div");
  box.id = "mapctl";
  document.body.appendChild(box);

  // Ordine dall'alto: acqua, traffico. Si spostano i nodi ESISTENTI.
  ["fountBtn", "tb"].forEach(function (id) {
    var b = document.getElementById(id);
    if (b) box.appendChild(b);
  });

  // se e' attiva la lingua inglese, traduce anche questi (stanno fuori da #hdr)
  if (typeof lrTranslate === "function") lrTranslate(box);
}

/* ------------------------- 2. pagina profilo utente ------------------------ */
/* Riferimento alla funzione originale PRIMA di sostituirla: serve a chi non ha
   ancora un account, che deve continuare a vedere il riquadro di accesso. */
var _acctOpenOrig = (typeof acctOpen === "function") ? acctOpen : null;

function profileOpen() {
  var logged = (typeof FBUSER !== "undefined") && FBUSER;
  if (logged && typeof openMyRides === "function") {
    if (typeof mrTab !== "undefined") mrTab = "rides";
    openMyRides();
    return;
  }
  if (_acctOpenOrig) _acctOpenOrig();     // non autenticato: accesso/registrazione
}

function fbLogout() {
  if (typeof FB === "undefined" || !FB || !FB.auth) return;
  if (!confirm("Vuoi uscire dall'account?")) return;
  FB.auth.signOut().then(function () {
    if (typeof closeD === "function") closeD();
  });
}

/* Il pulsante utente aveva gia' un gestore registrato all'avvio da auth.js, che
   non si puo' rimuovere senza il suo riferimento. Clonando il nodo si ottiene un
   pulsante identico ma PULITO (i listener non vengono clonati), su cui colleghiamo
   il nuovo comportamento. L'id resta lo stesso, quindi l'etichetta continua ad
   aggiornarsi da sola quando cambia l'utente. */
function rebindAccountButton() {
  var b = document.getElementById("acct");
  if (!b || b.getAttribute("data-ui2") === "1") return;
  var c = b.cloneNode(true);
  c.setAttribute("data-ui2", "1");
  c.setAttribute("title", "Il mio profilo");
  b.parentNode.replaceChild(c, b);
  c.addEventListener("click", profileOpen);
}

/* Intestazione del profilo: tre schede + uscita.
   Ridefinisce la versione di stats.js aggiungendo il pulsante "Esci". */
function mrHeader() {
  var who = (typeof FBUSER !== "undefined" && FBUSER) ? (FBUSER.displayName || FBUSER.email || "") : "";
  var tab = function (id, label, act) {
    var on = (typeof mrTab !== "undefined") && mrTab === id;
    return '<button data-act="' + act + '" style="border:none;cursor:pointer;font:inherit;font-weight:600;font-size:.8rem;padding:6px 12px;border-radius:999px;'
      + (on ? 'background:#fff;color:#1e3a5f' : 'background:rgba(255,255,255,.18);color:#fff') + '">' + label + '</button>';
  };
  return '<div class="dp-hdr"><div style="display:flex;justify-content:space-between;align-items:start;gap:10px"><div>'
    + '<h2 style="margin:0;font-size:1.3em">&#x1F464; Il mio profilo</h2>'
    + '<p style="margin:3px 0;opacity:.9">' + esc(who) + '</p>'
    + '</div><div style="display:flex;align-items:center">'
    + '<button class="pf-out" data-act="fbLogout">Esci</button>'
    + '<button data-act="closeD" style="background:rgba(255,255,255,.2);border:none;color:#fff;font-size:1.3em;cursor:pointer;border-radius:8px;padding:4px 10px;margin-left:6px">&#x2715;</button>'
    + '</div></div>'
    + '<div style="display:flex;gap:6px;margin-top:12px;flex-wrap:wrap">'
    + tab("rides", "&#x1F6B5; Giri", "openMyRides")
    + tab("reviews", "&#x2B50; Recensioni", "openMyReviews")
    + tab("stats", "&#x1F4CA; Statistiche", "openMyStats")
    + '</div></div>';
}

/* --------------------------------- avvio ----------------------------------- */
(function ui2Boot() {
  function go() {
    buildMapControls();
    rebindAccountButton();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go);
  else go();
  // auth.js aggancia il suo gestore quando Firebase e' pronto, che puo' essere
  // dopo di noi: un secondo passaggio garantisce che l'ultimo collegamento sia il nostro.
  setTimeout(function () { rebindAccountButton(); }, 1200);
})();
