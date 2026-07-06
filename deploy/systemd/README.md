# VPS deployment: systemd timers (additive)

These are the VPS equivalent of the scheduled/triggered jobs in `.github/workflows/`,
for running the exact same `scripts/*.mjs` pipelines on a self-hosted server instead
of (or alongside) GitHub Actions. **The GitHub Actions workflows are untouched and
keep working unchanged** if you deploy on GitHub Pages instead - this is an
additional option, not a replacement.

| systemd unit | mirrors | schedule |
|---|---|---|
| `locaclimb-osm-refresh` | `osm-refresh.yml` | yearly, Jan 1 03:17 |
| `locaclimb-news` | `news.yml` | ~every 3 days |
| `locaclimb-manual-sync` | `manual-enrich.yml` | polls every 10 min (see below) |

## Important: pick ONE automation path per branch/remote

This repo can have multiple git remotes (e.g. a GitHub `origin` and a private Gitea
remote). If GitHub Actions AND a VPS timer both push to the *same* branch on the
*same* remote, you'll get racing/duplicate bot commits. Point `GIT_REMOTE`/`GIT_BRANCH`
in each `.env` file at whichever remote+branch this VPS is the sole writer for, and
disable the corresponding GitHub Actions workflow (or just don't push to the branch
it watches) if you don't want both running.

## Prerequisites on the VPS

- Node 22, `git`, and for `locaclimb-osm-refresh` specifically: `osmium-tool` (`apt-get
  install osmium-tool`) since `build_osm_passes.mjs` shells out to it.
- A dedicated git checkout for this automation (e.g. `/home/locaclimb/locaclimb`) -
  **not** a developer's working copy: `run-pipeline.sh` does `git reset --hard` on it
  before every run.
- Push access from that checkout to `GIT_REMOTE` without an interactive prompt (SSH
  deploy key, or a PAT embedded in the remote URL).
- A dedicated `locaclimb` system user that owns the checkout (the `.service` files run
  as `User=locaclimb`).

## Install

```bash
sudo useradd -r -m -d /home/locaclimb locaclimb
sudo -u locaclimb git clone <your-remote-url> /home/locaclimb/locaclimb

sudo mkdir -p /etc/locaclimb
sudo cp deploy/systemd/osm-refresh.env.example /etc/locaclimb/osm-refresh.env
sudo cp deploy/systemd/news.env.example /etc/locaclimb/news.env
sudo cp deploy/systemd/manual-sync.env.example /etc/locaclimb/manual-sync.env
sudo $EDITOR /etc/locaclimb/*.env   # fill in REPO_DIR, GIT_REMOTE/BRANCH, etc.

sudo cp deploy/systemd/locaclimb-*.service deploy/systemd/locaclimb-*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now locaclimb-osm-refresh.timer locaclimb-news.timer locaclimb-manual-sync.timer
```

Run one immediately (don't wait for the timer) to sanity-check it:

```bash
sudo systemctl start locaclimb-news.service
journalctl -u locaclimb-news.service -f
```

## `locaclimb-manual-sync`'s polling caveat

`manual-enrich.yml` fires on a GitHub push webhook - systemd has no direct
equivalent, so this unit polls every 10 minutes instead (harmless no-op, commit-wise,
when nothing changed - `run-pipeline.sh` only commits if `git diff --staged` is
non-empty). If `server/save-api.mjs` (point 3) runs on this same VPS, you likely
don't need this unit at all: it's simpler to have `save-api.mjs` invoke
`scripts/enrich_manual.mjs` directly right after a successful save, since the server
already knows exactly when `manual_overrides.json` changed. See that file's header
comment.
