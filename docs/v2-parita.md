# v1 → v2: cosa c'è, cosa manca, cosa non funzionava

Obiettivo: spegnere la v1 quando la v2 fa tutto quello che serviva della v1, e lo fa bene.
Aggiornato al 30/10/2026 (dopo la PR "v2 parity 2"). Verifica v1 fatta su locaride.app dal vivo
(scheda dello Stelvio, console del browser), salvo dove scritto "non provato".

## Scheda salita

| Funzione v1 | v1 | v2 |
|---|---|---|
| Profilo colorato per pendenza, versanti, GPX per versante | ok | ✅ (profilo alle distanze vere, come la v1) |
| Road book km per km | – | ✅ nuovo |
| Tornanti + tempi a 2-5 W/kg + "il tuo tempo" | ok | ✅ stessi modelli, stessa impostazione W/kg condivisa con la v1 |
| Confronto versanti | ok | ✅ distanza, dislivello, media, max, esposizione |
| Acqua sulla salita (entro 100 m) | ok | ✅ stessi riquadri POI + bar e ristori lungo la salita |
| Meteo 7 giorni | ok | ✅ in cima, con quota |
| Verdetto di oggi + fascia 7-19 | – | ✅ nuovo |
| Traffico feriale / weekend, camion | ⚠️ mostra 4/6 anche quando il dato non c'è (valore inventato) | ✅ solo se il dato esiste |
| Consigli e descrizione (salite curate) | ok | ✅ |
| Bike Day della salita | ok | ✅ |
| News e stato strada | ok (nessuna news oggi) | ✅ |
| Valutazioni community | ok (lettura e voto) | ✅ lettura, voto (stessa transazione della v1), ultimi commenti |
| Strava: segmenti noti | link ai 6 segmenti | ✅ |
| Strava: "Cerca segmenti" | ❌ **non funziona**: Strava ha chiuso la pagina pubblica di ricerca segmenti | ⏭️ torna con il collegamento Strava (API segments/explore) |
| Sole / ombra (indice di ombra) | ⚠️ "n/d" sullo Stelvio | ⏭️ da portare, prima va capito perché è n/d |
| Segnala informazione | ❌ **finto**: mostra "Grazie!" ma non invia niente | ✅ invia davvero (`reports`), regole in `firestore.rules` |
| Modalità salita (manubrio) | – | 🅿️ in soffitta (31/10): sostituita da **Manda al dispositivo** (condivisione del GPX con Garmin Connect, Wahoo, Karoo, Strava, Komoot + istruzioni per dispositivo); il codice resta, spento |

## Mappa

| Funzione v1 | v1 | v2 |
|---|---|---|
| Salite colorate, filtri | ok (regione, difficoltà, stato, camion) | ✅ difficoltà (8+, 10/10), "Scoperte", **Solo asfalto**, **Pochi camion**, **Zona** (Paese della zona dati). Stato (chiuso/stagionale) solo per i 24 passi curati: per gli OSM il dato non esiste |
| Ricerca salite | ok | ✅ |
| Ricerca località (paesi) | ok | ✅ nella stessa barra (Nominatim, come la v1) |
| Strati acqua 💧 e cibo 🍽️ sulla mappa | ok | ✅ bottone goccia, da zoom 11 (acqua azzurra, bar bianchi) |
| Strato traffico | presente (non provato) | ⏭️ |
| Mappe di base (Topo, ecc.) | ok | ✅ bottone «Mappe»: Notte+ (di partenza, strade leggibili), Chiara, Ciclabile (CyclOSM), Topografica (OpenTopoMap), Satellite (Sentinel-2 2016); nel Giro passa da sola a Ciclabile |
| Lingua inglese 🌐 | ok | ✅ bottone EN/IT nella pila della mappa, stessa impostazione della v1 (default: lingua del browser). Descrizioni e consigli dei passi curati restano in italiano (sono dati) |
| Errori in console `getMinZoom` (ripetuti) | ❌ bug v1 | – |
| Doppioni dello stesso passo (stesso id da due file, gemelli OSM con nome uguale a ~1 km) | 🟡 unisce entro 800 m: il Mortirolo resta doppio | ✅ unisce anche per nome entro ~2 km |
| Tutti i versanti disegnati sulla mappa | ok | ✅ (prima la v2 disegnava solo quello scelto) |

