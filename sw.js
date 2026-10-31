/* ===========================================================================
   LocaRide - Service Worker
   ---------------------------------------------------------------------------
   Scopo: rendere l'app INSTALLABILE (icona in home, schermo intero) e resistente
   a una connessione ballerina in montagna.

   STRATEGIA: "prima la rete, la cache come rete di sicurezza".
   Perche' non il contrario (cache-first, che sarebbe piu' veloce)?
   Perche' tu pubblichi aggiornamenti spesso: con cache-first gli utenti (e tu
   stesso in fase di test) continuereste a vedere la versione vecchia dopo ogni
   push, senza capire il perche'. Con network-first, online hai SEMPRE l'ultima
   versione; la copia salvata entra in gioco solo quando la rete non risponde.

   CORREZIONE IMPORTANTE (set 2026)
   "Prima la rete" non bastava. Il nostro fetch() finiva comunque nella cache HTTP
   del browser, che GitHub Pages autorizza per qualche minuto: il service worker
   credeva di aver preso il file fresco e serviva invece quello vecchio. Per la
   PAGINA e per SCRIPT e FOGLI DI STILE ora forziamo cache:"reload", che salta
   quella cache e va davvero in rete. E' il motivo per cui un aggiornamento
   poteva restare invisibile per ore, soprattutto nell'app installata, dove non
   esiste un "ricarica forzato" da offrire all'utente.

   I dati (data/*.json, tessere, meteo) continuano a usare la cache normale: sono
   file grandi e chiederli sempre da zero costerebbe traffico senza vantaggio.

   Cosa NON viene messo in cache: le chiamate a Firebase, Overpass, Open-Meteo,
   BRouter e le tessere della mappa. Sono dati vivi: una risposta vecchia sarebbe
   peggio di nessuna risposta (un meteo di ieri, un bar che nel frattempo ha chiuso).
   =========================================================================== */

/* Il nome cambia a ogni versione: cosi' l'evento activate qui sotto fa pulizia
   delle copie vecchie invece di tenersele per sempre. */
var CACHE = "locaride-v3";   // v3 (31/10/2026): v2 is the main page; versioned files no longer re-downloaded

self.addEventListener("install", function (e) {
  self.skipWaiting();                       // la nuova versione entra subito in servizio
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* la pagina e il codice devono essere sempre freschi; i dati possono aspettare.
   Eccezione: i file con la versione nel nome (?v=...) e le librerie in vendor/ (MapLibre, ~1 MB):
   cambiano indirizzo quando cambiano, quindi la cache HTTP normale e' gia' giusta. Prima venivano
   riscaricati per intero a ogni apertura, ed era il grosso del tempo di avvio della nuova versione. */
function mustBeFresh(req, url) {
  if (req.mode === "navigate") return true;
  if (/[?&]v=/.test(url.search) || /\/vendor\//.test(url.pathname)) return false;
  return /\.(?:m?js|css|html)$/.test(url.pathname);
}

/* Salva la copia solo se e' cambiata (stesso ETag = stesso file): l'indice delle salite pesa
   ~5 MB e riscriverlo nel telefono a ogni apertura era lavoro inutile. */
function keep(req, res) {
  var copy = res.clone(), tag = res.headers.get("etag");
  caches.open(CACHE).then(function (c) {
    var same = tag ? c.match(req).then(function (old) { return !!old && old.headers.get("etag") === tag; }) : Promise.resolve(false);
    return same.then(function (s) { if (!s) return c.put(req, copy); });
  }).catch(function () {});
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  // Solo i file della nostra app: tutto il resto passa dritto alla rete.
  if (url.origin !== self.location.origin) return;

  // I dati che cambiano di continuo non vanno mai serviti da una copia vecchia.
  if (/\/(api|__)\//.test(url.pathname)) return;

  var fresh = mustBeFresh(req, url);

  e.respondWith(
    // cache:"reload" salta la cache HTTP del browser: senza, "prima la rete"
    // restava una buona intenzione e l'aggiornamento non arrivava mai.
    fetch(fresh ? new Request(req, { cache: "reload" }) : req).then(function (res) {
      if (res && res.status === 200 && res.type === "basic") keep(req, res);
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        if (hit) return hit;
        // navigazione senza rete e senza copia: torna alla pagina principale se c'e'
        if (req.mode === "navigate") return caches.match("./");
        return new Response("", { status: 504, statusText: "offline" });
      });
    })
  );
});

/* Permette alla pagina di chiedere una pulizia completa ("Aggiorna app"):
   svuota tutte le cache e si toglie di mezzo, poi la pagina ricarica. */
self.addEventListener("message", function (e) {
  if (!e.data || e.data.type !== "LR_RESET") return;
  e.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.registration.unregister(); })
      .then(function () {
        return self.clients.matchAll({ type: "window" }).then(function (cs) {
          cs.forEach(function (c) { c.postMessage({ type: "LR_RESET_DONE" }); });
        });
      })
  );
});
