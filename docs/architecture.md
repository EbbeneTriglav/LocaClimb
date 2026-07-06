# Architecture

locaClimb is a static, no-build WebGIS app: there is no bundler and no `package.json`
committed to the repo. `index.html` + `js/*.js` are served as-is; Leaflet, SunCalc, and
Firebase come from CDNs; a set of JSON files are fetched at runtime and merged
client-side into the working dataset. UI copy is in Italian; code/docs are in English.

## Frontend: `index.html` + `js/*.js` classic scripts

`index.html` holds markup and CSS only. The JS (~1050 lines total) lives in `js/`,
loaded via plain `<script src>` tags - **not** `type="module"`. That's a deliberate
choice: the app wires most of its UI through inline `onclick="..."` attributes across
~171 functions, and those need to resolve as plain globals. Classic scripts give every
function/variable global scope automatically, exactly as if it were still one big
inline `<script>` - so the split below is organizational only, not a runtime
architecture change. Load order matters (later files use functions/constants defined
in earlier ones):

1. **`state.js`** — every shared mutable global (`map`, `osmPasses`, `routeCache`, `ED`,
   `FB`, `CUR_PASS`, `VPS_API_CONFIG`, ...) and constant (`VCOLS`, `TRAF_MAP`,
   `STRAVA_SEGMENTS`, ...). No functions - read this file first to see the full set of
   global state before changing anything.
2. **`utils.js`** — pure, stateless helpers: formatting/color (`esc`, `fmtDate`, `ds`,
   `gradeColor`, `catColor`, ...), geo/astro math (`hav`, `compass`, `calcSun`),
   classification (`estDiff`, `climbCat`, `catRank`). No DOM/Leaflet/fetch.
3. **`data.js`** — fetches + merges the JSON data layer (below) into `PASSES_DATA` /
   `osmPasses`, and derives versante geometry/elevation from the OSM road graph
   (`enrichOsmPass`, `buildVersante`, `collectSide`).
4. **`map.js`** — Leaflet: `initMap`, marker rendering + clustering, filters/search, the
   traffic-heat and fountain overlays, route-line drawing on the map.
5. **`panel.js`** — the pass detail panel. `openD` (curated) and `openOsmD` (auto-
   discovered OSM) both funnel into one `openPass(p,isOsm)` entry, which draws the right
   map tracks (curated routed lines / OSM stored tracks / un-enriched `renderOsmStub`)
   and renders the panel; `renderPassPanel` + `passHeader` are shared across sources.
   Also the elevation profile chart, weather, per-versante GPX export, and the news
   section.
6. **`routebuilder.js`** — chains passes/waypoints into a route via BRouter with an OSRM
   fallback, with its own elevation/surface overlay and GPX export.
7. **`editor.js`** — the in-app map-based climb editor: draw a versante, snap it to
   roads, compute elevation, and save it (see [deployment.md](deployment.md) for the
   two ways "save" can work).
8. **`auth.js`** — optional Firebase accounts + community ratings, inert until
   `FIREBASE_CONFIG` in `state.js` is filled in.
9. **`events.js`** — central event delegation (`ACTIONS` + `wireActions()`). Elements
   carry `data-act`/`data-change` + `data-*` args instead of inline `onclick`; a single
   capture-phase document listener dispatches them (capture so Leaflet popup buttons,
   whose clicks Leaflet `stopPropagation()`s in the bubble phase, are still caught).
10. **`init.js`** — the `DOMContentLoaded` bootstrap only. Must stay last, since it calls
   `wireActions()`, wires the remaining static controls, and kicks off the initial data
   loads using functions defined in every file before it.

`passes_data.js` (its own `<script>` tag, loaded before all of the above) supplies the
curated dataset as globals: `PASSES_DATA` and `BIKE_EVENTS`.

**Adding a function?** Put it in the file matching its concern above, not wherever's
convenient - that's the whole point of the split. If you add a new `js/*.js` file,
also add it to the `JS_FILES` array in `test/helpers/load-app.mjs` (same order as its
`<script src>` tag) or its functions won't be visible to tests.

