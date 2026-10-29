/*
 * discover.mjs - find climbs that are NOT tied to a mapped pass node.
 *
 * The main builder starts from OSM mountain_pass / saddle / peak nodes, so a road that ends at
 * a summit, a sanctuary, a ski station or a hilltop village is never seen (Monte Petrano, the
 * Bologna hills, Montefeltro...). Here the seed is the ROAD NETWORK itself: a vertex is a top
 * when it is the highest point of the paved road graph around it AND you must descend at least
 * `prom` metres along roads before you can reach higher road ground (road prominence, the same
 * idea as topographic prominence but measured on the graph a cyclist can ride).
 *
 * Pure functions only (no IO, no DEM): build_osm_passes.mjs --discover <region> builds the graph,
 * fills the elevations and then calls findRoadTops(). Covered by test/discover.test.mjs.
 *
 * Graph format (CSR): { n, lat: Float64Array, lon: Float64Array, ele: Float32Array (NaN =
 * unknown, e.g. inside a tunnel or on a bridge), off: Int32Array(n+1), nb: Int32Array, len:
 * Float32Array (km) } - neighbours of v are nb[off[v] .. off[v+1]-1].
 */

/* Regions for the pilot. bbox = osmium "minlon,minlat,maxlon,maxlat".
   ridge = polyline [lon,lat] west->east; tops must lie SOUTH of it (the Via Emilia: north of it
   is the Po plain, nothing to climb, and leaving it out keeps memory low). */
const GF = "https://download.geofabrik.de/europe/italy/";
const HILLS = { prom: 120, minEle: 150, domKm: 1.0, minSepKm: 1.5, knownKm: 1.5 };   // Appennino, colline
const ALPS = { prom: 150, minEle: 300, domKm: 1.0, minSepKm: 1.5, knownKm: 1.5 };    // Alpi e prealpi
export const DISCOVER_REGIONS = {
  er: { ...HILLS,
    label: "Emilia-Romagna (Appennino, con i bordi toscani e marchigiani)",
    pbf: [GF + "nord-ovest-latest.osm.pbf", GF + "nord-est-latest.osm.pbf", GF + "centro-latest.osm.pbf"],
    bbox: "9.15,43.70,12.85,45.15",
    southOf: [[9.15, 45.02], [9.70, 45.05], [10.33, 44.80], [10.63, 44.70], [10.93, 44.65], [11.34, 44.49], [11.71, 44.35], [12.04, 44.22], [12.24, 44.14], [12.57, 44.06], [12.85, 43.97]],
    minEle: 150 },
  "toscana-nord": { ...HILLS, label: "Toscana nord (Garfagnana, Mugello, Chianti, Casentino)", pbf: [GF + "centro-latest.osm.pbf"], bbox: "9.65,43.35,12.40,44.30" },
  "toscana-sud": { ...HILLS, label: "Toscana sud e Lazio nord (Amiata, Val d'Orcia, Maremma)", pbf: [GF + "centro-latest.osm.pbf"], bbox: "10.40,42.35,12.40,43.45" },
  "marche-umbria": { ...HILLS, label: "Marche e Umbria", pbf: [GF + "centro-latest.osm.pbf"], bbox: "11.90,42.35,13.95,43.97" },
  liguria: { ...HILLS, label: "Liguria e Appennino ligure", pbf: [GF + "nord-ovest-latest.osm.pbf"], bbox: "7.45,43.75,9.95,44.70" },
  "piemonte-sud": { ...ALPS, minEle: 250, label: "Piemonte sud (Langhe, Roero, Monferrato, Alpi cuneesi)", pbf: [GF + "nord-ovest-latest.osm.pbf"], bbox: "6.95,44.05,8.95,45.05" },
  "piemonte-nord": { ...ALPS, minEle: 400, label: "Piemonte nord e Valle d'Aosta", pbf: [GF + "nord-ovest-latest.osm.pbf"], bbox: "6.80,45.20,8.75,46.50" },
  lombardia: { ...ALPS, label: "Lombardia (prealpi e Alpi)", pbf: [GF + "nord-ovest-latest.osm.pbf"], bbox: "8.50,45.62,10.65,46.65" },
  "trentino-aa": { ...ALPS, minEle: 400, label: "Trentino-Alto Adige", pbf: [GF + "nord-est-latest.osm.pbf"], bbox: "10.35,45.65,12.50,47.10" },
  "veneto-fvg": { ...ALPS, minEle: 250, label: "Veneto e Friuli (prealpi e Dolomiti)", pbf: [GF + "nord-est-latest.osm.pbf"], bbox: "10.65,45.62,13.95,46.70" },
  "colli-veneti": { ...HILLS, label: "Colli Euganei e Berici", pbf: [GF + "nord-est-latest.osm.pbf"], bbox: "11.35,45.20,11.85,45.55" }
};
/* Regions: bbox = osmium "minlon,minlat,maxlon,maxlat". Optional masks to leave out a plain:
   southOf / northOf = polyline [lon,lat] west->east; tops must lie on that side of it (the Po
   plain has nothing to climb, and leaving it out keeps memory low). */

