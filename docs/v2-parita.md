# v1 → v2: cosa c'è, cosa manca, cosa non funzionava

Obiettivo: spegnere la v1 quando la v2 fa tutto quello che serviva della v1, e lo fa bene.
Aggiornato al 29/10/2026 (dopo la PR "v2 parity 1"). Verifica v1 fatta su locaride.app dal vivo
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
| Valutazioni community | ok (lettura e voto) | 🟡 solo lettura: voto nella prossima PR |
| Strava: segmenti noti | link ai 6 segmenti | ✅ |
| Strava: "Cerca segmenti" | ❌ **non funziona**: Strava ha chiuso la pagina pubblica di ricerca segmenti | ⏭️ torna con il collegamento Strava (API segments/explore) |
| Sole / ombra (indice di ombra) | ⚠️ "n/d" sullo Stelvio | ⏭️ da portare, prima va capito perché è n/d |
| Segnala informazione | presente (non provato) | ⏭️ |
| Modalità salita (manubrio) | – | ✅ nuovo |

## Mappa

| Funzione v1 | v1 | v2 |
|---|---|---|
| Salite colorate, filtri | ok (regione, difficoltà, stato, camion) | 🟡 difficoltà (8+, 10/10) e "Scoperte"; mancano regione, stato, camion |
| Ricerca salite | ok | ✅ |
| Ricerca località (paesi) | ok | ⏭️ |
| Strati acqua 💧 e cibo 🍽️ sulla mappa | ok | ⏭️ (ora solo nella scheda salita) |
| Strato traffico | presente (non provato) | ⏭️ |
| Mappe di base (Topo, ecc.) | ok | 🟡 una sola mappa scura con rilievo e 3D |
| Lingua inglese 🌐 | ok | ⏭️ |
| Errori in console `getMinZoom` (ripetuti) | ❌ bug v1 | – |

## Percorsi e account

| Funzione v1 | v1 | v2 |
|---|---|---|
| Route builder (waypoint, calcolo, asfalto/gravel) | presente (non provato fino in fondo) | ⏭️ **il pezzo più grosso che manca** |
| GPX + punti utili, roadbook stampabile, immagine da condividere | presenti (non provati) | ⏭️ |
| Meteo del percorso (vento lungo il giro) | presente (non provato) | ⏭️ |
| Importa GPX / Le mie salite (GPX, FIT, zip) | ok | 🟡 il Diario le mostra; l'import si fa ancora dalla v1 |
| I miei giri | presente | ⏭️ |
| Accesso Google | ok | ✅ condiviso con la v1 |
| Accesso con email | presente | ⏭️ |
| Proponi salita + revisione admin, livelli e badge | presenti | ⏭️ |
| Revisione salite trovate (`?discover=`) | ok | resta nella v1 finché serve (strumento admin) |

## Ordine proposto delle prossime PR v2
1. **Valutazioni (voto) + segnala informazione + accesso email** - chiude la scheda salita.
2. **Import giri dentro la v2** (GPX/FIT/zip, riusa `js/rideimport.js`) + **I miei giri**.
3. **Route builder v2**: waypoint su mappa, calcolo, GPX con punti utili, meteo e vento del percorso.
4. **Mappa**: ricerca località, strati acqua/cibo, filtri regione/stato/camion, lingua EN.
5. **Proposte salite, livelli, badge** → poi si spegne la v1 (la v2 va su `/`, la v1 resta su `/classica/` per un mese).
