# LocaRide icon - "il tornante"

Approved by Rick on 30/10/2026 (drafts and rounds: the "Icona LocaRide" artifact).
Three hairpins seen from above with the summit dot; the initials LR hidden underneath, tone on tone.

| Where | File | Version |
|---|---|---|
| Browser tab | `favicon.svg` (switches by itself: lime on a light browser, night on a dark one), `favicon.ico` (16/32/48, fallback) | L2 |
| iPhone / iPad home | `apple-touch-icon.png` (180, iOS rounds the corners) | L2 lime |
| Android home (installed app) | `icon-512-maskable.png` (content inside the 80% safe circle) | L2 lime |
| Desktop installed app (Windows, macOS, Linux) | `icon-192.png`, `icon-512.png` (corners drawn in) | L3 lime |

Masters (the letters are outlines, no font needed): `brand/icon-L2-lime.svg`, `icon-L3-lime.svg`,
`icon-L2-notte.svg`, `icon-L3-notte.svg`, `icon-L2-lime-maskable.svg`, `icon-L3-lime-rounded.svg`.
Colours are the v2 tokens: lime `#C8F560`, night `#0B0F14`, summit `#FFD23F`, letters `#B4E04B` / `#1C2733`.

Rebuild (from the repo root, tools installed ad hoc as CI does):
```bash
npm i --no-save opentype.js@1.3.4 @fontsource/barlow-condensed@5
node brand/build_icons.mjs node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-800-italic.woff
node brand/render_icons.cjs     # PNGs with Playwright; then favicon.ico from the 16/32/48 PNGs (Pillow)
```
