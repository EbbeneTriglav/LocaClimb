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

## Le zone d'Europa (catalogo unico)
- `scripts/lib/zones.json` e' l'elenco unico delle zone: lo usano `osm-expand.yml` (passi OSM),
  `osm-rotate.yml` (il giro dei passi) e la ricerca salite. Ogni zona ha i suoi estratti
  Geofabrik, il ritaglio, il file di uscita e il tipo di terreno (`alps`, `hills`, `flat`, `border`).
- La ricerca salite gira sulle zone con `"discover": true` (45 oggi): soglie Alpi o colline secondo
  il terreno; zone piatte e fasce di confine sono saltate.
- Lancio a mano: Actions → OSM discover → Run workflow → `italia`, `europa`, oppure gli id
  separati da virgola (es. `austria,slovenia`).
- Giro automatico: `osm-discover-rotate.yml` (01:17 e 19:17 UTC) lancia ogni volta le 2 zone mai
  fatte o aggiornate da piu' tempo (`scripts/discover_next.mjs`, stato = storia git): 4 zone al giorno,
  tutto il catalogo si rinnova in circa 2 settimane.
- Nuova zona: aggiungila a `zones.json` e il suo id al menu di `osm-expand.yml`
  (`test/zones.test.mjs` controlla che coincidano).
