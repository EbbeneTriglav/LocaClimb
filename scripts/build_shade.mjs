#!/usr/bin/env node
/*
 * build_shade.mjs - indice di ombreggiatura reale, mese per mese.
 * ---------------------------------------------------------------------------
 * Tre sorgenti di ombra, combinate nello stesso modello geometrico:
 *
 *   1. RILIEVI   - orizzonte del terreno, gia' calcolato da build_sun_horizon.mjs
 *                  (data/sun_horizon.json). Se manca, l'orizzonte e' piatto.
 *   2. CHIOMA    - il bosco trattato come un orizzonte: per ogni punto si misura
 *                  a che distanza inizia la vegetazione in 16 direzioni, e un
 *                  bosco alto H a distanza r vale un ostacolo di atan(H/r) gradi.
 *                  Sorgente: landuse=forest / natural=wood dal PBF della regione.
 *   3. VERSANTE  - auto-ombreggiamento: pendenza ed esposizione locali (DEM).
 *
 * La chioma pero' filtra, non oscura: sotto le fronde arriva luce diffusa. Quindi
 * ogni istante vale 1 (sole pieno), t (luce filtrata) o 0 (ombra vera), dove t
 * dipende da specie e stagione: una conifera lascia passare ~8% tutto l'anno, un
 * faggeto ~12% in piena foglia ma ~50% da novembre a marzo. E' questo che rende
 * l'indice sensibile alla data, insieme all'altezza del sole.
 *
 * Output: data/shade.json, dizionario "idPasso|versante" -> stringa di 72 char.
 * Per ogni mese sono impacchettati 3 valori in base36 a 2 cifre:
 *   ore di sole diretto x10, indice di ombra 0-100, quota di ombra da rilievi 0-100
 * (il resto dell'ombra e' bosco). Circa 1 MB per 24.000 versanti, contro gli ~8 MB
 * degli orizzonti grezzi, e il browser non deve calcolare nulla.
 *
 *   node scripts/build_shade.mjs --forest forest.geojsonseq --passes data/osm_passes_it_nord.json
 *   node scripts/build_shade.mjs --passes data/osm_passes_fr_paca.json      # senza bosco
 *   node scripts/build_shade.mjs --minutes 300                             # tutte le regioni, a tempo
 *
 * Idempotente e riprendibile: rilegge data/shade.json e salta le chiavi gia' fatte
 * (--force per rifarle). Non tocca nessun altro file. 100% ASCII.
 */