## Percorsi e account

| Funzione v1 | v1 | v2 |
|---|---|---|
| Route builder (waypoint, calcolo, asfalto/gravel) | presente (non provato fino in fondo) | ✅ scheda **Giro**: tappe toccando la mappa o una salita («+ Giro» nella scheda), trascinabili, ordine ↑↓; BRouter (Solo asfalto / Anche sterrato / Più corto) con riserva OSRM; linea colorata per pendenza, sterrato tratteggiato; km, dislivello, tempo stimato (W/kg), profilo, fondo %, salite sul percorso; link condivisibile `#/giro?p=…` |
| GPX + punti utili, roadbook stampabile, immagine da condividere | presenti (non provati) | 🟡 GPX con cime e acqua come waypoint; roadbook stampabile e immagine ⏭️ |
| Meteo del percorso (vento lungo il giro) | presente (non provato) | ✅ partenza, ogni salita, punto più alto e arrivo all'ora in cui ci passi (oggi/domani/dopodomani, ora di partenza); acqua lungo il giro e tratto più lungo senza |
| Importa GPX / Le mie salite (GPX, FIT, zip) | ok | 🟡 il Diario le mostra; l'import si fa ancora dalla v1 |
| I miei giri | presente | ✅ «Salva» nel Giro, elenco nel Diario (apri, manda al dispositivo, elimina); stessi dati della v1 (users/{uid}/routes) |
| Accesso Google | ok | ✅ condiviso con la v1 |
| Accesso con email | presente | ✅ accesso, nuovo account con conferma mail, password dimenticata |
| Proponi salita + revisione admin, livelli e badge | presenti | ✅ «Proponi salita» nel Giro (tester abilitati), «Le mie proposte» con livello e barra nel Diario, coda «Da rivedere» per l’admin (vedi, approva, rifiuta con motivo); stessi documenti della v1 |
| Revisione salite trovate (`?discover=`) | ok | resta nella v1 finché serve (strumento admin) |

## Errori nei DATI (v1 e v2 uguali: non dipendono dall'interfaccia)
- **Mortirolo da Mazzo e da Tovo** passano da Grosio (20-22 km) invece di salire diretti dalla
  "Strada del Mortirolo" (12,4 km, asfaltata e continua in OSM). Causa: nel calcolo dei versanti
  curati (`build_osm_passes.mjs`, `edgeExtra`) le strade `unclassified` costano +120%, per evitare la
  mulattiera "Dritta Contador": la strada di Mazzo è `unclassified`, quindi il percorso "più
  economico" diventa la provinciale di Grosio. Anche il golden set ha registrato i 20,3 km.
  Correzione proposta: limitare la deviazione (se il percorso preferito è più lungo del 30% del
  più corto, si tiene il più corto salvo sterrato), rilanciare osm-refresh, poi Rick approva il
  nuovo golden.

## Ordine proposto delle prossime PR v2
1. **Import giri dentro la v2** (GPX/FIT/zip, riusa `js/rideimport.js`) + **I miei giri**.
2. ~~**Route builder v2**~~ fatto (PR `v2-giro`). Restano roadbook stampabile e immagine del giro.
3. **Mappa**: ✅ ricerca località, acqua/bar, Solo asfalto, nomi generici ("Passo" → "Passo a 2959 m"). Restano filtri regione/stato/camion e lingua EN.
4. **Proposte salite, livelli, badge** → poi si spegne la v1 (la v2 va su `/`, la v1 resta su `/classica/` per un mese).

## Salite con pendenze non credibili (31/10/2026)
Regola (`scripts/lib/plausible.mjs`, uguale in `v2/lib/climb.mjs`): un versante con max ≥ 30% o media ≥ 18% su ≥ 1,5 km
non può essere una strada asfaltata. Al 31/10: 185 salite su 20.378 (80 con difficoltà 9-10), 166 in file non ancora
ricostruiti con v4.8 (gallerie e ponti: si sistemano da sole con la rotazione). L'indice le marca `q`: la v2 le lascia
sulla mappa ma fuori da "le più dure", Dure 8+ e 10/10, e nella scheda avvisa e invita a segnalarle.
"Le più dure" mette anche gli sterrati dopo gli asfaltati (Theodulpass, Sommeiller, piste da sci vicino ai 3000 m).

