/* ===========================================================================
   LocaRide - Italiano / English
   ---------------------------------------------------------------------------
   PERCHE' COSI'
   Le scritte dell'app non stanno in un file di testo: sono dentro le stringhe
   HTML costruite da dieci moduli diversi. Un sistema di traduzione "da manuale"
   imporrebbe di riscrivere tutti quei file - il tipo di intervento che rompe
   cose funzionanti. Qui invece la traduzione avviene DOPO che l'interfaccia e'
   stata disegnata: si scorrono i testi e si sostituiscono quelli riconosciuti.

   SICUREZZA SUI CONTENUTI DEGLI UTENTI
   Si sostituisce solo quando il testo coincide ESATTAMENTE con una voce del
   dizionario. I nomi dei passi, i commenti e i nomi dei giri non coincidono mai
   con un'etichetta dell'interfaccia, quindi non vengono toccati.

   LIMITE DICHIARATO: se in futuro aggiungi una scritta nuova e non la metti nel
   dizionario, resta in italiano anche in modalita' inglese. Non si rompe niente,
   semplicemente non e' tradotta.
   =========================================================================== */

var LR_LANG = "it";
var LR_KEY = "locaride_lang";

/* --------------------------- dizionario IT -> EN --------------------------- */
var I18N = {
  /* barra superiore e ricerca */
  "Cerca passo...": "Search a pass...",
  "Filtri": "Filters", "Percorso": "Route", "Traffico": "Traffic", "Editor": "Editor",
  "Tema": "Theme", "Accedi": "Sign in", "Acqua": "Water", "I miei giri": "My rides",
  "Crea percorso": "Create route", "Traffico veicolare": "Vehicle traffic",
  "Editor / proponi salita": "Editor / suggest a climb", "Tema scuro": "Dark theme",
  "Account": "Account", "Fontanelle / acqua potabile": "Fountains / drinking water",
  "Torna alla mappa": "Back to the map",

  /* filtri */
  "Regione": "Region", "Tutte": "All", "Tutti": "All",
  "Difficolta min": "Min difficulty", "Stato": "Status",
  "Aperto": "Open", "Stagionale": "Seasonal", "Chiuso": "Closed",
  "Camion": "Trucks", "Solo senza camion": "No trucks only", "Pochi o nessuno": "Few or none",
  "Mostra passi OSM": "Show OSM passes", "Reset": "Reset", "Chiudi": "Close",

  /* costruttore percorso */
  "Route Builder": "Route Builder",
  "- clicca i passi o la mappa per aggiungere punti": "- click passes or the map to add points",
  "Clicca sui passi o sulla mappa...": "Click on passes or on the map...",
  "Misto (gravel ok)": "Mixed (gravel ok)", "Solo asfalto": "Paved only", "Piu corto": "Shortest",
  "Preferenza fondo": "Surface preference",
  "Calcola Percorso": "Calculate route", "Calcolo...": "Calculating...",
  "Scarica GPX": "Download GPX", "Importa GPX": "Import GPX",
  "GPX + punti utili": "GPX + useful points", "Salva giro": "Save ride",
  "Immagine": "Image", "Roadbook": "Roadbook",
  "Percorso non trovato": "Route not found",
  "Calcolo percorso ciclabile (Brouter)...": "Calculating cycling route (BRouter)...",
  "Caricamento tracciato stradale...": "Loading road network...",
  "Recupero quote dal profilo del terreno…": "Fetching elevations from terrain...",
  "In modalita percorso, un clic sulla mappa aggiunge un waypoint libero (non solo passi).":
    "In route mode, a click on the map adds a free waypoint (not only passes).",
  "Sposta indietro": "Move back", "Sposta avanti": "Move forward",
  "Trascina per riordinare": "Drag to reorder",
  "Altimetria del percorso": "Route elevation profile",
  "Distanza": "Distance", "Dislivello": "Elevation gain", "Tappe": "Stops",
  "Altimetria": "Elevation profile", "Fondo Stradale": "Road surface",
  "Altimetria non disponibile": "Elevation not available",
  "Calcola o apri prima un percorso.": "Calculate or open a route first.",
  "Nessun percorso da esportare.": "No route to export.",
  "waypoint": "waypoint",
  "asfalto": "paved", "sterrato": "gravel", "fondo naturale": "natural surface", "altro": "other",
  "Dati fondo stradale non disponibili (motore di routing di riserva).":
    "Road surface data unavailable (fallback routing engine).",

  /* meteo di percorso */
  "Meteo del percorso": "Route weather", "Calcola": "Calculate",
  "Frecce in mappa": "Arrows on map", "Andatura": "Pace",
  "km/h in piano": "km/h on the flat",
  "Previsioni in arrivo…": "Loading forecast...",
  "Previsioni non disponibili (Open-Meteo non raggiungibile).":
    "Forecast unavailable (Open-Meteo unreachable).",
  "Scegli data e ora di partenza.": "Choose start date and time.",
  "Arrivo": "Arrival", "Durata": "Duration", "Contrario": "Headwind", "A favore": "Tailwind",
  "Ristori sul percorso": "Refreshments along the route",
  "Mostra bar, forni e alimentari": "Show cafes, bakeries and grocery stores",
  "entro 100 m": "within 100 m", "entro 250 m": "within 250 m", "entro 500 m": "within 500 m",
  "Ricerca ristori…": "Searching refreshments...",
  "Acqua sul percorso": "Water along the route",
  "Ricerca fontane e sorgenti…": "Searching fountains and springs...",
  "aperto": "open", "chiuso": "closed", "orario ignoto": "hours unknown",
  "sul percorso": "on the route",
  "Bar": "Cafe", "Ristorante": "Restaurant", "Panetteria": "Bakery",
  "Alimentari": "Grocery", "Gelateria": "Ice cream", "Fast food": "Fast food",
  "Pub": "Pub", "Ristoro": "Refreshment",
  "vento": "wind", "cielo": "sky",

  /* account */
  "Registrati": "Sign up", "Nome utente": "Username", "Email": "Email",
  "Password (min 6)": "Password (min 6)", "Password": "Password",
  "Non hai un account? Registrati": "No account yet? Sign up",
  "Hai gia un account? Accedi": "Already have an account? Sign in",
  "Accesso...": "Signing in...", "Registrazione...": "Signing up...",
  "Apertura Google...": "Opening Google...",
  "Continua con Google": "Continue with Google", "oppure": "or",
  "Email non valida.": "Invalid email.", "Password troppo corta (min 6).": "Password too short (min 6).",
  "Email gia registrata.": "Email already registered.", "Password errata.": "Wrong password.",
  "Utente non trovato.": "User not found.", "Credenziali errate.": "Wrong credentials.",
  "Troppi tentativi, riprova piu tardi.": "Too many attempts, try again later.",
  "Inserisci un nome utente.": "Enter a username.",
  "Conferma prima la mail (controlla la posta).": "Confirm your email first (check your inbox).",
  "Registrato! Ti ho inviato una mail di conferma. Confermala, poi accedi.":
    "Registered! We sent you a confirmation email. Confirm it, then sign in.",
  "Reinvia conferma": "Resend confirmation",
  "Conferma la mail per votare e recensire.": "Confirm your email to rate and review.",
  "Accedi per votare": "Sign in to rate",

  /* valutazioni e recensioni */
  "Emozione": "Thrill", "Paesaggio": "Scenery", "Asfalto": "Tarmac",
  "Il tuo voto": "Your rating", "Invia voto": "Submit rating",
  "Invia recensione": "Submit review",
  "Racconta in due righe com'e' andata (facoltativo)": "Tell us in two lines how it went (optional)",
  "Cosa dicono i ciclisti": "What cyclists say",
  "Ciclista": "Cyclist", "voti": "ratings",

  /* profilo */
  "Il mio profilo": "My profile", "Giri": "Rides", "Recensioni": "Reviews",
  "Statistiche": "Statistics", "Le mie recensioni": "My reviews",
  "Apri": "Open", "Duplica": "Duplicate", "Elimina": "Delete", "Condividi": "Share",
  "Apri e modifica": "Open and edit",
  "Carico i tuoi giri…": "Loading your rides...",
  "Carico le tue recensioni…": "Loading your reviews...",
  "Calcolo le tue statistiche…": "Computing your statistics...",
  "Giri salvati": "Saved rides", "Totale": "Total", "Passi": "Passes",
  "Nome del giro:": "Ride name:", "Salvataggio…": "Saving...",
  "Accedi per salvare il giro.": "Sign in to save the ride.",
  "Solo voto, nessun commento.": "Rating only, no comment.",
  "Badge": "Badges", "Record personali": "Personal records",
  "Passi conquistati": "Passes conquered",
  "Giro piu' lungo": "Longest ride", "Piu' dislivello": "Most elevation gain",
  "Quota piu' alta toccata": "Highest point reached",
  "Quota massima": "Highest altitude", "Passi diversi": "Different passes",
  "Tutti i livelli raggiunti": "All levels reached",
  "pubblico": "public",

  /* condivisione */
  "Condividi il giro": "Share the ride", "Copia link": "Copy link",
  "Link copiato": "Link copied",
  "Rendi di nuovo privato": "Make private again",
  "Copia nei miei giri": "Copy to my rides",
  "Giro salvato nei tuoi giri": "Ride saved to your rides",
  "Immagine del giro": "Ride image", "Scarica PNG": "Download PNG",
  "Giro condiviso": "Shared ride", "di": "by",

  /* segnalazioni */
  "Segnala informazione": "Report information", "Categoria": "Category",
  "Stato strada": "Road condition", "Chiusura": "Closure", "Consiglio": "Tip",
  "Errore dati": "Data error", "La tua segnalazione": "Your report",
  "Descrivi...": "Describe...", "Il tuo nome (opzionale)": "Your name (optional)",
  "Ciclista anonimo": "Anonymous cyclist", "Invia": "Send", "Annulla": "Cancel",

  /* mappa e varie */
  "Bike Day": "Bike Day",
  "Zooma per vedere le fontanelle": "Zoom in to see the fountains",
  "Traffico veicolare (weekend)": "Vehicle traffic (weekend)",
  "Basso": "Low", "Medio": "Medium", "Alto": "High",
  "Dettagli": "Details", "Servizio non disponibile.": "Service unavailable.",
  "Nessun punto acqua entro 200 m dal percorso.": "No water point within 200 m of the route.",
  "Lingua": "Language",
};

