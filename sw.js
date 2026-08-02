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

   Cosa NON viene messo in cache: le chiamate a Firebase, Overpass, Open-Meteo,
   BRouter e le tessere della mappa. Sono dati vivi: una risposta vecchia sarebbe
   peggio di nessuna risposta (un meteo di ieri, un bar che nel frattempo ha chiuso).
   =========================================================================== */

var CACHE = "locaride-v1";

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

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  // Solo i file della nostra app: tutto il resto passa dritto alla rete.
  if (url.origin !== self.location.origin) return;

  // I dati che cambiano di continuo non vanno mai serviti da una copia vecchia.
  if (/\/(api|__)\//.test(url.pathname)) return;

  e.respondWith(
    fetch(req).then(function (res) {
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
