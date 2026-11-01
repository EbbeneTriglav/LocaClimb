/*
 * i18n.mjs - Italiano / English for v2.
 *
 * Same idea as the classic app (js/i18n.js): the UI is written in Italian and translated AFTER it
 * is drawn, text node by text node, only on an EXACT match with the dictionary or with one of the
 * patterns below. Climb names, comments and place names never match an interface label, so they are
 * left alone; elements marked data-noi18n (and climb names, .nm / h1) are skipped anyway.
 * A label missing from the dictionary stays in Italian: nothing breaks.
 * Same setting as the classic app (localStorage "locaride_lang"): switch once, both follow.
 * translate() is pure and tested (test/v2-i18n.test.mjs).
 */
export const LANG_KEY = "locaride_lang";

export const DICT = {
  // shell, map, filters
  "Cerca salita, passo o località": "Search a climb, pass or place", "Mappa delle salite": "Climbs map",
  "Filtri": "Filters", "Tutte": "All", "Dure 8+": "Hard 8+", "Scoperte": "Discovered", "Solo asfalto": "Paved only",
  "Pochi camion": "Few trucks", "Zona ▾": "Zone ▾", "Zona": "Zone", "Tutte le zone": "All zones",
  "Le salite vicino a un confine possono stare nella zona del Paese accanto.": "Climbs near a border may sit in the neighbouring country's zone.",
  "Difficoltà": "Difficulty", "Legenda difficoltà": "Difficulty legend", "Avvicina": "Zoom in", "Allontana": "Zoom out",
  "Nord in alto": "North up", "Rilievo 3D": "3D relief", "Centra sulla mia posizione": "Center on my position",
  "Acqua e bar": "Water and bars", "Acqua e bar sulla mappa": "Water and bars on the map", "Avvicinati per vedere acqua e bar": "Zoom in to see water and bars",
  "Località": "Places", "Sezioni": "Sections", "Mappa": "Map", "Oggi": "Today", "Giro": "Ride", "Diario": "Diary", "Classica": "Classic",
  "Nessuna salita qui": "No climbs here", "le più dure": "the hardest", "sposta o allarga la mappa": "move or zoom out the map",
  "Zoom indietro o cambia filtro.": "Zoom out or change filter.", "Finestra": "Window", "Chiudi": "Close", "Link copiato": "Link copied",
  "Paesi": "Countries",
  // countries (zone menu)
  "Italia": "Italy", "Austria": "Austria", "Svizzera": "Switzerland", "Francia": "France", "Germania": "Germany", "Spagna": "Spain",
  "Slovenia": "Slovenia", "Croazia": "Croatia", "Belgio": "Belgium", "Bosnia ed Erzegovina": "Bosnia and Herzegovina", "Cechia": "Czechia",
  "Grecia": "Greece", "Irlanda": "Ireland", "Marocco": "Morocco", "Montenegro, Albania, Macedonia": "Montenegro, Albania, Macedonia",
  "Norvegia": "Norway", "Paesi Bassi e Lussemburgo": "Netherlands and Luxembourg", "Polonia": "Poland", "Portogallo": "Portugal",
  "Regno Unito": "United Kingdom", "Romania": "Romania", "Serbia": "Serbia", "Slovacchia": "Slovakia", "Svezia": "Sweden", "Turchia": "Turkey",
  "Ungheria": "Hungary", "Bulgaria": "Bulgaria", "Andorra": "Andorra", "Estonia": "Estonia", "Finlandia": "Finland", "Lettonia": "Latvia", "Lituania": "Lithuania",
  // climb page
  "Carico la salita…": "Loading the climb…", "Salita non trovata.": "Climb not found.", "Torna alla mappa": "Back to the map",
  "Di questa salita non abbiamo ancora i versanti.": "We don't have the sides of this climb yet.", "Condividi": "Share",
  "Salita": "Climb", "stagionale": "seasonal", "Versante": "Side", "km": "km", "media": "avg", "metri": "metres", "max": "max",
  "IL VERDETTO DI OGGI": "TODAY'S VERDICT", "IL VERDETTO DI OGGI · IN CIMA": "TODAY'S VERDICT · AT THE TOP",
  "Carico il meteo in quota…": "Loading mountain weather…", "Meteo non disponibile in questo momento.": "Weather not available right now.",
  "Ideale": "Ideal", "Pioggia": "Rain", "Temporali": "Thunderstorms", "Vento": "Wind", "Freddo": "Cold",
  "Ideale tutto il giorno": "Ideal all day", "Vento forte": "Strong wind", "Freddo in quota": "Cold at altitude", "Variabile": "Changeable",
  "Meteo non disponibile": "Weather not available",
  "Niente temporali, vento e temperatura nella norma in quota.": "No storms, normal wind and temperature at the top.",
  "Guarda la fascia oraria qui sotto prima di partire.": "Check the hours below before you leave.",
  "Condizioni ora per ora dalle 7 alle 19": "Hour by hour, 7 am to 7 pm",
  "Road book": "Road book", "KM": "KM", "PENDENZA": "GRADIENT", "QUOTA": "ALTITUDE",
  "Acqua e ristori sulla salita": "Water and food on the climb", "Cerco fontane e bar lungo la strada…": "Looking for fountains and bars along the road…",
  "Dati non ancora disponibili in questa zona.": "No data for this area yet.",
  "Nessun punto acqua mappato entro 100 m: parti con le borracce piene.": "No water point mapped within 100 m: leave with full bottles.",
  " · nessun bar lungo la salita": " · no bar along the climb", "Acqua potabile": "Drinking water", "Rubinetto": "Tap", "Sorgente": "Spring",
  "Fontana": "Fountain", "Bar": "Bar", "Ristorante": "Restaurant", "Gelateria": "Ice cream", "Forno": "Bakery", "Alimentari": "Grocery",
  "Meteo 7 giorni in cima": "7-day weather at the top", "Meteo non disponibile ora.": "Weather not available now.", "Carico…": "Loading…",
  "Sereno": "Clear", "Nuvoloso": "Cloudy", "Nebbia": "Fog", "Pioviggine": "Drizzle", "Neve": "Snow", "Rovesci": "Showers",
  "Esposizione": "Exposure", "Fondo": "Surface", "Km più duro": "Hardest km", "Da sapere": "Good to know",
  "Asfalto": "Paved", "Sterrato/gravel": "Gravel", "Nord": "North", "Sud": "South", "Est": "East", "Ovest": "West",
  "Nord-Est": "North-East", "Nord-Ovest": "North-West", "Sud-Est": "South-East", "Sud-Ovest": "South-West",
  "Traffico feriale / weekend": "Traffic weekdays / weekend", "Camion": "Trucks", "Niente camion": "No trucks", "Camion rari": "Few trucks",
  "Possibili camion": "Trucks possible", "Camion frequenti": "Frequent trucks", "basso": "low", "medio": "medium", "alto": "high",
  "Bike Day: strada solo per bici": "Bike Day: road for bikes only", "News e stato della strada": "News and road status",
  "Valutazioni della community": "Community ratings", "Non disponibili ora.": "Not available now.",
  "Ancora nessun voto: il primo è tuo.": "No votes yet: be the first.", "Emozione": "Thrill", "Paesaggio": "Scenery", "Traffico": "Traffic",
  "Il tuo voto": "Your vote", "Il tuo voto (puoi cambiarlo)": "Your vote (you can change it)", "Commento": "Comment", "Invia voto": "Send vote",
  "Grazie, voto salvato.": "Thanks, vote saved.", "Dai un voto da 1 a 5 a tutte e quattro le voci.": "Rate all four items from 1 to 5.",
  "Accedi per votare": "Sign in to vote", "Conferma la tua email per votare": "Confirm your email to vote",
  "Segnala un errore": "Report a mistake", "Segnala un errore su questa salita": "Report a mistake on this climb", "Segnala informazione": "Report information",
  "Cosa non va": "What's wrong", "Il tracciato è sbagliato": "The track is wrong", "Manca un versante": "A side is missing",
  "Strada chiusa o rovinata": "Road closed or damaged", "Numeri sbagliati (km, quota, pendenza)": "Wrong numbers (km, altitude, gradient)", "Altro": "Other",
  "Dettagli": "Details", "Invia segnalazione": "Send report", "Accedi per segnalare": "Sign in to report",
  "Es.: da Mazzo la salita parte dal paese e sale diretta, qui passa da Grosio.": "E.g. from Mazzo the climb starts in the village and goes straight up, here it goes through Grosio.",
  "Scrivi cosa non va (almeno qualche parola).": "Write what's wrong (a few words at least).",
  "Segmenti Strava": "Strava segments", "Cerca segmenti": "Find segments", "Tornanti e tempi di salita": "Hairpins and climbing times",
  "Tornanti": "Hairpins", "I tuoi W/kg": "Your W/kg", "Tu": "You", "Versanti a confronto": "Sides compared",
  "Avvia modalità salita": "Start climb mode", "GPX": "GPX", "+ Giro": "+ Ride",
  // account
  "Accedi": "Sign in", "Accedi con Google": "Sign in with Google", "oppure con la tua email": "or with your email", "Email": "Email", "Password": "Password",
  "Password dimenticata?": "Forgot password?", "Password dimenticata": "Forgot password", "Crea un account": "Create an account", "Torna all'accesso": "Back to sign in",
  "Nome (facoltativo)": "Name (optional)", "Crea account": "Create account", "Invia link": "Send link",
  "Hai già l'account nell'app classica? È lo stesso: se sei collegato lì, lo sei anche qui.": "Already have an account in the classic app? It's the same one: signed in there, signed in here.",
  "Account creato: conferma la mail dal link che ti abbiamo mandato, poi potrai votare.": "Account created: confirm your email from the link we sent, then you can vote.",
  "Ti abbiamo mandato un link per scegliere una nuova password.": "We sent you a link to choose a new password.",
  "Indirizzo email non valido.": "Invalid email address.", "Nessun account con questa email.": "No account with this email.", "Password sbagliata.": "Wrong password.",
  "Email o password sbagliate.": "Wrong email or password.", "Esiste già un account con questa email: accedi.": "An account with this email already exists: sign in.",
  "Password troppo corta: almeno 6 caratteri.": "Password too short: at least 6 characters.", "Troppi tentativi: riprova tra qualche minuto.": "Too many attempts: try again in a few minutes.",
  "Finestra di accesso chiusa.": "Sign-in window closed.", "Accesso non riuscito.": "Sign-in failed.", "Accesso non disponibile": "Sign-in not available",
  "Controllo l'accesso…": "Checking sign-in…", "Esci": "Sign out",
  // ride mode
  "Modalità salita": "Climb mode", "Alla cima": "To the top", "Dislivello che manca": "Climbing left", "Prossimo km": "Next km", "Cima": "Top",
  "Cerco la tua posizione…": "Finding your position…", "Posizione non disponibile: attiva il GPS o usa il cursore qui sotto.": "Position not available: turn on GPS or use the slider below.",
  "Prova senza GPS: sposta il cursore lungo la salita": "Try without GPS: move the slider along the climb",
  // oggi
  "Oggi si sale": "Ride today", "Cerco le salite intorno a te…": "Looking for climbs around you…", "Entro 60 km da te": "Within 60 km of you",
  "Intorno al centro della mappa": "Around the map centre", "Le salite più belle vicino a te, ordinate per meteo in cima: temporali, pioggia, vento e freddo.": "The best climbs near you, sorted by weather at the top: storms, rain, wind and cold.",
  "Nessuna salita dura entro 120 km: sposta la mappa su una zona di montagna e riapri Oggi.": "No hard climb within 120 km: move the map to a mountain area and reopen Today.",
  "Meteo non disponibile ora. Riprova tra poco.": "Weather not available now. Try again shortly.", "Domani": "Tomorrow", "Dopodomani": "Day after tomorrow",
  // diario
  "Le tue salite": "Your climbs", "Carica i tuoi giri": "Upload your rides", "Non riesco a leggere le tue salite ora.": "Can't read your climbs right now.",
  "Qui compaiono le salite che hai fatto davvero, con i tempi registrati dal tuo dispositivo.": "Here you see the climbs you really rode, with the times recorded by your device.",
  "Ancora nessuna. Carica i tuoi giri: un GPX o FIT, oppure lo zip dell'export completo di Strava o Garmin Connect.": "None yet. Upload your rides: a GPX or FIT, or the zip of your full Strava or Garmin Connect export.",
  "salite": "climbs", "passaggi": "efforts", "m la più alta": "m the highest", "Dove": "Where",
  // giro (route builder)
  "Il tuo giro": "Your ride", "nessuna tappa": "no stops", "Partenza": "Start", "Arrivo": "Finish", "Sposta su": "Move up", "Sposta giù": "Move down",
  "Togli tappa": "Remove stop", "Tipo di strada": "Road type", "Anche sterrato": "Gravel ok", "Più corto": "Shortest",
  "Calcolo il percorso…": "Calculating the route…", "Percorso non trovato: sposta una tappa su una strada.": "No route found: move a stop onto a road.",
  "Aggiungi almeno un'altra tappa.": "Add at least one more stop.",
  "Tocca la mappa per mettere la partenza, poi le tappe. Puoi toccare anche una salita, o usare «+ Giro» nella sua scheda.": "Tap the map to set the start, then the stops. You can also tap a climb, or use «+ Ride» on its page.",
  "in sella": "riding", "quota max": "top", "Profilo del giro": "Ride profile", "Salite sul percorso": "Climbs on the route",
  "Meteo lungo il giro": "Weather along the ride", "Giorno": "Day", "Ora": "Time", "Temp.": "Temp.", "fuori previsione": "beyond the forecast",
  "Punto più alto": "Highest point", "Acqua lungo il giro": "Water along the ride", "Cerco fontane vicino alla strada…": "Looking for fountains near the road…",
  "Nel GPX con punti utili trovi questi punti e le cime delle salite.": "The GPX with useful points has these and the climb summits.",
  "GPX con punti utili": "GPX with useful points", "Svuota": "Clear", "Percorso di riserva (OSRM): senza quote né fondo.": "Fallback route (OSRM): no elevation or surface.",
  "asfalto": "paved", "sterrato": "gravel", "naturale": "natural", "altro": "other", "Massimo 30 tappe": "30 stops at most",
  "Manda al dispositivo": "Send to device", "Il tuo dispositivo": "Your device", "Dispositivo": "Device", "Condividi con un'app": "Share with an app",
  "Scarica il GPX": "Download the GPX", "Strava o Komoot": "Strava or Komoot",
  "Dati da verificare": "Data to be checked", "Segnala com'è davvero": "Tell us what it's really like",
  "Garmin non accetta file inviati da un sito: scarica il GPX, poi su Garmin Connect (meglio dal computer) apri Allenamento e pianificazione → Percorsi → Importa e scegli il file; infine «Invia al dispositivo». Più comodo: collega Garmin a Komoot o Strava, i percorsi arrivano da soli.": "Garmin does not accept files sent by a website: download the GPX, then on Garmin Connect (best from a computer) open Training & Planning → Courses → Import and pick the file; then «Send to device». Easier: link Garmin to Komoot or Strava and routes arrive by themselves.",
  "Dal telefono: «Condividi con un'app» e scegli Wahoo ELEMNT; il percorso arriva al ciclocomputer alla prossima sincronizzazione. In alternativa scarica il GPX e aprilo con l'app ELEMNT.": "From the phone: «Share with an app» and pick Wahoo ELEMNT; the route reaches the bike computer at the next sync. Or download the GPX and open it with the ELEMNT app.",
  "Scarica il GPX e caricalo nella dashboard Hammerhead (Percorsi → Importa): il Karoo lo scarica da solo.": "Download the GPX and upload it to the Hammerhead dashboard (Routes → Import): the Karoo downloads it by itself.",
  "Scarica il GPX e importalo su Komoot: se il ciclocomputer è collegato a Komoot, il percorso arriva da solo.": "Download the GPX and import it into Komoot: if your bike computer is linked to Komoot, the route arrives by itself.",
  "Scarica il GPX e importalo come percorso su Strava: se il ciclocomputer è collegato a Strava, il percorso arriva da solo.": "Download the GPX and import it as a route on Strava: if your bike computer is linked to Strava, the route arrives by itself.",
  "Bryton, Coros, Sigma, Apple Watch...: «Condividi con un'app» e scegli l'app del tuo dispositivo, oppure scarica il GPX e aprilo con lei.": "Bryton, Coros, Sigma, Apple Watch...: «Share with an app» and pick your device's app, or download the GPX and open it with it.",
  "GPX scaricato": "GPX downloaded", "Apri Garmin Connect": "Open Garmin Connect", "Apri la dashboard": "Open the dashboard", "Apri Komoot": "Open Komoot", "Apri Strava": "Open Strava",
  // profile (app.mjs renderDiario)
  "Profilo": "Profile", "Il tuo profilo": "Your profile", "Accedi o crea un account": "Sign in or create an account", "Esci": "Sign out",
  "Con un account ritrovi le salite che hai fatto davvero con i tuoi tempi, salvi i giri, voti le salite e ne proponi di nuove. Gratis.": "With an account you get back the climbs you really rode with your times, save rides, rate climbs and suggest new ones. Free.",
  "Impostazioni": "Settings", "Lingua": "Language", "Watt per kg": "Watts per kg", "per i tempi stimati in salita": "for the estimated climbing times", "Salvato": "Saved",
  // share the ride (app.mjs shareGiroDialog)
  "Condividi il giro": "Share the ride", "Link del giro": "Link to the ride", "Chi lo apre vede lo stesso percorso in LocaRide": "Whoever opens it sees the same route in LocaRide",
  "Immagine": "Image", "Per Instagram, WhatsApp, Strava: tracciato, profilo e numeri": "For Instagram, WhatsApp, Strava: route, profile and numbers",
  "Road book da stampare": "Printable road book", "Una pagina A4 con profilo, salite, orari, acqua e meteo. Anche in PDF": "One A4 page with profile, climbs, times, water and weather. PDF too",
  "Preparo l'immagine…": "Preparing the image…", "Scarica": "Download", "Road book scaricato: aprilo e stampa": "Road book downloaded: open it and print",
  // main roads overlay (app.mjs setTraffic)
  "Strade trafficate": "Busy roads", "Strade": "Roads", "autostrade": "motorways", "statali": "main roads", "provinciali": "secondary",
  "Autostrade, statali e provinciali principali in evidenza, su ogni mappa: di solito più auto e camion. È la classe della strada, non un conteggio del traffico.": "Motorways, main and secondary roads highlighted on any map: usually more cars and trucks. It is the road class, not a traffic count.",
  // sun and shade (app.mjs fillShade)
  "Sole e ombra": "Sun and shade", "Pieno sole": "Full sun", "Poca ombra": "Little shade", "Ombra a tratti": "Shade in places", "Molta ombra": "Lots of shade", "Quasi sempre ombra": "Shade almost all the way",
  "Ombra media sul tracciato nelle ore di luce: rilievi intorno, bosco (con le foglie della stagione) ed esposizione del versante.": "Average shade on the road during daylight: surrounding terrain, forest (with the season's leaves) and the slope's aspect.",
  // install (app.mjs: card, Diario, dialog)
  "LocaRide sul telefono": "LocaRide on your phone", "App LocaRide": "LocaRide app", "Dalla Home, a tutto schermo": "From your home screen, full screen",
  "Installa": "Install", "Come fare": "How to", "Non ora": "Not now", "Installa LocaRide": "Install LocaRide", "Come installarla": "How to install it",
  "App sul telefono": "App on your phone", "Icona nella schermata Home, a tutto schermo, più veloce ad aprirsi.": "An icon on your home screen, full screen, quicker to open.",
  "Tocca": "Tap", "Condividi, nella barra del browser": "Share, in the browser bar", "Scorri e scegli": "Scroll and choose",
  "Aggiungi alla schermata Home": "Add to Home Screen", "Conferma con": "Confirm with", "Aggiungi": "Add",
  "Apri il menu del browser": "Open the browser menu", "Scegli": "Choose", "Installa app": "Install app", "(o «Aggiungi a schermata Home»)": "(or «Add to Home screen»)",
  "Se nel menu c'è «Apri app», LocaRide è già installata: aprila dall'icona.": "If the menu says «Open app», LocaRide is already installed: open it from its icon.",
  "Si apre dall'icona, a tutto schermo, e ricorda le ultime salite anche con poco campo.": "It opens from its icon, full screen, and keeps your latest climbs even with poor signal.",
  "Installata: la trovi nella schermata Home": "Installed: you'll find it on your home screen",
  "I miei giri": "My rides", "Salva": "Save", "Salva il giro": "Save the ride", "Nome": "Name", "Annulla": "Cancel", "Apri": "Open", "Elimina": "Delete", "Conferma": "Confirm",
  "Giro salvato nel Diario": "Ride saved in the Diary", "Non riesco a leggere i tuoi giri ora.": "Can't read your rides right now.", "Non eliminato": "Not deleted",
  "Nessun giro salvato. Costruiscilo nella scheda Giro e premi «Salva».": "No saved rides. Build one in the Ride tab and press «Save».", "Traccia non valida": "Invalid track",
  "Mappe": "Maps", "Notte+": "Night+", "Chiara": "Light", "Ciclabile": "Cycling", "Topografica": "Topographic", "Satellite": "Satellite",
  "di partenza": "default", "di giorno": "daytime", "per il Giro": "for rides", "terreno": "terrain", "dall'alto": "from above",
  "Nel Giro la mappa passa da sola a Ciclabile; uscendo torna la tua.": "In the Ride tab the map switches to Cycling by itself; leaving it brings yours back.",
  "Proponi salita": "Suggest a climb", "Proponi una salita": "Suggest a climb", "Proposte su invito": "Invite-only", "Ho capito": "Got it",
  "In beta le proposte sono aperte ai tester autorizzati. Scrivici se vuoi partecipare: l'account ce l'hai già, serve solo l'abilitazione.": "During beta, suggestions are open to approved testers. Get in touch if you want in: you have the account, you just need to be enabled.",
  "Il tracciato è il Giro che hai disegnato, dalla base alla cima. Pendenze e quote le ricalcoliamo noi.": "The track is the ride you drew, from the base to the top. We recompute gradients and elevations.",
  "Nome della salita": "Climb name", "Da dove si sale": "Which side", "Note per chi controlla (facoltative)": "Notes for the reviewer (optional)", "Invia proposta": "Send suggestion",
  "Manca il nome della salita.": "The climb name is missing.", "Proposta inviata · la trovi nel Diario": "Suggestion sent · you'll find it in the Diary",
  "Le mie proposte": "My suggestions", "Non riesco a leggere le tue proposte ora.": "Can't read your suggestions right now.", "Pubblicata": "Published", "Non accolta": "Declined", "In revisione": "Under review",
  "Ritira": "Withdraw", "Non ritirata": "Not withdrawn", "Livello massimo. Grazie.": "Top level. Thank you.", "Le proposte sono su invito durante la beta.": "Suggestions are invite-only during the beta.",
  "Nessuna proposta ancora. Disegna nel Giro una salita che manca (dalla base alla cima) e premi «Proponi salita».": "No suggestions yet. Draw a missing climb in the Ride tab (base to top) and press «Suggest a climb».",
  "Vedi": "Show", "Approva": "Approve", "Rifiuta": "Reject", "Conferma rifiuto": "Confirm rejection", "Approvata": "Approved", "Rifiutata": "Rejected", "Non salvata": "Not saved", "Coda vuota.": "Queue is empty.",
  "Foresto": "Out-of-Towner", "Turista del pedale": "Pedal Tourist", "Cane Sciolto": "Stray Dog", "Servono le quote: ricalcola il percorso": "Elevations needed: recompute the route",
  "Il mio giro · LocaRide": "My ride · LocaRide",
  "Stima: VAM da W/kg (formula di Ferrari) e velocità tratto per tratto sul profilo. Vento, peso e stanchezza non contano.": "Estimate: VAM from W/kg (Ferrari's formula) and speed stretch by stretch on the profile. Wind, weight and fatigue are not counted."
};