import { readFile, writeFile, stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";
import { dataPath } from "./lib/paths.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const has = (n) => process.argv.indexOf(n) >= 0;

const FOREST = arg("--forest", "");
const PASSES = arg("--passes", "");
const OUT = dataPath(arg("--out", "shade.json"));
const HORIZON = dataPath(arg("--horizon", "sun_horizon.json"));
const FORCE = has("--force");
const MINUTES = parseInt(arg("--minutes", "0"), 10) || 0;

const AZ_N = 16;                 // settori di azimut, come sun_horizon
const N_PTS = 9;                 // punti campionati per versante
const RAY_M = [4, 8, 12, 16, 20, 25, 30, 36, 42, 50];   // metri, ricerca del margine del bosco
const STEP_MIN = 10;             // passo temporale
const MIN_ALT = 1.0;             // gradi: sotto, il sole non illumina piu' niente
const SAVE_EVERY = 200;

/* altezza tipica della chioma, metri */
const H_NEEDLE = 22, H_BROAD = 18, H_MIX = 20;
/* trasmissione della chioma in piena foglia */
const T_NEEDLE = 0.08, T_BROAD = 0.12, T_MIX = 0.10;

/* ---------------------------------------------------------------- geometria */
const dLat = (m) => m / 111320;
const dLon = (m, lat) => m / (111320 * Math.cos(lat * Math.PI / 180));
/* rotta bussola da 1 a 2, gradi da nord */
function bearing(la1, lo1, la2, lo2) {
  const p = Math.PI / 180;
  const y = Math.sin((lo2 - lo1) * p) * Math.cos(la2 * p);
  const x = Math.cos(la1 * p) * Math.sin(la2 * p) - Math.sin(la1 * p) * Math.cos(la2 * p) * Math.cos((lo2 - lo1) * p);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
function hav(la1, lo1, la2, lo2) {
  const R = 6371, p = Math.PI / 180;
  const a = Math.sin((la2 - la1) * p / 2) ** 2 + Math.cos(la1 * p) * Math.cos(la2 * p) * Math.sin((lo2 - lo1) * p / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* ------------------------------------------------- posizione del sole (NOAA) */
/* In TEMPO SOLARE LOCALE: cosi' non serve nessun database di fusi orari, e
   "mezzogiorno" e' davvero il culmine del sole sopra quel punto. */
function sunAltAz(dayOfYear, solarHour, latDeg) {
  const g = 2 * Math.PI / 365 * (dayOfYear - 1 + (solarHour - 12) / 24);
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g)
    - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
    - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const H = (solarHour - 12) * 15 * Math.PI / 180;
  const lat = latDeg * Math.PI / 180;
  const sinAlt = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const azS = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat));
  return { alt: alt * 180 / Math.PI, az: ((azS * 180 / Math.PI + 180) % 360 + 360) % 360 };
}

/* quanta foglia c'e' addosso a un bosco caducifoglio in un dato mese, per latitudine.
   Alle nostre latitudini: nudo a gennaio, pieno da giugno ad agosto, caduta a ottobre. */
function leafOn(month, latDeg) {
  const shift = (Math.abs(latDeg) - 45) / 12;          // piu' a nord, stagione piu' corta
  const t = [0, 0, .1, .45, .85, 1, 1, 1, .9, .55, .15, 0][month - 1];
  return Math.max(0, Math.min(1, t - (t > 0 && t < 1 ? shift * 0.5 : 0)));
}

/* ------------------------------------------------------- indice dei poligoni */
const CELL = 0.01;                                     // ~1.1 km
const cellKey = (la, lo) => Math.floor(la / CELL) + ":" + Math.floor(lo / CELL);

function makeIndex() { return { grid: new Map(), polys: [] }; }
function addPoly(ix, rings, kind) {
  let m0 = 90, m1 = -90, n0 = 180, n1 = -180;
  for (const r of rings) for (let i = 0; i < r.length; i += 2) {
    if (r[i + 1] < m0) m0 = r[i + 1]; if (r[i + 1] > m1) m1 = r[i + 1];
    if (r[i] < n0) n0 = r[i]; if (r[i] > n1) n1 = r[i];
  }
  if (!(m1 >= m0)) return;
  const id = ix.polys.length;
  ix.polys.push({ rings, kind, bb: [m0, n0, m1, n1] });
  for (let a = Math.floor(m0 / CELL); a <= Math.floor(m1 / CELL); a++)
    for (let b = Math.floor(n0 / CELL); b <= Math.floor(n1 / CELL); b++) {
      const k = a + ":" + b;
      let v = ix.grid.get(k); if (!v) { v = []; ix.grid.set(k, v); }
      v.push(id);
    }
}
function ringHas(r, la, lo) {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const yi = r[i + 1], xi = r[i], yj = r[j + 1], xj = r[j];
    if ((yi > la) !== (yj > la) && lo < (xj - xi) * (la - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/* -> kind del bosco che copre il punto (0 conifera, 1 latifoglia, 2 misto), o -1 */
function forestAt(ix, la, lo) {
  const ids = ix.grid.get(cellKey(la, lo));
  if (!ids) return -1;
  for (const id of ids) {
    const p = ix.polys[id], b = p.bb;
    if (la < b[0] || la > b[2] || lo < b[1] || lo > b[3]) continue;
    if (!ringHas(p.rings[0], la, lo)) continue;
    let hole = false;
    for (let k = 1; k < p.rings.length && !hole; k++) if (ringHas(p.rings[k], la, lo)) hole = true;
    if (!hole) return p.kind;
  }
  return -1;
}

async function loadForest(file) {
  const ix = makeIndex();
  if (!file) return { ix, n: 0 };
  try { await stat(file); } catch (e) { console.warn("  ! niente bosco: " + file + " non esiste"); return { ix, n: 0 }; }
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let n = 0;
  let bad = 0;
  for await (const line of rl) {
    /* geojsonseq mette un RS (0x1e) davanti a ogni record: va tolto PRIMA di
       decidere se la riga e' JSON, altrimenti si scarta l'intero file. */
    const raw = line.replace(/^[\x1e\s]+/, "");
    if (!raw || raw[0] !== "{") continue;
    let f; try { f = JSON.parse(raw); } catch (e) { bad++; continue; }
    const g = f.geometry, t = f.properties || {};
    if (!g) continue;
    const lt = (t.leaf_type || "").toLowerCase();
    const kind = lt === "needleleaved" ? 0 : lt === "broadleaved" ? 1 : 2;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : null;
    if (!polys) continue;
    for (const poly of polys) {
      const rings = poly.map((r) => { const a = new Float64Array(r.length * 2); for (let i = 0; i < r.length; i++) { a[i * 2] = r[i][0]; a[i * 2 + 1] = r[i][1]; } return a; });
      addPoly(ix, rings, kind); n++;
    }
  }
  console.log("  bosco: " + n + " poligoni indicizzati" + (bad ? " (" + bad + " righe illeggibili)" : ""));
  return { ix, n };
}

/* --------------------------------------------- orizzonte di chioma per punto */
/* Per ogni settore: distanza al primo bosco -> angolo atan(H/r). Se il punto e'
   gia' dentro il bosco, la chioma sta sopra la testa: ostacolo quasi zenitale. */
function canopyHorizon(ix, la, lo) {
  const inside = forestAt(ix, la, lo);
  if (inside >= 0) return { hz: new Array(AZ_N).fill(85), kind: inside, inside: true };
  const hz = new Array(AZ_N).fill(0);
  let kind = -1;
  for (let a = 0; a < AZ_N; a++) {
    const rad = a * 360 / AZ_N * Math.PI / 180;
    for (const r of RAY_M) {
      const k = forestAt(ix, la + dLat(r * Math.cos(rad)), lo + dLon(r * Math.sin(rad), la));
      if (k >= 0) {
        const H = k === 0 ? H_NEEDLE : k === 1 ? H_BROAD : H_MIX;
        hz[a] = Math.round(Math.atan2(H, r) * 180 / Math.PI);
        if (kind < 0) kind = k;
        break;
      }
    }
  }
  return { hz, kind: kind < 0 ? 2 : kind, inside: false };
}

const hzAt = (hz, az) => {
  if (!hz || !hz.length) return 0;
  const n = hz.length, x = ((az % 360) + 360) % 360 / (360 / n);
  const i = Math.floor(x), f = x - i;
  return hz[i % n] + (hz[(i + 1) % n] - hz[i % n]) * f;
};

/* ------------------------------------------------------ calcolo per versante */
function monthlyShade(pts, latDeg) {
  const out = [];
  for (let mo = 1; mo <= 12; mo++) {
    const doy = Math.round((mo - 0.5) * 30.44);
    const leaf = leafOn(mo, latDeg);
    let pot = 0, got = 0, full = 0, lostTerr = 0, lostCan = 0;
    for (let h = 2; h <= 22; h += STEP_MIN / 60) {
      const sp = sunAltAz(doy, h, latDeg);
      if (sp.alt <= MIN_ALT) continue;
      const dt = STEP_MIN / 60;
      pot += dt;
      let sumF = 0, sumFull = 0, lt = 0, lc = 0;
      for (const p of pts) {
        let f = 1, cause = 0;                                   // 0 nessuna, 1 rilievi, 2 bosco
        if (sp.alt <= hzAt(p.thz, sp.az)) { f = 0; cause = 1; }  // cresta davanti
        else if (p.slp >= 2) {                                   // il versante si ombreggia da solo
          const b = p.slp * Math.PI / 180, al = sp.alt * Math.PI / 180, d = (sp.az - p.asp) * Math.PI / 180;
          if (Math.cos(b) * Math.sin(al) + Math.sin(b) * Math.cos(al) * Math.cos(d) <= 0) { f = 0; cause = 1; }
        }
        if (f > 0 && sp.alt <= hzAt(p.chz, sp.az)) {            // chioma: filtra, non oscura
          const base = p.kind === 0 ? T_NEEDLE : p.kind === 1 ? T_BROAD : T_MIX;
          f = p.kind === 0 ? base : base + (1 - leaf) * 0.45;
          cause = 2;
        }
        sumF += f; sumFull += f >= 0.999 ? 1 : 0;
        if (cause === 1) lt += 1 - f; else if (cause === 2) lc += 1 - f;
      }
      const n = pts.length;
      got += (sumF / n) * dt; full += (sumFull / n) * dt;
      lostTerr += (lt / n) * dt; lostCan += (lc / n) * dt;
    }
    const lost = Math.max(0, pot - got);
    const shade = pot > 0 ? Math.round(100 * lost / pot) : 0;
    const terrShare = lost > 0.01 ? Math.round(100 * lostTerr / (lostTerr + lostCan)) : 0;
    out.push([Math.min(1295, Math.round(full * 10)), shade, terrShare]);
  }
  return out;
}

const b36 = (v) => { const s = Math.max(0, Math.min(1295, v | 0)).toString(36); return s.length < 2 ? "0" + s : s; };
const pack = (rows) => rows.map((r) => b36(r[0]) + b36(r[1]) + b36(r[2])).join("");

/* ------------------------------------------------------------------ sorgenti */
function samplePoints(track) {
  const cum = [0];
  for (let i = 1; i < track.length; i++) cum.push(cum[i - 1] + hav(track[i - 1][0], track[i - 1][1], track[i][0], track[i][1]));
  const tot = cum[cum.length - 1];
  if (!(tot > 0)) return [];
  const out = [];
  for (let k = 0; k < N_PTS; k++) {
    const target = tot * k / (N_PTS - 1);
    let i = 1; while (i < cum.length - 1 && cum[i] < target) i++;
    out.push(track[i]);
  }
  return out;
}

async function loadPasses() {
  const all = [];
  if (PASSES) {
    const j = JSON.parse(await readFile(PASSES, "utf8"));
    (Array.isArray(j) ? j : j.passes || []).forEach((p) => all.push(p));
  } else {
    const files = [];
    try {
      const man = JSON.parse(await readFile(dataPath("osm_regions.json"), "utf8"));
      const list = Array.isArray(man) ? man : (man.regions || man.files || []);
      list.forEach((r) => { const n = typeof r === "string" ? r : (r.file || r.name || r.id); if (n) files.push(String(n).endsWith(".json") ? n : "osm_passes_" + n + ".json"); });
    } catch (e) { console.warn("  ! osm_regions.json: " + e.message); }
    for (const fn of files) {
      try { const j = JSON.parse(await readFile(dataPath(fn), "utf8")); (Array.isArray(j) ? j : j.passes || []).forEach((p) => all.push(p)); } catch (e) { /* skip */ }
    }
    try {
      const mo = JSON.parse(await readFile(dataPath("manual_enriched.json"), "utf8"));
      Object.keys(mo).forEach((id) => all.push(Object.assign({ id }, mo[id])));
    } catch (e) { /* opzionale */ }
  }
  return all.filter((p) => p && p.id && Array.isArray(p.versanti) && p.versanti.length);
}

/* ----------------------------------------------------------------------- main */
async function main() {
  const store = { v: 1, built: "", m: {} };
  if (!FORCE) { try { const old = JSON.parse(await readFile(OUT, "utf8")); if (old && old.m) store.m = old.m; } catch (e) { /* prima volta */ } }

  let horizon = {};
  try { const h = JSON.parse(await readFile(HORIZON, "utf8")); horizon = (h && h.p) || {}; } catch (e) { /* orizzonte piatto */ }
  const nH = Object.keys(horizon).length;
  console.log("orizzonte terreno: " + (nH ? nH + " versanti" : "assente (solo bosco ed esposizione)"));

  const { ix, n: nForest } = await loadForest(FOREST);
  /* Se il bosco era stato CHIESTO ma non e' arrivato (osmium mancante, estrazione
     fallita, file vuoto) mi fermo senza scrivere: salvare ora vorrebbe dire
     archiviare versanti "senza ombra" che poi verrebbero saltati per sempre. */
  if (FOREST && !nForest) {
    console.error("FATAL: --forest " + FOREST + " non ha prodotto poligoni.");
    console.error("       Senza bosco l'indice sarebbe falso, quindi non scrivo nulla.");
    console.error("       Manca osmium?  sudo apt-get install -y osmium-tool");
    process.exit(3);
  }
  if (!nForest) console.log("  ! senza bosco l'indice considera solo rilievi ed esposizione");

  const passes = await loadPasses();
  console.log("passi: " + passes.length);

  const t0 = Date.now(), budget = MINUTES * 60000;
  let done = 0, skip = 0, fail = 0, stopped = false, i = 0;
  const save = async () => { store.built = new Date().toISOString().slice(0, 10); await writeFile(OUT, JSON.stringify(store) + "\n", "utf8"); };

  for (const p of passes) {
    i++;
    if (budget && Date.now() - t0 > budget) { stopped = true; console.log("  budget esaurito a " + i + "/" + passes.length); break; }
    for (const v of p.versanti) {
      const key = p.id + "|" + (v.side || "");
      if (!FORCE && store.m[key]) { skip++; continue; }
      const tr = v.track;
      if (!Array.isArray(tr) || tr.length < 4) { fail++; continue; }
      const sp = samplePoints(tr);
      if (!sp.length) { fail++; continue; }
      const baked = horizon[key] || null;
      /* Senza orizzonte DEM restano comunque bosco ed esposizione: il versante si
         ricava dal tracciato (la strada sale verso la cima, quindi il pendio guarda
         dalla parte opposta) e la pendenza dalla salita media. Approssimazione
         onesta: peggiore del DEM, molto meglio di "nessuna esposizione". */
      const top = tr[tr.length - 1];
      const gr = Math.abs(v.avgGradient || v.pendenzaMedia || v.gradient || 6);
      const slpFallback = Math.round(Math.atan(gr / 100) * 180 / Math.PI);
      const pts = sp.map((c, k) => {
        const b = baked && baked[Math.min(baked.length - 1, Math.round(k * (baked.length - 1) / (sp.length - 1)))];
        const can = canopyHorizon(ix, c[0], c[1]);
        return {
          thz: b ? b[2] : null,
          asp: b ? b[3] : bearing(top[0], top[1], c[0], c[1]),
          slp: b ? b[4] : slpFallback,
          chz: can.hz, kind: can.kind
        };
      });
      try { store.m[key] = pack(monthlyShade(pts, sp[0][0])); done++; } catch (e) { fail++; }
    }
    if (i % SAVE_EVERY === 0) { await save(); console.log("  " + i + "/" + passes.length + " (" + done + " versanti)"); }
  }
  await save();
  console.log("fatto: " + done + " calcolati, " + skip + " gia' presenti, " + fail + " senza tracciato -> " + OUT);
  if (stopped) console.log("INCOMPLETO: rilancia per continuare.");
}
main().catch((e) => { console.error("FATAL: " + e.stack); process.exit(1); });
