/*
 * shade.mjs - "Sole e ombra" on the climb page: how much of the road is in the shade this month and why
 * (terrain, forest, the slope itself). Precomputed month by month by scripts/build_shade.mjs into
 * data/shade.json ("id|side" -> 72 chars); same reading as the classic app (js/shadeindex.js).
 */
const URL_SHADE = new URL("../../data/shade.json", import.meta.url).href;
let pending = null;
export function loadShade() {
  if (!pending) pending = fetch(URL_SHADE, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : {})).then((o) => (o && o.m) || {}).catch(() => ({}));
  return pending;
}

/* 72 chars -> 12 months x { sun: hours of direct sun, shade: %, terr: share of the shade from terrain % } */
export function unpack(s) {
  if (!s || s.length < 72) return null;
  const out = [];
  for (let i = 0; i < 12; i++) {
    const c = s.substr(i * 6, 6);
    out.push({ sun: parseInt(c.substr(0, 2), 36) / 10, shade: parseInt(c.substr(2, 2), 36), terr: parseInt(c.substr(4, 2), 36) });
  }
  return out;
}

/* the climb's own side first, then the same side of its OSM twins (curated passes share the summit) */
export function shadeFor(m, c, side) {
  const ids = [c.id, ...((c.twins || []).map((t) => t.id))];
  for (const id of ids) { const r = unpack(m[id + "|" + (side || "")]); if (r) return r; }
  return null;
}

export function shadeWord(pct) {
  return pct < 12 ? "Pieno sole" : pct < 30 ? "Poca ombra" : pct < 50 ? "Ombra a tratti" : pct < 70 ? "Molta ombra" : "Quasi sempre ombra";
}
/* amber -> indigo: more shade, colder colour (one scale, as the classic app) */
export function shadeTone(pct) {
  const t = Math.max(0, Math.min(1, pct / 100));
  return `rgb(${Math.round(245 - 150 * t)},${Math.round(158 - 40 * t)},${Math.round(11 + 180 * t)})`;
}
/* what the shade is made of, only the causes that weigh */
export function shadeCauses(r) {
  if (!r || r.shade < 8) return [];
  const woods = 100 - r.terr, out = [];
  if (woods >= 20) out.push({ k: "bosco", pct: Math.round(r.shade * woods / 100) });
  if (r.terr >= 20) out.push({ k: "rilievi", pct: Math.round(r.shade * r.terr / 100) });
  return out;
}
