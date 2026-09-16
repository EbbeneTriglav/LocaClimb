/* ============================================================================
 * authfix.js - accesso Google funzionante su mobile e in app installata.
 * ----------------------------------------------------------------------------
 * PERCHE'
 * auth.js usa solo signInWithPopup. Su desktop va benissimo, ma su Chrome mobile
 * e dentro una PWA installata il popup viene bloccato dal browser, oppure resta
 * aperto e la pagina madre non riesce piu' a sapere se si e' chiuso: e' l'errore
 * "Cross-Origin-Opener-Policy policy would block the window.closed call" che
 * compare in console. Risultato: l'utente clicca, si apre Google, e poi non
 * succede niente. Nessun messaggio, nessun errore visibile.
 *
 * COSA FA
 * Sostituisce amGoogle() con una versione che:
 *   - su mobile o in app installata usa signInWithRedirect (l'unica via che i
 *     browser mobili trattano bene: si esce, si sceglie l'account, si rientra);
 *   - su desktop tiene il popup, che e' piu' comodo, ma se fallisce ripiega
 *     automaticamente sul redirect invece di lasciare l'utente a mani vuote;
 *   - al ritorno dal redirect completa il giro con getRedirectResult e crea il
 *     documento users/{uid} se e' il primo accesso, esattamente come faceva
 *     il popup.
 *
 * Non modifica auth.js: lo avvolge dall'esterno. Si disinstalla togliendo il
 * suo <script>. Da caricare DOPO js/auth.js. 100% ASCII.
 * ==========================================================================*/

(function () {
  function fbReadyNow() { return typeof FB !== "undefined" && FB && FB.auth && FB.db; }

  function isStandalone() {
    try {
      return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches)
        || window.navigator.standalone === true;
    } catch (e) { return false; }
  }
  function isMobile() {
    try { return window.matchMedia("(max-width:820px)").matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent); }
    catch (e) { return false; }
  }
  /* il redirect e' obbligatorio dove il popup non e' affidabile */
  function needsRedirect() { return isStandalone() || isMobile(); }

  function msg(t) {
    try { if (typeof amMsg === "function") { amMsg(t); return; } } catch (e) {}
    console.log("[auth] " + t);
  }

  /* crea il profilo al primo accesso, come faceva il ramo popup di auth.js */
  function ensureUserDoc(u) {
    if (!u || !fbReadyNow()) return Promise.resolve();
    var ref = FB.db.collection("users").doc(u.uid);
    return ref.get().then(function (d) {
      if (!d.exists) {
        return ref.set({
          username: u.displayName || "",
          email: u.email || "",
          createdAt: Date.now()
        });
      }
    }).catch(function () { /* le regole o la rete: l'accesso e' comunque riuscito */ });
  }

  function closeModal() {
    var m = document.getElementById("acctModal");
    if (m) m.remove();
  }

  function goRedirect(prov) {
    try { sessionStorage.setItem("lr_auth_redir", "1"); } catch (e) {}
    msg("Ti mando su Google...");
    FB.auth.signInWithRedirect(prov);
  }

  function amGoogleFixed() {
    if (!fbReadyNow()) { alert("Account non configurato."); return; }
    var prov = new firebase.auth.GoogleAuthProvider();
    prov.setCustomParameters({ prompt: "select_account" });

    if (needsRedirect()) { goRedirect(prov); return; }

    msg("Apertura Google...");
    FB.auth.signInWithPopup(prov).then(function (cr) {
      return ensureUserDoc(cr.user).then(closeModal);
    }).catch(function (e) {
      var c = (e && e.code) || "";
      /* il popup puo' essere bloccato, chiuso o non supportato: invece di dare
         un errore che l'utente non sa interpretare, passiamo al redirect */
      if (c.indexOf("popup") >= 0 || c.indexOf("cancelled-popup") >= 0
        || c.indexOf("operation-not-supported") >= 0 || c.indexOf("web-storage") >= 0) {
        goRedirect(prov);
        return;
      }
      msg(typeof fbErr === "function" ? fbErr(e) : (e && e.message) || "Errore");
    });
  }

  /* Al ritorno dal redirect Firebase ha gia' l'utente: qui completiamo il giro. */
  function finishRedirect() {
    if (!fbReadyNow()) return;
    FB.auth.getRedirectResult().then(function (cr) {
      var pending = false;
      try { pending = sessionStorage.getItem("lr_auth_redir") === "1"; } catch (e) {}
      try { sessionStorage.removeItem("lr_auth_redir"); } catch (e) {}
      if (cr && cr.user) { ensureUserDoc(cr.user).then(closeModal); return; }
      /* tornati indietro senza utente: l'utente ha annullato, oppure il browser
         ha bloccato i cookie di terze parti (succede in navigazione privata) */
      if (pending && !FB.auth.currentUser) {
        msg("Accesso non completato. Se usi la navigazione privata, i cookie bloccati impediscono l'accesso con Google: prova con email e password.");
      }
    }).catch(function (e) {
      try { sessionStorage.removeItem("lr_auth_redir"); } catch (x) {}
      msg(typeof fbErr === "function" ? fbErr(e) : (e && e.message) || "Errore");
    });
  }

  /* auth.js puo' non essere ancora pronto quando partiamo: riproviamo per 15s */
  var tries = 0;
  var iv = setInterval(function () {
    tries++;
    if (fbReadyNow()) {
      window.amGoogle = amGoogleFixed;     // sostituisce la versione a popup
      finishRedirect();
      clearInterval(iv);
    } else if (tries > 30) {
      clearInterval(iv);
    }
  }, 500);
  if (fbReadyNow()) { window.amGoogle = amGoogleFixed; finishRedirect(); }
})();
