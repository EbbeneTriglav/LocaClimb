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
var CACHE = "locaride-v2";

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

/* la pagina e il codice devono essere sempre freschi; i dati possono aspettare */
function mustBeFresh(req, url) {
  if (req.mode === "navigate") return true;
  return /\.(?:js|css|html)$/.test(url.pathname);
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
      if (res && res.status === 200 && res.type === "basic") {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
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