/* Frasi con numeri dentro: si traducono per schema, non per corrispondenza esatta. */
var I18N_RE = [
  [/^Da (\d+) a 10$/, "From $1 to 10"],
  [/^(\d+) tappe$/, "$1 stops"],
  [/^(\d+) recensioni$/, "$1 reviews"],
  [/^Mancano (.+) per «(.+)»$/, "$1 to go for «$2»"],
  [/^Nessun ristoro entro (\d+) m dal percorso\.$/, "No refreshment within $1 m of the route."],
  [/^(\d+) ristori entro (\d+) m$/, "$1 refreshments within $2 m"],
  [/^(\d+) punti acqua/, "$1 water points"],
  [/^Hai scritto (\d+) recension[ei]\.$/, "You wrote $1 reviews."],
  [/^Ci arrivi verso le (.+)$/, "You get there around $1"],
  [/^(\d+) punti acqua · (\d+) proprio sul percorso$/, "$1 water points · $2 right on the route"]
];

/* --------------------------------- motore ---------------------------------- */
function lrT(s) {
  var k = String(s).trim();
  if (!k) return null;
  if (Object.prototype.hasOwnProperty.call(I18N, k)) return I18N[k];
  for (var i = 0; i < I18N_RE.length; i++) {
    if (I18N_RE[i][0].test(k)) return k.replace(I18N_RE[i][0], I18N_RE[i][1]);
  }
  return null;
}

