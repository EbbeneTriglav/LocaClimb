# locaClimb docs

Reference documentation for contributors/maintainers. `README.md` at the repo root is
the user-facing pitch; this folder is the "how the codebase actually works" layer.

- **[architecture.md](architecture.md)** — how the frontend is put together (`index.html` +
  `js/*.js`), how the JSON data layer is fetched/merged, and what each `scripts/*.mjs`
  pipeline does.
- **[deployment.md](deployment.md)** — the two supported ways to run this app in
  production: GitHub Pages + GitHub Actions (original), or a self-hosted VPS
  (`server/save-api.mjs` + `deploy/systemd/`). Both are first-class; pick per install.
- **[testing.md](testing.md)** — how the test suite works and how to add to it.
- **[browser-smoke.md](browser-smoke.md)** — a manual checklist for the parts that can't
  be unit-tested (live map, network, real input): marker popups, route builder, editor.

These docs are aimed at a human reading through the codebase for the first time.
