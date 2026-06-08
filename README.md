# locaClimb v2 -- ride like a local

> **La guida WebGIS definitiva per ciclisti che amano le salite alpine e appenniniche.**
> *"ride like a local wherever you climb"*

---

## Cos'e' locaClimb?

locaClimb e' un'applicazione web interattiva che raccoglie informazioni su **passi e salite epiche** delle Alpi e degli Appennini del Nord Italia, pensata per **ciclisti**.

### Feature Fase 1 (questa versione)

| Feature | Descrizione |
|---|---|
| Mappa WebGIS | 4 sfondi (OSM, CyclOSM, Topo, Satellite) con marker cluster |
| 37+ passi curati | Dati reali per i passi piu' importanti del Nord Italia |
| Auto-fetch OSM | Carica passi da OpenStreetMap (Lombardia, Veneto, Emilia-Romagna) |
| Confronto versanti | Tabella side-by-side (distanza, dislivello, pendenza, traffico) |
| Profilo altimetrico | Grafici sovrapposti per ogni versante (canvas) |
| Route su mappa | Tracciati colorati (blu/arancione) quando selezioni un passo |
| Sole/Ombra | Orari esposizione solare per versante (SunCalc) |
| Meteo 7 giorni | Previsioni live Open-Meteo + MET Norway |
| Best Day to Ride | Algoritmo che suggerisce il giorno migliore |
| Alert vento | Avviso se vento > 40 km/h, sconsigliato se > 60 km/h |
| Bike Day Events | Calendario chiusure traffico motorizzato 2026 |
| Dark mode | Tema scuro |
| Responsive | Mobile + desktop |
| Filtri e ricerca | Regione, difficolta', quota, stato apertura |

### Bike Day 2026

| Evento | Data | Passi |
|---|---|---|
| Sellaronda Bike Day | 6 Giu / 12 Set | Sella, Pordoi, Campolongo, Gardena |
| Dolomites Bike Day | 20 Giu | Campolongo, Falzarego, Valparola |
| Maratona dles Dolomites | 5 Lug | 7 passi dolomitici |
| Enjoy Stelvio - San Marco | 30 Mag | San Marco |
| Enjoy Stelvio - Gavia | 5 Giu / 30 Ago | Gavia |
| Enjoy Stelvio - Mortirolo | 9 Giu / 28 Ago | Mortirolo |
| Enjoy Stelvio - Spluga | 28 Giu | Spluga |
| Stelvio Bike Day | 29 Ago | Stelvio |
| Enjoy Stelvio chiusura | 19 Set | Stelvio |

---

## Deploy su GitHub Pages (5 minuti!)

1. Crea repository su github.com/new -> nome: `locaclimb`
2. Carica i file: `index.html`, `passes_data.js`, `README.md`
3. Settings -> Pages -> Branch: main -> Save
4. Sito live su `https://TUO-USERNAME.github.io/locaclimb/`

---

## Stack Tecnologico

| Tecnologia | Utilizzo |
|---|---|
| HTML5 / CSS3 / JS | App frontend |
| Leaflet.js 1.9.4 | Mappa WebGIS |
| Leaflet.MarkerCluster | Raggruppamento marker |
| SunCalc 1.9.0 | Calcolo posizione sole/ombra |
| Canvas API | Profili altimetrici |
| Open-Meteo API | Meteo 7 giorni |
| MET Norway API | Meteo secondario |
| Overpass API | Auto-fetch da OSM |
| GitHub Pages | Hosting gratuito |

---

## Roadmap - Fase 2

- [ ] Route Builder: seleziona passi, crea loop, modifica con waypoint
- [ ] Export GPX: scarica percorso per Garmin/Wahoo/Strava
- [ ] User Contributions: segnalazioni con review AI + umana
- [ ] Traffic Score multi-layer: OSM + ANAS + crowdsourcing
- [ ] Ensemble meteo: spread/incertezza multi-modello
- [ ] PWA + Offline

---

## Credits & API

- Open-Meteo (https://open-meteo.com/) - CC BY 4.0
- MET Norway (https://api.met.no/) - CC BY 4.0
- Leaflet.js (https://leafletjs.com/) - BSD-2
- SunCalc (https://github.com/mourner/suncalc) - BSD-2
- OpenStreetMap (https://www.openstreetmap.org/) - ODbL

---

## Licenza

MIT License

---

*"ride like a local wherever you climb"*
