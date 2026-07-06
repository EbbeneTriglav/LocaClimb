# Browser smoke checklist

A short manual pass for the parts of the frontend that can't be unit-tested — anything that
needs a live Leaflet map, real network, or real form input. Run it before a release (or
after touching `map.js` / `routebuilder.js` / `editor.js` / `events.js`). The automated
suite (`node --test "test/*.test.mjs"`) covers the pure logic; this covers the wiring.

Start the app: `node scripts/serve.mjs` → open `http://localhost:8000/`. Keep the browser
devtools **console open** — zero errors/warnings is part of passing.

## Map + markers (js/map.js, js/events.js)
- [ ] Map renders; curated + OSM markers appear; clustering works when zoomed out.
- [ ] Click a curated marker → popup → **Dettagli** opens the detail panel; **+ Route**
      adds it to the route builder. (This exercises the capture-phase delegation that
      catches clicks Leaflet `stopPropagation()`s — the reason `events.js` uses capture.)
- [ ] Click an OSM marker → **Dettagli**: enriched pass shows versanti; un-enriched shows
      the "dati non ancora disponibili" stub.
- [ ] Search box filters and **selecting a result** flies to the pass.
- [ ] Filters (region, difficulty slider, surface, truck `<select>`, OSM toggle) update the
      visible markers; **Reset** clears them.
- [ ] Traffic heat, fountains, and Bike-Day panel toggles work.

## Detail panel (js/panel.js)
- [ ] Versanti table, elevation chart (hover crosshair), weather, Strava, news, ratings
      sections render; **close (✕)** and the elevation both/per-versante toggle work.
- [ ] **GPX** per-versante downloads a file that opens in a GPS app.

## Route builder (js/routebuilder.js)
- [ ] Add ≥2 stops → **Calcola Percorso** draws a line with elevation + surface overlay.
- [ ] Reorder (◀ ▶) and remove (✕) a stop re-routes correctly.
- [ ] Add a map waypoint by clicking the map in route mode.
- [ ] **Scarica GPX** downloads a valid file; open it and confirm a pass name with an
      `&`/`<` in it is intact (not corrupt) — guards the `gpxEsc` escaping.

## Editor (js/editor.js) — append `?admin` or `#admin` to the URL
- [ ] Search + select an existing pass, or **+ Nuovo passo** (click the summit).
- [ ] **Disegna** a versante, drag/right-click points, **Calcola** snaps to road + fetches
      elevation, **Aggiungi versante** adds it to the list.
- [ ] **Scarica** downloads `manual_overrides.json`.
- [ ] If a VPS endpoint / GitHub token is configured: the save section appears and a save
      round-trips (this is the one path that writes to the repo — see `docs/deployment.md`).

## After the data-dir move / a deploy
- [ ] Network tab shows data files fetched from `data/…` (200s), none from the repo root.