export function havKm(la1, lo1, la2, lo2) {
  const r = Math.PI / 180, a = Math.sin((la2 - la1) * r / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin((lo2 - lo1) * r / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/* latitude of the polyline at this longitude (clamped at the ends) */
export function lineLat(line, lon) {
  if (lon <= line[0][0]) return line[0][1];
  for (let i = 1; i < line.length; i++) {
    if (lon <= line[i][0]) { const a = line[i - 1], b = line[i], t = (lon - a[0]) / (b[0] - a[0]); return a[1] + (b[1] - a[1]) * t; }
  }
  return line[line.length - 1][1];
}
/* true when the point is south of the line, allowing `marginDeg` of latitude north of it */
export function southOfLine(line, lat, lon, marginDeg) {
  return !line || lat <= lineLat(line, lon) + (marginDeg || 0);
}
/* true when the point is north of the line, allowing `marginDeg` of latitude south of it */
export function northOfLine(line, lat, lon, marginDeg) {
  return !line || lat >= lineLat(line, lon) - (marginDeg || 0);
}
/* inside the region masks (the bbox itself is applied by osmium) */
export function inRegion(cfg, lat, lon, marginDeg) {
  return southOfLine(cfg.southOf, lat, lon, marginDeg) && northOfLine(cfg.northOf, lat, lon, marginDeg);
}

/* tiny binary heap; cmp(a,b) < 0 -> a pops first */
function heap(cmp) {
  const h = [];
  return {
    get size() { return h.length; },
    push(x) { h.push(x); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (cmp(h[p], h[i]) <= 0) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } },
    pop() { const top = h[0], last = h.pop(); if (h.length) { h[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < h.length && cmp(h[l], h[m]) < 0) m = l; if (r < h.length && cmp(h[r], h[m]) < 0) m = r; if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; } } return top; }
  };
}

/* "u beats v": strictly higher, or same height with the lower index (plateaus keep ONE top) */
function beats(ele, u, v) { const eu = ele[u], ev = ele[v]; return eu > ev || (eu === ev && u < v); }

/* v is the highest road point within domKm of road distance */
export function dominates(g, v, domKm) {
  const dist = new Map([[v, 0]]), q = heap((a, b) => a[0] - b[0]);
  q.push([0, v]);
  while (q.size) {
    const [d, u] = q.pop();
    if (d > (dist.get(u) ?? Infinity)) continue;
    if (u !== v && beats(g.ele, u, v)) return false;
    for (let k = g.off[u]; k < g.off[u + 1]; k++) {
      const w = g.nb[k], nd = d + g.len[k];
      if (nd > domKm) continue;
      if (nd < (dist.get(w) ?? Infinity)) { dist.set(w, nd); q.push([nd, w]); }
    }
  }
  return true;
}

/* Road prominence of v. Explore the graph highest-first (max-heap on elevation): the lowest
   elevation we are forced down to before popping a vertex higher than v is the key col.
   NaN elevations (tunnels, bridges) inherit the elevation they were reached at, so a tunnel
   neither creates a fake summit nor a fake valley. Returns { prom, col, higher } where
   higher=false means no higher road ground was found (dead-end range or node budget hit):
   prom is then a lower bound, which is what we want for a "must descend at least" test. */
export function roadProminence(g, v, maxNodes) {
  const top = g.ele[v], seen = new Set([v]), q = heap((a, b) => b[0] - a[0] || a[1] - b[1]);
  let col = top, count = 0;
  for (let k = g.off[v]; k < g.off[v + 1]; k++) { const w = g.nb[k]; if (seen.has(w)) continue; seen.add(w); q.push([Number.isNaN(g.ele[w]) ? top : g.ele[w], w]); }
  while (q.size) {
    const [h, u] = q.pop();
    if (h < col) col = h;
    if (h > top || (h === top && u < v && !Number.isNaN(g.ele[u]))) return { prom: top - col, col, higher: true };
    if (++count > maxNodes) break;
    for (let k = g.off[u]; k < g.off[u + 1]; k++) {
      const w = g.nb[k]; if (seen.has(w)) continue; seen.add(w);
      q.push([Number.isNaN(g.ele[w]) ? h : g.ele[w], w]);
    }
  }
  return { prom: top - col, col, higher: false };
}

/* All tops of the graph that pass the region thresholds, highest first, min separation applied. */
export function findRoadTops(g, o) {
  const raw = [];
  for (let v = 0; v < g.n; v++) {
    const e = g.ele[v];
    if (!(e >= o.minEle)) continue;                      // also rejects NaN
    if (g.off[v] === g.off[v + 1]) continue;             // isolated vertex
    let localMax = true;
    for (let k = g.off[v]; k < g.off[v + 1]; k++) if (beats(g.ele, g.nb[k], v)) { localMax = false; break; }
    if (!localMax) continue;
    if (o.inMask && !o.inMask(g.lat[v], g.lon[v])) continue;
    if (!dominates(g, v, o.domKm)) continue;
    const pr = roadProminence(g, v, o.maxNodes || 80000);
    if (pr.prom < o.prom) continue;
    raw.push({ v, lat: g.lat[v], lon: g.lon[v], ele: Math.round(e), prom: Math.round(pr.prom), col: Math.round(pr.col) });
  }
  raw.sort((a, b) => b.ele - a.ele);
  const kept = [];
  for (const t of raw) if (!kept.some((k) => havKm(k.lat, k.lon, t.lat, t.lon) < o.minSepKm)) kept.push(t);
  return kept;
}

/* Drop tops that sit within km of a summit we already know (any pass, candidate or climb). */
export function dropKnown(tops, known, km) {
  const cell = 0.05, grid = new Map(), K = (a, b) => a + ":" + b;
  for (const p of known) { const k = K(Math.floor(p.lat / cell), Math.floor(p.lon / cell)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p); }
  return tops.filter((t) => {
    const ci = Math.floor(t.lat / cell), cj = Math.floor(t.lon / cell);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const p of (grid.get(K(ci + a, cj + b)) || [])) if (havKm(t.lat, t.lon, p.lat, p.lon) < km) return false;
    return true;
  });
}

