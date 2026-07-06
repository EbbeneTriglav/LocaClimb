# Testing

```
node --test "test/*.test.mjs"
```

Uses Node's built-in test runner (`node:test`) - zero dependencies, consistent with
the rest of this repo. Don't run `node --test` bare (no path argument): Node's default
test discovery recurses into any directory named `test/`, which also picks up
`test/helpers/load-app.mjs` itself as a spurious empty "test".

## Linting

```
npm install eslint globals --no-save
npx eslint js data scripts server test eslint.config.mjs
```

Flat config in `eslint.config.mjs`, dev-only (`--no-save`, no `package.json` - same ad-hoc
pattern as `jsdom`/`pngjs`). The frontend is ~200 plain globals shared across `js/*.js` with
no import/export, so a naive per-file `no-undef` would flag every cross-file reference. The
config instead **derives the project's globals from the vm loader** (`test/helpers/load-app.mjs`):
it enumerates `globalThis` *inside* the loaded vm context (which includes even uninitialized
top-level `var`s like `map`) and subtracts the standard built-ins + harness stubs, so
`no-undef` flags only genuinely-undefined names (typos). Rules are a hand-picked, high-signal
correctness subset (`no-undef`, `no-dupe-keys`, `no-unreachable`, `valid-typeof`, `use-isnan`,
…); `no-unused-vars` is off for the browser files (a cross-file helper looks unused per-file)
and warn-only for the Node/ESM files, and empty `catch` is allowed (idiomatic here). Errors
fail CI; warnings inform (there are a few known dead-code warnings in `build_osm_passes.mjs`).
Adding the gate immediately caught a real latent bug - a `ReferenceError` on the download-
exhausted path in `build_osm_passes.mjs`.

## CI

`.github/workflows/test.yml` runs ESLint, the test suite, and `node scripts/validate_data.mjs`
on every push/PR. The identical file also lives at `.gitea/workflows/test.yml`, since
Gitea Actions reads workflows from `.gitea/workflows/`, not `.github/workflows/` -
GitHub Actions and Gitea Actions share the same workflow YAML schema and both support
the `actions/checkout`/`actions/setup-node` steps used here, so one file's content
works unmodified on both; it just has to physically exist in both locations. Keep the
two byte-identical when editing (`cp .github/workflows/test.yml .gitea/workflows/test.yml`).

This only actually runs on a given Gitea instance if that instance has Actions enabled
server-side and has a runner registered (an admin-level setting, not something a
workflow file can turn on) - if not, the `.gitea/workflows/test.yml` file is simply
inert there.

## What's covered

- **`test/pure-functions.test.mjs`** — the stateless helpers in `js/utils.js`: `esc`,
  `hav`, `compass`, `fmtDate`, `estDiff`, `climbCat`, `catRank`, `ds`, `sc`/`sl`,
  `passTruck`/`truckRank`, `isGravel`, `niceBin`, `interpE`.
- **`test/osm-data-functions.test.mjs`** — the OSM-graph pure functions in `js/data.js`:
  `rideableWay`/`classifyWay` (way-tag filtering), `surfaceLabelFromWay`, and
  `versSameOrigin`/`mergeColocated` (the border-pass versanti-union logic).
- **`test/validate-data.test.mjs`** — every validator in `scripts/validate_data.mjs`,
  checked against both well-formed and deliberately-broken fixtures.
- **`test/save-api.test.mjs`** — `server/save-api.mjs`'s request-handling logic
  (admin-key check, GitHub PUT body construction, the full save handler), using an
  injectable fake `fetch` so no test makes a real network call or needs real GitHub
  credentials.
- **`test/run-pipeline.test.mjs`** — `deploy/systemd/run-pipeline.sh`, run for real
  (not mocked) against a throwaway bare git repo + checkout created in a temp
  directory: confirms it commits+pushes on a real change, cleanly no-ops (no empty
  commit) when nothing changed, resets a dirty/diverged checkout before running, and
  fails fast with a clear message when a required env var is missing.