/* Scorre i nodi di testo e gli attributi visibili di un ramo del documento. */
function lrTranslate(root) {
  if (LR_LANG !== "en" || !root) return;
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, CANVAS: 1, SVG: 1 };

  var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: function (n) {
      if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      var p = n.parentNode;
      if (p && SKIP[p.nodeName]) return NodeFilter.FILTER_REJECT;
      if (p && p.closest && p.closest("[data-noi18n]")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  var n, list = [];
  while ((n = walker.nextNode())) list.push(n);
  list.forEach(function (t) {
    var tr = lrT(t.nodeValue);
    if (tr != null) t.nodeValue = t.nodeValue.replace(t.nodeValue.trim(), tr);
  });

  var els = root.querySelectorAll ? root.querySelectorAll("[title],[placeholder],[aria-label],option") : [];
  for (var i = 0; i < els.length; i++) {
    ["title", "placeholder", "aria-label"].forEach(function (a) {
      var v = els[i].getAttribute && els[i].getAttribute(a);
      if (!v) return;
      var tr = lrT(v); if (tr != null) els[i].setAttribute(a, tr);
    });
  }
}

/* Traduce di nuovo quando un pannello viene ridisegnato. Osserviamo solo i
   contenitori dell'interfaccia: la mappa cambia in continuazione e osservarla
   costerebbe prestazioni per nulla. */
var lrPending = null;
function lrScheduleAll() {
  if (LR_LANG !== "en") return;
  if (lrPending) clearTimeout(lrPending);
  lrPending = setTimeout(function () {
    ["#dp", "#rb", "#fp", "#be-panel", "#modal", "#acctModal", "#shareModal", "#cardModal", "#sharedBanner", "#sresults", "#hdr", "#traf-leg", "#fount-hint"]
      .forEach(function (sel) { var el = document.querySelector(sel); if (el) lrTranslate(el); });
  }, 60);
}
function lrObserve() {
  if (!window.MutationObserver) return;
  var obs = new MutationObserver(lrScheduleAll);
  ["#dp", "#rb", "#fp", "#be-panel", "#modal"].forEach(function (sel) {
    var el = document.querySelector(sel);
    if (el) obs.observe(el, { childList: true, subtree: true });
  });
  // finestre create al volo (account, condivisione, immagine) sono figlie di body
  new MutationObserver(lrScheduleAll).observe(document.body, { childList: true });
}

/* --------------------------------- comandi --------------------------------- */
function lrSetLang(lang) {
  LR_LANG = (lang === "en") ? "en" : "it";
  try { localStorage.setItem(LR_KEY, LR_LANG); } catch (e) {}
  document.documentElement.setAttribute("lang", LR_LANG);
  var b = document.getElementById("langBtn");
  if (b) { var l = b.querySelector(".bl"); if (l) l.textContent = LR_LANG === "en" ? "IT" : "EN"; }
  if (LR_LANG === "en") { lrTranslate(document.body); lrScheduleAll(); }
  else location.reload();          // tornare all'italiano: ricarico, e' l'unico modo pulito
}
function toggleLang() { lrSetLang(LR_LANG === "en" ? "it" : "en"); }

(function lrBoot() {
  function go() {
    var saved = null;
    try { saved = localStorage.getItem(LR_KEY); } catch (e) {}
    if (!saved) {                                   // prima visita: seguo la lingua del browser
      var nav = (navigator.language || "it").toLowerCase();
      saved = nav.indexOf("it") === 0 ? "it" : "en";
    }
    LR_LANG = saved === "en" ? "en" : "it";
    document.documentElement.setAttribute("lang", LR_LANG);
    var b = document.getElementById("langBtn");
    if (b) { var l = b.querySelector(".bl"); if (l) l.textContent = LR_LANG === "en" ? "IT" : "EN"; }
    if (LR_LANG === "en") lrTranslate(document.body);
    lrObserve();
    lrScheduleAll();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go);
  else go();
})();
