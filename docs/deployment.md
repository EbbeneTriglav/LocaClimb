# Deployment

There are two supported ways to run locaClimb in production. Neither is "the real
one" - pick whichever matches where you host. They can also both exist at once (the
in-app editor can show both save options side by side), as long as you avoid pointing
both at the same git branch/remote (see the caveat at the bottom).

| | GitHub Pages | Self-hosted VPS |
|---|---|---|
| Hosting | GitHub Pages (free, static) | Your own server |
| Scheduled data pipelines | GitHub Actions (`.github/workflows/`) | systemd timers (`deploy/systemd/`) |
| Editor "save" credential | A GitHub PAT typed into the browser, kept in `sessionStorage` | A shared admin passphrase; the GitHub token lives only on your server |
| Setup effort | ~5 minutes | requires a VPS, Node, git push access, systemd |

## Option A: GitHub Pages + GitHub Actions (original)

This is the setup described in the root `README.md`'s "Deploy su GitHub Pages"
section: push the repo to a GitHub repository, enable Pages on the `main` branch.

The five workflows in `.github/workflows/` run entirely on GitHub's own infrastructure
and commit generated data straight back to `main`:

- `osm-refresh.yml` — yearly (or manual dispatch) full rebuild of `osm_passes.json` +
  `curated_overrides.json` + `routes_baked.json`.
- `osm-expand.yml` / `osm-border.yml` — manual, per-region/per-corridor OSM builds.
- `manual-enrich.yml` — fires automatically when `manual_overrides.json` changes.
- `news.yml` — every 3 days, fetches GDELT news candidates.

In the in-app map editor (open with `?admin` in the URL), the "Salva diretto (admin)"
section (`js/editor.js`'s `ghSave()`) lets you type a fine-grained GitHub PAT (Contents:
read & write, scoped to this one repo) directly into the browser. It's kept in
`sessionStorage` only (never sent anywhere but `api.github.com`, never committed) and
PUTs `manual_overrides.json` straight to GitHub's Contents API. This is simple and
requires no server, at the cost of the browser briefly holding a real write credential.

**Nothing about this path changed** when the VPS option below was added - it's
untouched and fully usable on its own.

## Option B: Self-hosted VPS

For anyone who'd rather not have GitHub Pages/Actions be a hard dependency, or who
wants the GitHub write credential to never touch a browser at all.

### 1. Serve the static files

Any static file server works (nginx, Caddy, `node scripts/serve.mjs` behind a
reverse proxy for local testing). Nothing here is different from Option A - it's the
same `index.html` + `js/*.js` + JSON files.

### 2. Run `server/save-api.mjs` for the editor's "save" button

This tiny Node HTTP server (`node:http`, no dependencies) holds the GitHub token
server-side. The browser only ever sends a shared admin passphrase to *your* endpoint,
which then does the GitHub Contents API PUT on its behalf - the token never leaves
your server.

```bash
GITHUB_TOKEN=ghp_xxx GITHUB_OWNER=you GITHUB_REPO=LocaClimb ADMIN_KEY=some-long-passphrase \
  node server/save-api.mjs
```

Required env vars: `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `ADMIN_KEY`.
Optional: `PORT` (default 8787), `ALLOWED_ORIGIN` (CORS, default `*`), `GITHUB_BRANCH`
(default `main`). See the file's header comment for details, `GET /health` for a
liveness check, and `test/save-api.test.mjs` for the exact request/response contract.

Every incoming payload is validated with `scripts/validate_data.mjs` before it's ever
sent to GitHub - a malformed edit gets rejected with a detailed error instead of
silently corrupting `manual_overrides.json`.

Then point the frontend at it by filling in `js/state.js`:

```js
var VPS_API_CONFIG={endpoint:"https://your-domain/api/manual-overrides"};
```

Once that's non-empty, the editor's admin panel shows a second "Salva su server
(VPS)" section alongside the existing GitHub one - filling it in doesn't remove the
GitHub option, they coexist.

Running this long-term as a systemd service (reverse proxy + TLS in front of it via
nginx/Caddy) is a normal Node-service deployment; there's no template for it in this
repo since it's identical to deploying any small Node HTTP server.

### 3. Run the data pipelines on a schedule

`deploy/systemd/` has unit + timer templates that run the exact same
`scripts/*.mjs` pipelines used by GitHub Actions, but via a local git checkout +
systemd timers instead of GitHub-hosted runners:

- `locaclimb-osm-refresh` — mirrors `osm-refresh.yml` (yearly).
- `locaclimb-news` — mirrors `news.yml` (~every 3 days).
- `locaclimb-manual-sync` — polls every 10 minutes as a substitute for
  `manual-enrich.yml`'s push trigger (systemd has no webhook equivalent). If
  `save-api.mjs` runs on the same box, you can skip this and have it call
  `scripts/enrich_manual.mjs` directly after a successful save instead - simpler,
  and immediate rather than polled.

Full install steps, prerequisites (Node 22, `osmium-tool`, a dedicated git checkout,
push access), and the exact commands are in `deploy/systemd/README.md`.

## Running both at once

If you enable GitHub Actions **and** a VPS timer against the *same* branch/remote,
both will try to commit/push independently and race each other. Either:

- point the VPS timers' `GIT_REMOTE`/`GIT_BRANCH` (in `deploy/systemd/*.env`) at a
  different remote/branch than the one GitHub Actions watches, or
- disable the corresponding GitHub Actions workflow if the VPS is now the sole writer
  for that pipeline.

The two editor "save" sections (GitHub PAT vs. VPS passphrase) can safely coexist
regardless, since a human is the one choosing which button to click.