- **`test/panel-render.test.mjs`** — DOM coverage for `js/panel.js`'s
  `renderPassPanel()` (the detail panel), driven in jsdom (see below). Asserts the
  curated render (name, one versanti-table column per versante, the weather/news/ratings
  target nodes), the OSM (`isOsm`) branch, the shared `passHeader`, and `renderOsmStub`.
  Its anchor is an **XSS-escape guard**: it injects `<img onerror=…>` into a pass field
  and asserts it comes out escaped with no live node - which fails the moment an `esc()`
  call is dropped from the panel builder.
- **`test/events.test.mjs`** — the event delegation in `js/events.js` (jsdom): a
  delegated `closeD` click closes the panel, a `data-i` arg is parsed/threaded into
  `setElev`, and a no-`data-act` click is a harmless no-op.
- **`test/routebuilder-functions.test.mjs`** — the pure logic in `js/routebuilder.js`
  (vm harness): `trackDist`/`trackAscent`/`interp` (track geometry), `surfCat`/
  `surfaceFromMessages` (BRouter surface buckets), and `generateGPX` (valid GPX, escaped
  names).
- **`test/editor-functions.test.mjs`** — the pure logic in `js/editor.js` (vm harness):
  `edBestInsert` + `edDown`/`edDownPts` (draw geometry), `isAdmin` (the admin gate), and
  `edCommitStore`'s edit-existing path (manual-override entry construction).
- **`test/data-load.test.mjs`** — the data-load error surfacing in `js/data.js` (jsdom):
  `dataWarn` routes an unexpected core-file failure to the `#rs` toast (and names the
  file), while the baked-routes perf cache fails quietly (console only) - proving it
  doesn't cry wolf on expected-optional misses.

## DOM/rendering tests (jsdom)

`test/panel-render.test.mjs` is the first coverage that drives real DOM building rather
than pure functions. It needs **jsdom**, a dev-only ad-hoc dependency installed the same
way the scripts install `pngjs` - no `package.json`:

```
npm install jsdom --no-save
node --test "test/*.test.mjs"
```

If jsdom isn't installed the file **skips cleanly** (one skipped test) so the rest of the
suite still runs. jsdom was chosen over Playwright here because it matches the repo's
zero-runtime-dep ethos and needs no downloaded browser binary; the trade-off is that
**Leaflet (`L`) and the canvas 2D context are stubbed** in `test/helpers/render-app.mjs`,
so these tests assert *markup*, not map tiles or elevation-chart pixels. The parts that
genuinely need a live map / network / real input (marker popups, route drawing, the
editor) stay a manual pass — see **`docs/browser-smoke.md`** for the checklist.

## How the tests run `js/*.js` outside a browser

Two harnesses load `data/passes_data.js` + every `js/*.js` (in `index.html`'s
`<script src>` order), sharing one file list:

- **`test/helpers/load-app.mjs`** (`node:vm`) — the fast path for pure-logic tests. Stubs
  just enough `document`/`window`/`L`/`fetch` that each file's top-level code runs. Same
  trick `scripts/bake_routes.mjs` uses. Only DOM-free/Leaflet-free functions are safe to
  call on the returned context.
- **`test/helpers/render-app.mjs`** (jsdom) — a real DOM for rendering tests. Loads the
  files via indirect `window.eval` (top-level `var`/`function` become window globals, the
  classic-script model reproduced exactly), with `L` and canvas stubbed.

Both import their file list from **`test/helpers/js-files.mjs`** (the `JS_FILES` array).
If you add a new `js/*.js` file, add its name there once - in its `<script src>` order -
and both harnesses pick it up.

## Adding tests for a new script

`scripts/validate_data.mjs` and `server/save-api.mjs` both follow the same shape:
export the pure logic as plain functions (no `fs`/network access baked in - take an
injectable `fetchImpl` if a function needs to make an HTTP call), and keep the actual
I/O (`main()`, `createServer(...)`) as a thin wrapper that isn't itself unit-tested.
That's what makes them testable without spinning up a real server or hitting a real
API - follow the same pattern for new scripts.