/* dynamic labels: [pattern, replacement] - checked in order, on the whole (trimmed) text */
export const RULES = [
  [/^([\d.,]+) salite qui$/, "$1 climbs here"],
  [/^Difficoltà (\d+)\/10$/, "Difficulty $1/10"],
  [/^cat\. (.+)$/, "cat. $1"],
  [/^Da (.+)$/, "From $1"],
  [/^Versante (\d+)$/, "Side $1"],
  [/^Tappa (\d+)$/, "Stop $1"],
  [/^(\d+) tapp[ae]$/, (m, n) => n + (n === "1" ? " stop" : " stops")],
  [/^Aggiunta al giro · (\d+) tapp[ae]$/, (m, n) => `Added to the ride · ${n} ${n === "1" ? "stop" : "stops"}`],
  [/^Ideale (\d+)–(\d+)$/, "Ideal $1–$2"],
  [/^Finestra breve (\d+)–(\d+)$/, "Short window $1–$2"],
  [/^Temporali dalle (\d+)$/, "Storms from $1:00"],
  [/^Parti entro le (\d+):00$/, "Leave by $1:00"],
  [/^Dalle (\d+) sale il rischio temporali\.$/, "Storm risk rises from $1:00."],
  [/^km (\S+)$/, "km $1"],
  [/^(\S+) m dalla strada$/, "$1 m from the road"],
  [/^Passo a (\d+) m$/, "Pass at $1 m"], [/^Colle a (\d+) m$/, "Col at $1 m"], [/^Salita a (\d+) m$/, "Climb at $1 m"],
  [/^punti acqua entro 100 m$/, "water points within 100 m"],
  [/^bar o ristori lungo la salita$/, "bars or food along the climb"],
  [/^bar o ristori lungo la salita \(più (\d+) in partenza\)$/, "bars or food along the climb (plus $1 at the start)"],
  [/^\(più (\d+) in partenza\)$/, "(plus $1 at the start)"],
  [/^Tempo stimato a (\S+) W\/kg(.*)$/, (m, w, rest) => `Estimated time at ${w} W/kg${rest.replace("(impostalo nella scheda di una salita)", "(set it on a climb page)").replace("soste escluse.", "stops excluded.")}`],
  [/^(\d+) (voti|voto)$/, (m, n) => n + (n === "1" ? " vote" : " votes")],
  [/^Non sei su questa salita: sei a (.+) km dalla strada\.$/, "You're not on this climb: you're $1 km from the road."],
  [/^Voto non salvato: (.*)$/, "Vote not saved: $1"],
  [/^Non inviata: (.*)$/, "Not sent: $1"],
  [/^tratto più lungo senza:$/, "longest stretch without:"],
  [/^Ancora ([\d.]+) salit[ae] accettat[ae] per diventare (.+)$/, (m, n, l) => `${n} more accepted climb${n === "1" ? "" : "s"} to become ${l}`],
  [/^Da rivedere \((\d+)\)$/, "To review ($1)"],
  [/^Tracciato troppo corto: servono almeno (.+) km e (.+) m di dislivello\.$/, "Track too short: at least $1 km and $2 m of gain."],
  [/^(\d+) (giri salvati|giro salvato)$/, (m, n) => n + (n === "1" ? " saved ride" : " saved rides")],
  [/^(.+) · lo ritrovi nel Diario, anche nell'app classica\.$/, "$1 · you'll find it in the Diary, in the classic app too."],
  [/^Non salvato: (.*)$/, "Not saved: $1"],
  [/^([12]) · (Scarica il GPX)$/, (m, n) => n + " · Download the GPX"],
  [/^2 · Apri (.+)$/, (m, x) => "2 · Open " + x.replace(/^la dashboard$/, "the dashboard")],
  [/^(.+): il file va direttamente all'app che scegli\.$/, "$1: the file goes straight to the app you pick."],
  [/^(.+): nessun sito può inviare il file da solo a questo servizio: servono questi due passaggi\.$/, "$1: no website can send the file to this service by itself: these two steps are needed."],
  [/^Pendenze non credibili per una strada asfaltata \((.+)\): probabile errore .*$/, (m, x) => `Gradients not credible for a paved road (${x.replace("media", "avg").replace(" su ", " over ")}): most likely a terrain-model error (tunnel, bridge) or a stretch that is not a paved road. That is why it is not among the hardest climbs.`]
];

function one(s) {
  if (Object.prototype.hasOwnProperty.call(DICT, s)) return DICT[s];
  for (const [re, rep] of RULES) if (re.test(s)) return s.replace(re, rep);
  return null;
}
/* pure: Italian label -> English, or the input unchanged. Keeps surrounding spaces; a " · "-joined
   label is translated piece by piece when the whole is not known. */
export function translate(s) {
  if (typeof s !== "string") return s;
  // "· 17 m dalla strada", "punti acqua entro 100 m ·": the separator belongs to the layout, not the label
  const m = /^(\s*(?:·\s+)?)([\s\S]*?)((?:\s+·)?\s*)$/.exec(s), core = m[2];
  if (!core) return s;
  let t = one(core);
  if (t == null && core.includes(" · ")) {
    const parts = core.split(" · "), out = parts.map((p) => one(p) ?? p);
    if (out.some((p, i) => p !== parts[i])) t = out.join(" · ");
  }
  return t == null ? s : m[1] + t + m[3];
}

/* ---------------------------------------------------------------- DOM side */
export function getLang() {
  try { const v = localStorage.getItem(LANG_KEY); if (v === "it" || v === "en") return v; } catch { /* private mode */ }
  return /^it\b/i.test(navigator.language || "it") ? "it" : "en";
}
export function setLang(l) { try { localStorage.setItem(LANG_KEY, l); } catch { /* private mode */ } }

const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "SELECT"]);
function skipEl(el) { return !el || SKIP.has(el.tagName) || el.closest("[data-noi18n], .nm, h1, .maplibregl-canvas-container"); }
export function translateTree(root) {
  if (!root) return;
  if (root.nodeType === 3) { if (!skipEl(root.parentElement)) { const t = translate(root.nodeValue); if (t !== root.nodeValue) root.nodeValue = t; } return; }
  if (root.nodeType !== 1 || skipEl(root)) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (skipEl(n.parentElement)) continue;
    const t = translate(n.nodeValue); if (t !== n.nodeValue) n.nodeValue = t;
  }
  for (const el of [root, ...root.querySelectorAll("[placeholder],[aria-label],[title]")]) {
    for (const a of ["placeholder", "aria-label", "title"]) {
      const v = el.getAttribute && el.getAttribute(a);
      if (v) { const t = translate(v); if (t !== v) el.setAttribute(a, t); }
    }
  }
}
let obs = null;
export function startI18n(lang) {
  document.documentElement.lang = lang;
  if (lang !== "en") return;
  translateTree(document.body);
  obs = new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) translateTree(n); });
  obs.observe(document.body, { childList: true, subtree: true });
}
