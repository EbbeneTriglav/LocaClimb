# Salite dalla rete stradale: pubblicazione automatica

Dal 29/10/2026 la ricerca delle salite senza nodo "passo" (`osm-discover.yml`) pubblica da sola
quello che trova. Nessun passaggio a mano.

## Il giro
1. `build_osm_passes.mjs --discover <regione>` trova le cime della rete stradale →
   `data/discover_<regione>.json` (tutte, l'app non lo carica).
2. `promote_discover.mjs --region <regione>` applica la regola di
   `data/discover_<regione>_review.json` → `data/osm_passes_disc_<regione>.json`.
   Se il file `_review` non esiste viene creato con la regola verificata in Emilia-Romagna:
   si pubblicano i gruppi **nuova** e **doppione**, restano fuori **piccola** e **sterrata**.
3. `build_regions_manifest.mjs` + `build_osm_index.mjs` rigenerano `osm_regions.json` e
   `osm_index.json` dal disco: la regione è online al commit successivo.

## Togliere (o forzare) una salita
- Apri `https://locaride.app/?discover=<regione>`, giudica, premi **Copia esito**.
- Gli id da togliere vanno in `"no"` del file `_review`, quelli da tenere comunque in `"ok"`.
- Il giro successivo li riapplica. Se una cima si sposta di poco e cambia id, la decisione la
  segue (entro 300 m): per questo il file salva anche la posizione (`noAt`, `okAt`).

## Dove guardare
- **Actions → OSM discover**: il riepilogo di ogni regione mostra pubblicate e scartate per gruppo.
- Il sito: le salite nuove compaiono sulla mappa dopo il commit del bot (cache del browser
  fino a ~10 minuti).
