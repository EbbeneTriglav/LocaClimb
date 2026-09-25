# UX brief — benchmark: Climbfinder (climbfinder.com)

For any agent (or human) working on UI/UX. Read with `CLAUDE.md`. Benchmark reviewed
Sep 2026 from its public web pages (climb page, planner, premium). Their live map UI was
not inspected in depth — ask Rick for screenshots before copying a map interaction.

**Rule zero:** take *patterns*, never assets. No copying their texts, icons, colors,
logo, photos or layout pixel-for-pixel. locaClimb keeps its own identity (UI "LocaRide").

## What they do well (patterns worth adopting)
1. **A page per climb-side, with a URL.** Each versante has its own shareable, indexable
   page: breadcrumb (Italia › Alpi › Veneto › Dolomiti › Belluno), "alternative sides"
   links, stats, profile, reviews, FAQ. Discovery comes from search engines, not the map.
2. **One-glance header:** name + start town, category badge (HC/1-4), rating, counters
   (reviews, photos). Stats block: difficulty points, length, avg %, steepest 100 m, gain.
3. **Auto "facts" that give meaning:** "#42 hardest in Veneto", "24 hairpins", "famous climb".
4. **Profile as hero:** gradient-colored with a visible % legend, drag-to-zoom, downloadable
   image of the profile.
5. **Times table** at 4 speeds + "your achievable time" from personal W/kg.
6. **Low-friction community input:** 3-button polls (surface good/ok/bad, traffic low/med/high)
   next to full reviews with photos; "useful" votes; login with Google/Apple in one tap.
7. **Personal status per climb:** climbed / bucket list / not yet.
8. **Planner:** pick climbs → logical route → full "stage profile" → roadbook with ETA,
   surface and weather per climb → export to bike computer.

## Where locaClimb is already stronger (protect and SHOW these)
- Weather physics along the route: head/tail/cross wind, CAPE-based storm risk with diurnal
  weighting, apparent temperature on descents.
- Water fountains + refreshment stops with opening hours matched to ETA (their users
  complain "no ristoro on the climb" — we answer that).
- Modeled traffic (weekday/weekend, trucks) and sun exposure.
- Pass status (open/seasonal/closed) + news; Bike Day (car-free days).
- Free, no monthly cap; Italian local knowledge (curated start towns); Google sign-in live.
These are buried in panels today. UX goal #1: surface them in the first 3 seconds.

## Map screen patterns (from a Climbfinder map screenshot, Sep 2026)
- Climbs drawn as **lines colored by difficulty** (green → yellow → orange → red) on a
  **hillshade** basemap: terrain is readable at a glance, pins are secondary.
- **Difficulty legend bar** across the top of the map with the color bands and their
  thresholds — colors never need guessing.
- **Card strip at the bottom = the climbs in the current viewport**: photo, category badge,
  km, %, rating, difficulty points, name "X da Y". It updates as the map moves, so the
  map and the list are one thing.
- Compact floating controls top-left: search "salita o località", menu, layers, filters,
  sort ("popolarità"). A "+20 km" radius chip for "near me".
- Left panel as the planner entry point: "Da dove vuoi partire?", my routes, upload GPX.

## Backlog
The prioritized, agent-ready list lives in **`docs/backlog.md`** (single source of truth;
items F01–F14 with acceptance criteria). Google sign-in is already live.

## Design principles
- **Answer first, detail on demand:** verdict and 4 numbers first; charts and tables below.
- **Mobile-first at 390 px:** thumb-reachable actions at the bottom; nothing important in
  hover-only UI.
- **Every number has a unit and a meaning** (e.g. "14,7% · tratto più duro").
- **Italian UI text, short and concrete.** No marketing copy.
- **Performance is UX:** no new blocking request on panel open; reuse cached data.
- **Accessibility:** color is never the only signal (gradient legend has numbers; verdict
  has text); contrast AA; tap targets ≥ 44 px.