## Data layer: multiple JSON files merged client-side at load time

There's no backend for reads - the frontend fetches and layers these files at
startup (see the `fetch(...)` calls in `js/data.js`). All of them live under **`data/`**;
the directory is named in exactly two places — `DATA_DIR` in `js/state.js` and
`dataPath()` in `scripts/lib/paths.mjs` — so relocating the data layer is a one-liner:

- `passes_data.js` — ~37 hand-curated core passes (the baseline dataset; it's JS, not
  JSON, so Node scripts can also load it via `vm.runInContext`, no parser needed).
- `curated_overrides.json` — per-pass overrides (lat/lon, versanti, difficulty, cat)
  applied on top of `passes_data.js`.
- `manual_enriched.json` (preferred) / `manual_overrides.json` (fallback) — hand-drawn
  climbs/versanti from the in-app editor. `manual_enriched.json` is the same data after
  a Terrarium-elevation re-sampling pass.
- `climbs_extra.json` — a short list of manually-added extra climbs.
- `osm_regions.json` — manifest listing which `osm_passes*.json` files to merge
  (multi-country support); a listed file that doesn't exist yet is skipped silently.
- `osm_passes.json`, `osm_passes_{sud,fr,ch,at}.json`, `osm_passes_xb_{ch,at,fr}.json` —
  auto-discovered passes per region/border-corridor, built by
  `scripts/build_osm_passes.mjs` from Geofabrik OSM extracts. Large generated files
  (multi-MB) - don't hand-edit them.
- `routes_baked.json` — pre-computed OSRM route geometry for curated versanti, so the
  curated passes don't hit OSRM live in the browser.
- `base_hints.json` — pass-name -> likely town/versante-name hints, used to help
  match/label auto-discovered OSM passes.
- `pass_news.json` — human-curated news/status blurbs (never touched by automation).
- `pass_news_candidates.json` — a review queue of *candidate* news items fetched from
  GDELT; a human approves and copies good ones into `pass_news.json`.

Because the frontend's `fetch(...).catch(function(){})` chains silently no-op on a
malformed file, run **`node scripts/validate_data.mjs`** after hand-editing any of
these - it's the thing that actually fails loudly on a typo'd pass id, a downhill
"climb", an out-of-range difficulty, etc.

## Node scripts (`scripts/`)

Standalone ESM scripts, no `package.json` committed - a script's one-off npm
dependency (e.g. `pngjs`) is installed ad hoc with `npm install pngjs --no-save`
immediately before running, exactly like CI does it.

- **`build_osm_passes.mjs`** — the heavy pipeline: downloads Geofabrik PBF extracts,
  filters with `osmium-tool`, builds a road graph, snaps passes to roads, walks
  outward, pulls elevation from Terrarium DEM tiles (decoded locally with `pngjs`), and
  derives versanti/category/traffic. Region is controlled by `LC_PBF`
  (comma-separated Geofabrik URLs) and `--out`; the same heuristic builds any
  country/region.
- **`bake_routes.mjs`** — reads `passes_data.js` via `vm`, fetches OSRM geometry per
  curated versante, writes `routes_baked.json`.
- **`enrich_manual.mjs`** — re-samples elevation for hand-drawn `manual_overrides.json`
  tracks against the same Terrarium DEM (never alters the drawn geometry or human
  text), writing `manual_enriched.json`.
- **`fetch_news.mjs`** — polls the GDELT DOC 2.0 API (no key, but rate-limited hard) for
  status-changing news per pass, writing only `pass_news_candidates.json`.
- **`validate_data.mjs`** — schema/sanity check for the whole data layer above (see
  above). Exit code 1 on errors, 0 on warnings-only.
- **`serve.mjs`** — zero-dependency static file server for local testing
  (`node scripts/serve.mjs [port]`); needed because opening `index.html` via `file://`
  breaks the `fetch()` calls to the JSON data files.