/* Name a top: a named peak/saddle on it, else the place it is in, else the road it is on,
   else the nearest town. Generic road names (bare refs, "Via Roma"-like town streets are
   rare at a summit, refs are not) are skipped. */
export function nameTop(t, peaks, places, roadName, nearTown) {
  let best = null, bd = 0.6;
  for (const p of peaks) { const d = havKm(t.lat, t.lon, p.lat, p.lon); if (d < bd) { bd = d; best = p.name; } }
  if (best) return best;
  bd = 0.8;
  for (const p of places) { const d = havKm(t.lat, t.lon, p.lat, p.lon); if (d < bd) { bd = d; best = p.name; } }
  if (best) return best;
  if (roadName && !/^(S[SPR]|E)\s?\d/i.test(roadName) && /[a-z]/i.test(roadName)) return roadName;
  if (nearTown) return "Salita presso " + nearTown;
  return "Cima senza nome";
}

/* Build the CSR graph from undirected edges [a, b, km] over n vertices. */
export function csr(n, lat, lon, ele, edges) {
  const deg = new Int32Array(n);
  for (const [a, b] of edges) { deg[a]++; deg[b]++; }
  const off = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) off[i + 1] = off[i] + deg[i];
  const nb = new Int32Array(off[n]), len = new Float32Array(off[n]), fill = off.slice(0, n);
  for (const [a, b, km] of edges) { nb[fill[a]] = b; len[fill[a]++] = km; nb[fill[b]] = a; len[fill[b]++] = km; }
  return { n, lat, lon, ele, off, nb, len };
}

/* Same as csr() but from typed edge arrays (a[i], b[i], km[i]) for the first m edges. */
export function csrTyped(n, lat, lon, ele, ea, eb, ekm, m) {
  const off = new Int32Array(n + 1);
  for (let i = 0; i < m; i++) { off[ea[i] + 1]++; off[eb[i] + 1]++; }
  for (let i = 0; i < n; i++) off[i + 1] += off[i];
  const nb = new Int32Array(off[n]), len = new Float32Array(off[n]), fill = off.slice(0, n);
  for (let i = 0; i < m; i++) { const a = ea[i], b = eb[i]; nb[fill[a]] = b; len[fill[a]++] = ekm[i]; nb[fill[b]] = a; len[fill[b]++] = ekm[i]; }
  return { n, lat, lon, ele, off, nb, len };
}
