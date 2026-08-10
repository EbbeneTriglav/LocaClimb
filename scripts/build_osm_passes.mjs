#!/usr/bin/env node
/*
 * build_osm_passes.mjs  (v3 - Geofabrik PBF + Terrarium DEM, fully offline)
 * ---------------------------------------------------------------------------
 * No Overpass, no Open-Meteo: deterministic build, no rate limits.
 *  1. Download Geofabrik PBF extracts (cached between runs if kept).
 *  2. osmium tags-filter -> mountain passes + rideable highways.
 *  3. osmium export -> geojsonseq, streamed in Node (low memory).
 *  4. Keep ways near passes (grid index), vertex graph by coords.
 *  5. Snap pass to road, walk outward, elevations from Terrarium terrain
 *     tiles (AWS Open Data, decoded locally via pngjs), trim climb base,
 *     build versanti + category + traffic. Also regenerates curated passes.
 * Requirements (CI): osmium-tool (apt), pngjs (npm). Node 22+. 100% ASCII.
 * Usage: node scripts/build_osm_passes.mjs [--out F] [--min-ele M] [--max N]
 *        [--skip-download] [--no-curated] [--reenrich]
 */
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { createInterface } from "node:readline";
import { execFileSync } from "node:child_process";
import { Readable } from "node:stream";
import vm from "node:vm";
import { createRequire } from "node:module";
import { dataPath } from "./lib/paths.mjs";
const { PNG } = createRequire(import.meta.url)("pngjs");

// PBF regions are configurable so the SAME heuristic builds any country.
// Default = Italy north (unchanged). Override with env LC_PBF or --pbf (comma-separated Geofabrik URLs),
// and set a per-region output with --out (e.g. osm_passes_fr.json). The frontend merges every osm_passes*.json.
//   LC_PBF="https://download.geofabrik.de/europe/switzerland-latest.osm.pbf" node scripts/build_osm_passes.mjs --out osm_passes_ch.json
const _arg0 = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const PBF_DEFAULT = [
  "https://download.geofabrik.de/europe/italy/nord-ovest-latest.osm.pbf",
  "https://download.geofabrik.de/europe/italy/nord-est-latest.osm.pbf",
  "https://download.geofabrik.de/europe/italy/centro-latest.osm.pbf"
];
const PBF_URLS = ((process.env.LC_PBF || _arg0("--pbf", "")).trim()
  ? (process.env.LC_PBF || _arg0("--pbf", "")).split(",").map((s) => s.trim()).filter(Boolean)
  : PBF_DEFAULT);
const DEM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";
const DEM_Z = 13;
// "trunk" is here NOT because we want to send anyone up a superstrada, but because Italian state roads
// switch class along the way: 13 segments of the SS38 between Bormio and the Stelvio are trunk, and
// dropping them cut the road graph into islands (a 70-node BFS from the summit). The genuinely
// unrideable ones carry motorroad=yes and are still rejected by rideable(); the rest are steered
// away from by a heavy edgeExtra penalty and scored as heavy traffic. Connectivity first, preference second.
const HW_KEEP = ["primary","primary_link","secondary","secondary_link","tertiary","tertiary_link","unclassified","unclassified_link","trunk","trunk_link","residential","living_street","road"];

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const OUT = dataPath(arg("--out", "osm_passes.json"));
// --- ESPERIMENTO (solo Grecia): candidate-passo dai punti alti delle strade con ref ---
const ROADCOL_CFG = {
  "osm_passes_gr.json":    { prom: 150, minEle: 500, minSep: 3 },   // montagna
  "osm_passes_be.json":    { prom: 40,  minEle: 20,  minSep: 1.5 }, // Fiandre/Ardenne: muri e cote corte
  "osm_passes_nl_lu.json": { prom: 40,  minEle: 5,   minSep: 1.5 }, // Cauberg, Ardenne lussemburghesi
};
const _rc = ROADCOL_CFG[OUT.split(/[\\/]/).pop()] || null;
const ROADCOL = !!_rc;
const ROADCOL_HW = { primary:1, primary_link:1, secondary:1, secondary_link:1, tertiary:1, tertiary_link:1 };
const ROADCOL_PROM = _rc ? _rc.prom : 150;
const ROADCOL_MINELE = _rc ? _rc.minEle : 500;
const ROADCOL_STEP = 0.25;   // passo di campionamento (km): fitto per i muri corti
const ROADCOL_MINSEP = _rc ? _rc.minSep : 3;
const MIN_ELE = parseInt(arg("--min-ele", "130"), 10);
const MAX_ENRICH = parseInt(arg("--max", "100000"), 10);
const SKIP_DL = process.argv.includes("--skip-download");
const NO_CURATED = process.argv.includes("--no-curated");
const REENRICH = process.argv.includes("--reenrich");
// Optional cross-border clip: minlon,minlat,maxlon,maxlat. When set, the merged PBF is cut to this
// box (complete_ways, so border-crossing roads stay intact) BEFORE filtering. Lets us build a border
// corridor (Italy + neighbour) with both climb sides in-graph, without loading a whole foreign country.
const BBOX = (process.env.LC_BBOX || arg("--bbox", "")).trim();
// Bump this whenever the climb-building algorithm changes: every cached OSM pass whose
// rec.algo != ALGO_VERSION is regenerated exactly once, then stamped and skipped on later
// runs. This propagates algorithm fixes (e.g. valley-trim) without a manual --reenrich,
// and without re-doing the heavy work every month. (Curated + extra climbs always rebuild.)
const ALGO_VERSION = "v4.7-pavedauto";
const BUILD_DATE = new Date().toISOString().slice(0, 10); // YYYY-MM-DD, stamped on every (re)built climb
const NO_XDEDUP = process.argv.includes("--no-crossdedup"); // disable cross-pass overlap prune (D)
// Extra gain (m) required of a name-matched saddle/peak, ON TOP of the floor buildVersanti already
// enforces on EVERY versante (>=200 m over >=1.5 km). That floor is already "a real minor climb", so
// the default here is 0: a candidate is kept as soon as it has one computed versante. Raise it only to
// deliberately thin out the minor stuff (LC_CAND_MIN_GAIN=400 -> only substantial climbs). Candidates
// with ZERO versanti are always dropped: no climb was computed, so there is nothing to show.
// mountain_pass=yes nodes are never subject to any of this - a low valico is still a real pass.
const CAND_MIN_GAIN = parseInt(process.env.LC_CAND_MIN_GAIN || arg("--cand-min-gain", "0"), 10);
// What counts as a climb at all. Deliberately low: the point of the app is the minor local climbs
// people ride to dodge traffic, not only the famous passes. 1.5 km / 125 m ~= 8% average - a real
// little climb, not a bump. Applies to OSM passes + keyword candidates; the curated `relax` path
// keeps its own (1.2 km / 140 m) so lowering this can never rewrite Stelvio & co.
// NB: existing enriched records are NOT recomputed (ALGO_VERSION unchanged) - only no-climb retries
// and brand-new candidates get the lower floor, so no pass can silently grow a spurious versante.
const MIN_DIST_KM = parseFloat(process.env.LC_MIN_DIST || arg("--min-dist", "1.5"));
const MIN_GAIN_M = parseInt(process.env.LC_MIN_GAIN || arg("--min-gain", "125"), 10);
// Display-name fixes for OSM passes whose tag name is not the locally-known name.
// NOTE: names are stored RAW (UTF-8, apostrophes and accents intact). HTML escaping is the
// frontend's job (esc() at render time). Encoding here produced "Passo Ucc&#39;Aidu" on screen.
const NAME_ALIAS = { "Passo del Lagadello": "Passo San Pellegrino in Alpe", "Passo Lagadello": "Passo San Pellegrino in Alpe" };
const WORK = "build_tmp";

/* ----- climb toponyms (beyond mountain_pass=yes) ---------------------------
 * Many real climbs are not tagged mountain_pass=yes: they are natural=saddle
 * (sella/forcella/joch/fuorcla) or natural=peak reached by road (Zoncolan, Grappa,
 * Mont Ventoux). We accept those nodes when their NAME carries a climb toponym in
 * any of the languages we cover (IT / DE-AT-CH / FR / RM / SL) AND the road really
 * reaches them (snap + DEM check in enrichWorker). Everything else is unchanged.
 */
const KW_WORD = new Set([
  // Italiano
  "passo","passi","valico","valichi","colle","colla","colletto","col","sella","selletta","sellata",
  "forcella","forcola","forcelle","forca","bocca","bocchetta","bocchette","giogo","croce","crocetta",
  "cima","monte","punta","foce","varco","portella","scala","piano","pian","alpe","cresta","serra","zoncolan",
  // Francese (FR, Valle d'Aosta, CH romanda)
  "cormet","port","pas","croix","mont","cime","puy","montee","cote","tete","plan","planche","signal","balcon",
  // Romancio / Svizzero
  "fuorcla","furka","forcla","piz","alp",
  // Tedesco (AT / Sudtirolo / CH tedesca) - forme sciolte
  "berg","alm","joch","sattel","scharte","hohe","kreuz","gipfel","horn","kogel","torl",
  // Sloveno (confine orientale)
  "sedlo","prelaz","vrh",
  // Spagnolo / castigliano
  "puerto","alto","collado","portillo","portilla","pico","pena","cuesta","subida","mirador",
  "morro","cabeza","majada","cerro","loma","risco","canada","altu","corredoria",
  // Catalano / Baleari
  "coll","collada","puig","turo","cim","serrat","alt","alcada",
  // Basco / Navarra
  "gaina","gain","lepoa","mendi","tontorra","aldapa",
  // Galiziano
  "chan","pena","cruces",
  // Portoghese
  "portela","cume","garganta","miradouro","senhora","penha","alto",
  // Croato / Sloveno / Bosniaco / Serbo / Montenegrino
  "prijevoj","prevoj","planina","brdo","glava","klanac","greben","prevalac",
  // Rumeno
  "pasul","saua","seaua","curmatura","varful","virful","muntele","culmea","dealul","transalpina",
  // Albanese
  "qafa","qafe","qaf","maja","mali",
  // Bulgaro / Macedone (traslitterati)
  "prohod","vrah","rid","preval",
  // Inglese: e' la lingua dei tag name:en / int_name, quelli che salvano i nomi in cirillico
  "pass","peak","mount","summit","gap","ridge","hill",
  // Greco (alfabeto greco, senza accenti e con sigma normalizzato dopo deacc)
  "διασελο","διαβαση","περασμα","στενα","αυχενασ","ποροσ","ραχη","κορυφη","βουνο","οροσ","υψωμα",
  // Polacco
  "przelecz","przyslop","gora","szczyt","siodlo","hala",
  // Ceco / Slovacco
  "prusmyk","vrch","hora","kopec","priehyb",
  // Ungherese
  "hago","nyereg","nyak","teto","hegy","csucs","gerinc",
  // Fiandre / Vallonia / Olanda (grandi classiche: muri e cote corte)
  "muur","helling","kapelmuur","kop",
]);
// German/Ladin toponyms are COMPOUNDS (Timmelsjoch, Gerlospass, Katschberghohe, Hahntennjoch):
// word-token matching misses them, so match on suffix too.
const KW_SUFFIX = ["joch","jochl","joechl","pass","passhohe","sattel","scharte","hohe","hoehe","berg","alm","kreuz","kogel","torl","toerl","horn","bichl","spitze","spitz","steig","kopf","eck","warte","blick","prevoj","prijevoj","muur","helling"];
function deacc(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[łŁ]/g, "l").replace(/[øØ]/g, "o").replace(/[đĐ]/g, "d")
    .replace(/[þÞ]/g, "th").replace(/[ðÐ]/g, "d").replace(/ß/g, "ss")
    .toLowerCase().replace(/ς/g, "σ");
}
function isClimbName(n) {
  const toks = deacc(n).split(/[^a-z0-9\u0370-\u03ff]+/).filter(Boolean);
  for (const t of toks) {
    if (KW_WORD.has(t)) return true;
    if (t.length >= 7) for (const s of KW_SUFFIX) if (t.endsWith(s)) return true;
  }
  return false;
}
/* Il nome principale non basta fuori dall'area latina: in Bulgaria, Serbia e
   Macedonia del Nord e' scritto in cirillico e isClimbName(), che lavora su
   caratteri latini, non troverebbe mai un toponimo. Proviamo quindi anche i nomi
   alternativi che OSM porta con se'. */
function anyClimbName(pr) {
  const names = [pr.name, pr["name:en"], pr.int_name, pr["name:latin"], pr.alt_name,
                 pr["name:it"], pr["name:de"], pr["name:fr"], pr["name:es"]];
  for (const n of names) if (n && isClimbName(n)) return true;
  return false;
}

// JSON writer: 5 decimals is ~1.1 m - plenty for a road track, and it halves the payload the
// browser must download (Float32 coords were serialised with 17 significant digits).
const J5 = (k, v) => (typeof v === "number" && !Number.isInteger(v)) ? Math.round(v * 1e5) / 1e5 : v;

/* ----- geo + scoring helpers ---------------------------------------------- */
function hav(la1, lo1, la2, lo2) {
  const R = 6371, p = Math.PI / 180;
  const dLa = (la2 - la1) * p, dLo = (lo2 - lo1) * p;
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * p) * Math.cos(la2 * p) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function compass(la1, lo1, la2, lo2) {
  const p = Math.PI / 180;
  const y = Math.sin((lo2 - lo1) * p) * Math.cos(la2 * p);
  const x = Math.cos(la1 * p) * Math.sin(la2 * p) - Math.sin(la1 * p) * Math.cos(la2 * p) * Math.cos((lo2 - lo1) * p);
  const br = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  return ["Nord","Nord-Est","Est","Sud-Est","Sud","Sud-Ovest","Ovest","Nord-Ovest"][Math.round(br / 45) % 8];
}
// Min-heap (operates on a passed array) + road-quality cost penalty, shared by every Dijkstra.
function hpush(h, co, k) { h.push([co, k]); var i = h.length - 1; while (i > 0) { var p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; var t = h[p]; h[p] = h[i]; h[i] = t; i = p; } }
function hpop(h) { var top = h[0], last = h.pop(); if (h.length) { h[0] = last; var i = 0, n = h.length; for (;;) { var l = i * 2 + 1, r = l + 1, m = i; if (l < n && h[l][0] < h[m][0]) m = l; if (r < n && h[r][0] < h[m][0]) m = r; if (m === i) break; var t = h[m]; h[m] = h[i]; h[i] = t; i = m; } } return top; }
// Extra cost fraction per edge: steer pinned climbs onto the official CLASSIFIED paved road
// (SS/SP/SR = primary/secondary/tertiary, extra 0) and away from unclassified shortcuts (e.g. the
// "Dritta Contador" mulattiera, highway=unclassified), service/residential, tracks and unpaved.
// Applied to COST only (not real distance), so legitimate minor-road climbs are never length-capped.
function edgeExtra(nb) {
  var e = 0, hw = nb.hw || "", sf = nb.surf || "";
  if (/gravel|unpaved|compacted|fine_gravel|ground|dirt|earth|sand|pebble|grass/.test(sf)) e += 3;
  if (hw === "track") e += 4;
  else if (hw === "trunk" || hw === "trunk_link") e += 5;   // present so the graph stays whole; never the preferred line
  else if (hw === "service" || hw === "residential" || hw === "living_street") e += 2.5;
  else if (hw === "unclassified" || hw === "unclassified_link") e += 1.2;
  return e;
}
function estDiff(distKm, gain, top) {
  if (!distKm || distKm <= 0) return 1;
  const avg = gain / (distKm * 10);
  let d = avg * 0.85 + Math.min(distKm / 6, 2.5);
  if (avg >= 12) d += 2; else if (avg >= 9) d += 1;
  if (top >= 2000) d += 1;
  return Math.max(1, Math.min(10, Math.round(d)));
}
function nameTokens(n) {
  return (n || "").toLowerCase()
    .replace(/passo|colle|col|della|dello|del|di|monte|giogo|sella|forcella/g, " ")
    .split(/[^a-zaeiou']+/i).map((t) => t.trim()).filter((t) => t.length > 3);
}
function catRank(c) { return { HC: 5, "1": 4, "2": 3, "3": 2, "4": 1 }[c] || 0; }
function climbCat(distKm, gain, top) {
  if (gain < Math.min(150, MIN_GAIN_M) || distKm < 1) return null; // must not sit above the climb floor, or new minor climbs lose their category pill
  const f = (gain * gain) / (distKm * 1000 * 10) + Math.max(0, top - 1000) / 1000;
  if (f >= 8) return "HC"; if (f >= 5.5) return "1"; if (f >= 3.5) return "2"; if (f >= 2) return "3"; return "4";
}
const BAD_SURF = { sand:1, mud:1, rock:1, pebblestone:1, grass:1, woodchips:1, salt:1 };
const PAVED_SURF = { asphalt:1, paved:1, concrete:1, "concrete:plates":1, sett:1, chipseal:1 };
const PAVED_HW = { trunk:1, trunk_link:1, primary:1, primary_link:1, secondary:1, secondary_link:1, tertiary:1, tertiary_link:1 }; // Italian classified roads with no surface tag are asphalt
function rideable(t) {
  if (!t || !t.highway) return false;
  if (t.motorroad === "yes") return false;
  // bicycle=no su un PASSAGGIO DENTRO UN EDIFICIO (casello, portico) descrive la corsia, non
  // l'itinerario: al Timmelsjoch due tratti di 10 m e 8 m dentro il casello (tunnel=
  // building_passage, toll=yes) vetavano l'intera discesa austriaca, lasciando il passo
  // scollegato da Obergurgl, Zwieselstein e Solden. Stesso ragionamento gia' usato per
  // mtb:scale qui sotto: un tag che SEVERA una strada asfaltata di classe superiore e' un
  // dettaglio locale, non un divieto sulla salita. Un divieto vero copre tutta la strada.
  if (t.bicycle === "no" || t.bicycle === "dismount") {
    const passage = t.tunnel === "building_passage";
    const pavedCls = PAVED_SURF[t.surface] || (!t.surface && PAVED_HW[t.highway]);
    if (!(passage && pavedCls)) return false;
  }
  if (t.access === "private" || t.access === "no") return false;
  // mtb:scale on a PAVED road is a mapping quirk - an MTB itinerary drawn over the tarmac. Two SR48
  // segments between Pordoi and Canazei carry it, and vetoing any way that has the tag severed the
  // road: the BFS could never leave the summit westward, so Pordoi lost its Canazei side entirely.
  // mtb:scale=0 means "any bike can ride this" anyway. Veto only real technical trails: an unpaved
  // way with a difficulty of 1 or more.
  if (t["mtb:scale"]) {
    const paved = PAVED_SURF[t.surface] || (!t.surface && PAVED_HW[t.highway]);
    const lvl = parseInt(t["mtb:scale"], 10);
    if (!paved && (isNaN(lvl) || lvl >= 1)) return false;
  }
  if (t.surface && BAD_SURF[t.surface]) return false;
  if (t.tracktype === "grade4" || t.tracktype === "grade5") return false;
  if (t.smoothness && { very_bad:1, horrible:1, very_horrible:1, impassable:1 }[t.smoothness]) return false;
  return true;
}
function surfaceLabel(t) {
  const s = (t && t.surface) || "", hw = (t && t.highway) || "";
  if (s === "asphalt" || s === "paved" || s === "concrete") return "\uD83D\uDEE3\uFE0F Asfalto";
  if (s === "compacted" || s === "fine_gravel" || s === "gravel" || hw === "track") return "\uD83E\uDEA8 Sterrato/gravel";
  if (s) return "Fondo: " + s;
  return "";
}
const TRAF_BASE = { cycleway:1, track:1, service:2, residential:2, living_street:2, unclassified:3, tertiary:3, tertiary_link:3, secondary:4, secondary_link:4, primary:6, primary_link:6, trunk:9, trunk_link:9 };
function computeTraffic(t, elev) {
  const hw = (t && t.highway) || "tertiary";
  const base = TRAF_BASE[hw] != null ? TRAF_BASE[hw] : 3;
  const tour = (elev >= 1500 || base >= 4) ? 2 : 1;
  const mw = parseFloat(t && (t.maxweight || t.maxweightrating)) || 0;
  const hgvNo = t && (t.hgv === "no" || t.hgv === "destination" || t.hgv === "delivery");
  let trucks;
  // Freight only really exists on through arteries (primary SS, busier secondary SP). Minor
  // classes, service/residential, weight-limited or hgv-restricted roads, and high mountain
  // pass roads (dead-end-ish, local only) carry no trucks -> avoid the misleading default "rari".
  if (hgvNo || (mw > 0 && mw < 7.5) || hw === "track" || hw === "cycleway" || hw === "service" || hw === "residential" || hw === "living_street") trucks = "no";
  else if (hw === "primary" || hw === "primary_link") trucks = (t && (t.hgv === "yes" || t.hgv === "designated")) ? "si" : "possibili";
  else if (hw === "secondary" || hw === "secondary_link") trucks = "possibili";
  else trucks = (elev >= 1200) ? "no" : "rari"; // tertiary/unclassified: high pass roads -> no freight
  return { fer: base, wkd: Math.min(10, base + tour), trucks };
}

/* ----- Terrarium DEM (local decode, no rate limits) ------------------------ */
const demCache = new Map();
function demTile(z, x, y) {
  const k = z + "/" + x + "/" + y;
  if (demCache.has(k)) return demCache.get(k); // returns the same in-flight promise -> no double fetch
  const p = (async function () {
    let png = null;
    for (let a = 0; a < 3 && !png; a++) {
      try {
        const r = await fetch(DEM_URL + "/" + k + ".png");
        if (!r.ok) throw new Error("HTTP " + r.status);
        png = PNG.sync.read(Buffer.from(await r.arrayBuffer()));
      } catch (e) { if (a === 2) console.warn("  ! dem " + k + ": " + e.message); else await new Promise((s) => setTimeout(s, 700 * (a + 1))); }
    }
    return png;
  })();
  if (demCache.size > 4000) demCache.delete(demCache.keys().next().value);
  demCache.set(k, p);
  return p;
}
async function elevAt(lat, lon) {
  const z = DEM_Z, n = 1 << z;
  const fx = (lon + 180) / 360 * n;
  const r = lat * Math.PI / 180;
  const fy = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n;
  const tx = Math.floor(fx), ty = Math.floor(fy);
  const png = await demTile(z, tx, ty);
  if (!png) return null;
  const px = Math.min(png.width - 1, Math.max(0, Math.floor((fx - tx) * png.width)));
  const py = Math.min(png.height - 1, Math.max(0, Math.floor((fy - ty) * png.height)));
  const i = (py * png.width + px) * 4;
  return (png.data[i] * 256 + png.data[i + 1] + png.data[i + 2] / 256) - 32768;
}
async function elevations(pts) {
  const out = [];
  for (const p of pts) { const e = await elevAt(p[0], p[1]); if (e == null) return null; out.push(e); }
  return out;
}

/* ----- graph walking + climb building -------------------------------------- */
function vkey(lat, lon) { return lat.toFixed(6) + "," + lon.toFixed(6); }
function anchorBonus(w, anchor) {
  if (!anchor) return 0;
  const t = w.tags || {}, s = ((t.ref || "") + " " + (t.name || "") + " " + (t["name:it"] || "")).toLowerCase();
  for (const tok of anchor) if (tok.length > 3 && s.indexOf(tok) >= 0) return 40; // road named after the pass -> follow it
  return 0;
}
const HWRANK = { primary:6, primary_link:6, secondary:5, secondary_link:5, tertiary:4, tertiary_link:4, unclassified:3, residential:2, living_street:2, cycleway:2, track:1, service:0 };
function same(a, b) {
  const ta = a.tags || {}, tb = b.tags || {};
  let sc = 0;
  if (ta.ref && ta.ref === tb.ref) sc += 20;          // same road ref (SS38 stays SS38)
  if (ta.name && ta.name === tb.name) sc += 14;
  if (ta.highway === tb.highway) sc += 6;
  sc += (HWRANK[tb.highway] != null ? HWRANK[tb.highway] : 3); // prefer bigger roads
  return sc;
}
function gx(w,i){return w.g[i*2];}
function gy(w,i){return w.g[i*2+1];}
function glen(w){return w.g.length>>1;}
function walk(startWay, startIdx, dir, vertexMap, capKm, anchor) {
  const pts = [[gx(startWay,startIdx), gy(startWay,startIdx)]];
  const visited = new Set([startWay.uid]);
  let w = startWay, i = startIdx, d = dir, dist = 0, prev = pts[0];
  for (let guard = 0; guard < 2000; guard++) {
    const ni = i + d;
    if (ni < 0 || ni >= glen(w)) {
      const cand = (vertexMap.get(vkey(gx(w,i), gy(w,i))) || []).filter((c) => !visited.has(c.w.uid) && glen(c.w) > 1);
      if (!cand.length) break;
      cand.sort((x, y) => (same(w, y.w) + anchorBonus(y.w, anchor)) - (same(w, x.w) + anchorBonus(x.w, anchor)));
      const nx = cand[0];
      visited.add(nx.w.uid);
      w = nx.w; i = nx.idx; d = (i === 0) ? 1 : -1;
      continue;
    }
    const gla = gx(w,ni), glo = gy(w,ni);
    dist += hav(prev[0], prev[1], gla, glo);
    pts.push([gla, glo]);
    prev = [gla, glo]; i = ni;
    if (dist >= capKm) break;
  }
  if (pts.length > 110) { const o = [], n = 110; for (let k = 0; k < n; k++) o.push(pts[Math.round(k * (pts.length - 1) / (n - 1))]); return o; }
  return pts;
}
function walkTo(startWay, startIdx, tLat, tLon, vertexMap, capKm, anchor) {
  // greedy target-directed walk from a base vertex toward the summit (tLat,tLon)
  var pts = [[gx(startWay, startIdx), gy(startWay, startIdx)]];
  var visited = new Set([startWay.uid]);
  var w = startWay, i = startIdx, dist = 0, prev = pts[0];
  var dToT = hav(prev[0], prev[1], tLat, tLon);
  for (var guard = 0; guard < 4000; guard++) {
    var bestni = -1, bestd = Infinity;
    for (var dd = -1; dd <= 1; dd += 2) { var ni = i + dd; if (ni < 0 || ni >= glen(w)) continue; var nd = hav(gx(w, ni), gy(w, ni), tLat, tLon); if (nd < bestd) { bestd = nd; bestni = ni; } }
    if (bestni >= 0 && bestd < dToT + 0.03) {
      var gla = gx(w, bestni), glo = gy(w, bestni);
      dist += hav(prev[0], prev[1], gla, glo); pts.push([gla, glo]); prev = [gla, glo]; i = bestni; dToT = bestd;
      if (dToT < 0.25) break; if (dist > capKm) break; continue;
    }
    var here = vkey(gx(w, i), gy(w, i));
    var cand = (vertexMap.get(here) || []).filter(function (c) { return !visited.has(c.w.uid) && glen(c.w) > 1; });
    if (!cand.length) break;
    var pick = null, pickScore = 0.0001;
    cand.forEach(function (c) {
      [c.idx - 1, c.idx + 1].forEach(function (x) {
        if (x < 0 || x >= glen(c.w)) return;
        var nd = hav(gx(c.w, x), gy(c.w, x), tLat, tLon);
        var sc = (dToT - nd) * 100 + anchorBonus(c.w, anchor) + (HWRANK[c.w.tags.highway] || 0);
        if (sc > pickScore) { pickScore = sc; pick = { w: c.w, idx: c.idx }; }
      });
    });
    if (!pick) break;
    visited.add(pick.w.uid); w = pick.w; i = pick.idx;
  }
  if (dToT > 0.4 || pts.length < 4) return null;
  if (pts.length > 110) { var o = [], n = 110; for (var k = 0; k < n; k++) o.push(pts[Math.round(k * (pts.length - 1) / (n - 1))]); pts = o; }
  return pts; // base(town) -> summit
}
function smooth3(a){const o=a.slice();for(let i=1;i<a.length-1;i++)o[i]=(a[i-1]+a[i]+a[i+1])/3;return o;}
async function detectRoadCols(refWays) {
  // OSM spezza le strade in tanti segmenti: un colle sta a cavallo di piu' segmenti.
  // Raggruppo per ref e RICUCIO i segmenti (per endpoint condiviso) in strade continue,
  // poi profilo la strada intera e cerco i massimi locali con prominenza sui due lati.
  const R5 = (v) => Math.round(v * 1e5) / 1e5, K = (la, lo) => R5(la) + "," + R5(lo);
  const byRef = new Map();
  for (const rw of refWays) { if (!byRef.has(rw.ref)) byRef.set(rw.ref, []); byRef.get(rw.ref).push(rw.coords); }
  const chains = [];
  for (const [ref, segs] of byRef) {
    const used = new Array(segs.length).fill(false), endMap = new Map();
    const addEnd = (k, v) => { if (!endMap.has(k)) endMap.set(k, []); endMap.get(k).push(v); };
    segs.forEach((c, si) => { if (c.length < 2) return; addEnd(K(c[0][1], c[0][0]), { si, end: 0 }); addEnd(K(c[c.length - 1][1], c[c.length - 1][0]), { si, end: 1 }); });
    for (let si = 0; si < segs.length; si++) {
      if (used[si] || segs[si].length < 2) continue;
      let chain = segs[si].map((p) => [p[1], p[0]]); used[si] = true;
      let grow = true, guard = 0;
      while (grow && guard++ < 20000) { grow = false; const tail = chain[chain.length - 1];
        for (const cand of (endMap.get(K(tail[0], tail[1])) || [])) { if (used[cand.si]) continue;
          const cc = segs[cand.si].map((p) => [p[1], p[0]]); const seq = cand.end === 0 ? cc : cc.slice().reverse();
          chain = chain.concat(seq.slice(1)); used[cand.si] = true; grow = true; break; } }
      grow = true; guard = 0;
      while (grow && guard++ < 20000) { grow = false; const head = chain[0];
        for (const cand of (endMap.get(K(head[0], head[1])) || [])) { if (used[cand.si]) continue;
          const cc = segs[cand.si].map((p) => [p[1], p[0]]); const seq = cand.end === 1 ? cc : cc.slice().reverse();
          chain = seq.slice(0, -1).concat(chain); used[cand.si] = true; grow = true; break; } }
      chains.push(chain);
    }
  }
  const out = [];
  for (const chain of chains) {
    if (chain.length < 4) continue;
    const prof = []; let acc = 0, last = null;
    for (let i = 0; i < chain.length; i++) {
      const lat = chain[i][0], lon = chain[i][1];
      if (last) acc += hav(last[0], last[1], lat, lon);
      if (last === null || acc >= ROADCOL_STEP || i === chain.length - 1) { const e = await elevAt(lat, lon); if (e != null) prof.push({ lat, lon, ele: e }); acc = 0; }
      last = [lat, lon];
    }
    if (prof.length < 3) continue;
    for (let i = 1; i < prof.length - 1; i++) {
      const e = prof[i].ele; if (e < ROADCOL_MINELE) continue;
      let dl = 0; for (let j = i - 1; j >= 0; j--) { if (prof[j].ele > e) break; if (e - prof[j].ele > dl) dl = e - prof[j].ele; }
      let dr = 0; for (let j = i + 1; j < prof.length; j++) { if (prof[j].ele > e) break; if (e - prof[j].ele > dr) dr = e - prof[j].ele; }
      if (dl >= ROADCOL_PROM && dr >= ROADCOL_PROM)
        out.push({ src: "roadcol", oid: "rc" + Math.round(prof[i].lat * 1e5) + "x" + Math.round(prof[i].lon * 1e5), lat: prof[i].lat, lon: prof[i].lon, ele: Math.round(e), tags: { name: "Colle" } });
    }
  }
  out.sort((a, b) => b.ele - a.ele);
  const kept = [];
  for (const c of out) {
    if (kept.some((k) => hav(k.lat, k.lon, c.lat, c.lon) < ROADCOL_MINSEP)) continue;
    const np = (typeof global.nearestPlace === "function") ? global.nearestPlace(c.lat, c.lon) : null;
    if (np && np.name) c.tags.name = "Colle " + np.name;
    kept.push(c);
  }
  return kept;
}
function buildSide(ptsOut, elevsOut, topLat, topLon, relax, pin) {
  const pts = ptsOut.slice().reverse(), el = smooth3(elevsOut.slice().reverse());
  if (pts.length < 4) return null;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + hav(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
  const end = pts.length - 1;
  function avgFrom(i) { const dd = cum[end] - cum[i]; return dd > 0 ? (el[end] - el[i]) / (dd * 1000) * 100 : 0; }
  function minWin(from) {
    let worst = 99;
    for (let i = from; i < end; i++) {
      let j = i; while (j < end && cum[j] - cum[i] < 1) j++;
      const dd = cum[j] - cum[i]; if (dd <= 0) continue;
      const g = (el[j] - el[i]) / (dd * 1000) * 100;
      if (g < worst) worst = g;
    }
    return worst;
  }
  // --- B: basin-aware base ---------------------------------------------------
  // The BFS path can run PAST the real valley, climb over a saddle/shoulder and drop into a
  // neighbouring drainage (San Pellegrino: out of Castelnuovo over a shoulder, down to
  // Gallicano -> raw endpoint = Gallicano). Walk from the summit toward the endpoint tracking
  // the deepest valley bottom reached; stop as soon as the road climbs back > SADDLE_TOL above
  // that bottom -> we crossed a watershed, so the real base is the bottom on the summit side.
  // Intra-climb rollers/false-flats stay below SADDLE_TOL and don't trigger a cut.
  const SADDLE_TOL = 80; // m; a real watershed exceeds this, normal climb undulation does not
  let base = end, mEl = el[end];
  for (let i = end - 1; i >= 0; i--) {
    if (el[i] < mEl) { mEl = el[i]; base = i; }   // deeper valley bottom in this basin
    else if (el[i] > mEl + SADDLE_TOL) break;     // climbed over a saddle -> stop at last bottom
  }
  // trim trailing near-flat we tentatively included
  while (base < end - 1) {
    let j = base; while (j < end && cum[j] - cum[base] < 0.4) j++;
    const g = (el[j] - el[base]) / ((cum[j] - cum[base]) * 1000) * 100;
    if (g < 0.4) base++; else break;
  }
  // Valley-start refinement: strip the contiguous low-gradient valley approach at the
  // bottom so the base sits where the real climb begins, NOT at a town further down the
  // valley (e.g. Cepina under Stelvio, or the long Serchio-valley run to Gallicano below
  // the Pieve Fosciana ramp on Passo Radici). Advance the base upward while the forward
  // ~600m window stays below VFLOOR%, stopping at the first sustained ramp (>= VFLOOR).
  // It can never cut mid-climb (a real climb is >= VFLOOR from its base up) and always
  // keeps >= VMIN_KEEP km. Generalizes the "2km / 4%" idea: Radici needs ~10km trimmed,
  // so the floor (not a fixed cap) decides where the valley ends.
  const VFLOOR = 4.0, VMIN_KEEP = 3.0;
  function fwdG(i, winKm) { let j = i; while (j < end && cum[j] - cum[i] < winKm) j++; const dd = cum[j] - cum[i]; return dd > 0 ? (el[j] - el[i]) / (dd * 1000) * 100 : 0; }
  // Trim the valley approach until the SUSTAINED real climb begins. A short steep connector
  // (>=4% over 0.6km but flat beyond) must NOT stop the trim - only a ramp that holds >=4%
  // over BOTH 0.6km and 1.4km does. This rides through valley-floor ramps so the base lands
  // at the town where the climb truly starts (Bormio not Cepina; Ponte di Legno not Vezza;
  // Monno/Mazzo not Edolo) instead of anchoring far down the main valley.
  while (base < end - 1 && (cum[end] - cum[base]) > VMIN_KEEP) {
    if (fwdG(base, 0.6) >= VFLOOR && fwdG(base, 1.4) >= VFLOOR) break;
    base++;
  }
  // Town-anchor: walk UP from the trimmed base through the gentle valley (local grade < 4.5%
  // over 1km) and snap the base to the HIGHEST town reached before the real climb. Encodes the
  // local truth "a climb starts at the valley-floor town" (Ponte di Legno on Gavia, Mazzo on
  // Mortirolo) and is robust where pure gradient fails on 3-4% main-valley floors. Only applied
  // when a real climb (>=4.5%) actually follows, so genuinely gentle climbs are never shortened.
  if (typeof global !== "undefined" && global.nearestPlace) {
    var ti = base, townIdx = -1, hitClimb = false;
    while (ti < end - 1) {
      if (fwdG(ti, 1.0) >= 4.5) { hitClimb = true; break; }
      var tw = global.nearestPlace(pts[ti][0], pts[ti][1]);
      if (tw && hav(pts[ti][0], pts[ti][1], tw.lat, tw.lon) < 1.0) townIdx = ti;
      ti++;
      if (cum[ti] - cum[base] > 12) break; // safety: do not wander too far up
    }
    if (hitClimb && townIdx > base) base = townIdx;
  }
  if (base >= end - 1) { let bi = 0; for (let i = 1; i <= end; i++) if (el[i] < el[bi]) bi = i; base = bi; }
  if (pin) base = 0; // manual override: base is fixed at the pinned town (path start), use whole climb
  const segPts = pts.slice(base), segEl = el.slice(base), segCum = cum.slice(base).map((c) => c - cum[base]);
  const dist = segCum[segCum.length - 1];
  if (dist < (relax ? 1.2 : MIN_DIST_KM)) return null;
  const gain = segEl[segEl.length - 1] - segEl[0];
  if (gain < (relax ? 140 : MIN_GAIN_M)) return null;
  const avg = gain / (dist * 1000) * 100;
  if (avg < (relax ? 2 : 2.5)) return null;
  let maxg = 0; // windowed (>=300m) to kill DEM noise
  for (let i = 0; i < segPts.length - 1; i++) {
    let j = i; while (j < segPts.length - 1 && segCum[j] - segCum[i] < 0.3) j++;
    const dd = (segCum[j] - segCum[i]) * 1000;
    if (dd >= 250) { const g = (segEl[j] - segEl[i]) / dd * 100; if (g > maxg) maxg = g; }
  }
  if (maxg < avg) maxg = avg;
  const dir = compass(topLat, topLon, segPts[0][0], segPts[0][1]); // slope aspect: direction the versante faces
  const n = Math.min(segEl.length, 30), prof = [];
  for (let i = 0; i < n; i++) prof.push(Math.round(segEl[Math.round(i * (segEl.length - 1) / (n - 1))]));
  return { side: "Versante " + dir, startLat: segPts[0][0], startLon: segPts[0][1], startElevation: Math.round(segEl[0]), endElevation: Math.round(segEl[segEl.length - 1]), distance_km: Math.round(dist * 10) / 10, avgGradient: Math.round(avg * 10) / 10, maxGradient: Math.round(maxg * 10) / 10, traffic: "n/d", exposure: dir, elevationProfile: prof, cat: climbCat(Math.round(dist * 10) / 10, gain, segEl[segEl.length - 1]), track: segPts.map((s) => [s[0], s[1]]) };
}

/* ----- IO ------------------------------------------------------------------- */
async function download(url, dest) {
  try { await access(dest); console.log("  cached " + dest); return; } catch {}
  // Derive an osm.fr mirror from any geofabrik URL (works for any country/region, not just italy).
  // geofabrik:  https://download.geofabrik.de/europe/<path>-latest.osm.pbf
  // osm.fr:     https://download.openstreetmap.fr/extracts/europe/<path>.osm.pbf
  const candidates = [url];
  const m = url.match(/geofabrik\.de\/(.+?)-latest\.osm\.pbf$/);
  if (m) {
    const path = m[1];                       // e.g. "europe/france/rhone-alpes"
    candidates.push("https://download.openstreetmap.fr/extracts/" + path + ".osm.pbf");
    candidates.push("https://download.openstreetmap.fr/extracts/" + path.replace(/-/g, "_") + ".osm.pbf");
  }
  for (let attempt = 0; attempt < 10; attempt++) {
    const u = candidates[attempt % candidates.length];
    try {
      console.log("  downloading " + u + (attempt ? " (try " + (attempt + 1) + ")" : ""));
      const r = await fetch(u, { redirect: "follow" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      await new Promise((res, rej) => { Readable.fromWeb(r.body).pipe(createWriteStream(dest)).on("finish", res).on("error", rej); });
      return;
    } catch (e) {
      const wait = Math.min(120000, 8000 * 2 ** Math.floor(attempt / candidates.length));
      console.warn("  ! failed (" + e.message + "), retry in " + (wait / 1000) + "s");
      await new Promise((s) => setTimeout(s, wait));
    }
  }
  throw new Error("download exhausted: " + url);
}
function osmium(args) { execFileSync("osmium", args, { stdio: ["ignore", "inherit", "inherit"] }); }
function streamSeq(file, onF) {
  return new Promise((res, rej) => {
    const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
    rl.on("line", (ln) => {
      ln = ln.trim(); if (!ln) return;
      if (ln.charCodeAt(0) === 0x1e) ln = ln.slice(1);
      try { onF(JSON.parse(ln)); } catch {}
    });
    rl.on("close", res); rl.on("error", rej);
  });
}

/* ----- main ------------------------------------------------------------------ */
async function main() {
  console.log("locaClimb builder v3 (PBF + Terrarium DEM)");
  await mkdir(WORK, { recursive: true });
  const seqFile = WORK + "/filtered.geojsonseq";

  if (!SKIP_DL) {
    const parts = [];
    for (let i = 0; i < PBF_URLS.length; i++) { const f = WORK + "/part" + i + ".osm.pbf"; await download(PBF_URLS[i], f); parts.push(f); }
    console.log("  osmium merge+filter ...");
    osmium(["merge", ...parts, "-o", WORK + "/merged.osm.pbf", "--overwrite"]);
    let srcPbf = WORK + "/merged.osm.pbf";
    if (BBOX) {
      console.log("  osmium extract bbox " + BBOX + " ...");
      osmium(["extract", "-b", BBOX, "-s", "complete_ways", srcPbf, "-o", WORK + "/clipped.osm.pbf", "--overwrite"]);
      srcPbf = WORK + "/clipped.osm.pbf";
    }
    osmium(["tags-filter", srcPbf, "n/mountain_pass=yes", "n/natural=saddle", "n/natural=peak", "n/place=town", "n/place=village", "n/place=hamlet", ...HW_KEEP.map((h) => "w/highway=" + h), "-o", WORK + "/filtered.osm.pbf", "--overwrite"]);
    console.log("  osmium export ...");
    osmium(["export", WORK + "/filtered.osm.pbf", "-f", "geojsonseq", "-a", "type,id", "-o", seqFile, "--overwrite"]);
  }

  console.log("  stream 1/2: pass nodes ...");
  const passes = [], cands = [], places = [], hintPlaces = [];
  const refWays = ROADCOL ? [] : null;
  await streamSeq(seqFile, (f) => {
    if (!f.geometry || !f.properties) return;
    if (f.geometry.type === "LineString") {
      if (ROADCOL && refWays && f.properties.highway && f.properties.ref && ROADCOL_HW[f.properties.highway] && rideable(f.properties)) refWays.push({ coords: f.geometry.coordinates, ref: f.properties.ref });
      return;
    }
    if (f.geometry.type !== "Point") return;
    if (f.properties.mountain_pass === "yes") {
      passes.push({ src: "pass", oid: String(f.properties["@id"] || "").replace(/\D/g, ""), lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], ele: parseInt(f.properties.ele, 10) || 0, tags: f.properties });
    } else if ((f.properties.natural === "saddle" || f.properties.natural === "peak") && f.properties.name && anyClimbName(f.properties)) {
      // climb candidate: kept only if a road really reaches it (checked in enrichWorker)
      cands.push({ src: f.properties.natural, oid: String(f.properties["@id"] || "").replace(/\D/g, ""), lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], ele: parseInt(f.properties.ele, 10) || 0, tags: f.properties });
    } else if ((f.properties.place === "town" || f.properties.place === "village") && f.properties.name) {
      var pr = f.properties, nv = [pr.name, pr["name:it"], pr["name:de"], pr["name:lld"], pr.alt_name].filter(Boolean);
      var pl = { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], name: pr["name:it"] || pr.name, names: nv };
      places.push(pl); hintPlaces.push(pl);                       // town/village: used for auto-labeling AND hints (match on ANY language tag)
    } else if (f.properties.place === "hamlet" && f.properties.name) {
      var ph = f.properties;
      hintPlaces.push({ lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], name: ph["name:it"] || ph.name, names: [ph.name, ph["name:it"], ph["name:de"], ph["name:lld"], ph.alt_name].filter(Boolean) }); // hamlets: hint resolution only
    }
  });
  console.log("  places (towns/villages): " + places.length);
  const plgrid = new Map();
  for (const t of places) { const k = Math.floor(t.lat / 0.05) + ":" + Math.floor(t.lon / 0.05); if (!plgrid.has(k)) plgrid.set(k, []); plgrid.get(k).push(t); }
  global.nearestPlace = function (lat, lon) {
    const ci = Math.floor(lat / 0.05), cj = Math.floor(lon / 0.05);
    let best = null, bd = 4;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      for (const t of (plgrid.get((ci + a) + ":" + (cj + b)) || [])) { const dd = hav(lat, lon, t.lat, t.lon); if (dd < bd) { bd = dd; best = t; } }
    }
    return best;
  };
  console.log("  passes found: " + passes.length + " (mountain_pass=yes)");
  if (ROADCOL && refWays && refWays.length) {
    const rc = await detectRoadCols(refWays);
    for (const c of rc) cands.push(c);
    console.log("  road-col (Grecia, sperimentale): " + refWays.length + " strade ref -> " + rc.length + " colli");
  }
  // Candidate saddles/peaks: drop any that duplicates a real pass node (or another candidate)
  // within 400 m - OSM often carries both a mountain_pass node and a natural=saddle node.
  {
    const g = new Map(), K = (la, lo) => Math.floor(la / 0.01) + ":" + Math.floor(lo / 0.01);
    const put = (n) => { const k = K(n.lat, n.lon); if (!g.has(k)) g.set(k, []); g.get(k).push(n); };
    const dupe = (n) => {
      const ci = Math.floor(n.lat / 0.01), cj = Math.floor(n.lon / 0.01);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++)
        for (const o of (g.get((ci + a) + ":" + (cj + b)) || [])) if (hav(n.lat, n.lon, o.lat, o.lon) < 0.4) return true;
      return false;
    };
    passes.forEach(put);
    let added = 0;
    cands.sort((a, b) => (b.ele || 0) - (a.ele || 0)); // prefer the tagged-elevation node of a pair
    for (const c of cands) { if (dupe(c)) continue; put(c); passes.push(c); added++; }
    console.log("  climb candidates (saddle/peak, name-matched): " + cands.length + " -> " + added + " new");
  }
  let extraClimbs = [];
  try { extraClimbs = JSON.parse(await readFile(dataPath("climbs_extra.json"), "utf8")); } catch {}
  // Manual base override: base_hints.json maps a pass name -> list of start points (town name or [lat,lon]).
  // For a matched pass we pin those bases (path summit->town, no auto base-finding). Safety net for
  // icon passes the heuristic mis-handles (cones like Amiata). All other passes stay automatic.
  let baseHints = {};
  try { baseHints = JSON.parse(await readFile(dataPath("base_hints.json"), "utf8")); } catch {}
  const normH = (n) => (n || "").toLowerCase().replace(/passo |del |dell'|della |di |monte |dello |colle |col /g, "").trim();
  function hintsFor(name) { var nn = normH(name); for (var key in baseHints) { var nk = normH(key); if (nk && nn.indexOf(nk) >= 0) return baseHints[key]; } return null; } // key must be contained in the pass name (NOT the reverse), so "San Pellegrino" does not match the "...in Alpe" key
  var deacc = function (s) { return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); };
  function resolveTowns(list, sLat, sLon) {
    var out = [];
    for (var h of list) {
      if (Array.isArray(h) && Array.isArray(h[0])) { // waypoint chain: [[lat,lon],...,"Nome"] base->top
        var wps = h.filter(function (e) { return Array.isArray(e); });
        var nmW = null; for (var ei = 0; ei < h.length; ei++) if (typeof h[ei] === "string") nmW = h[ei];
        if (!nmW) nmW = (global.nearestPlace && global.nearestPlace(wps[0][0], wps[0][1]) ? global.nearestPlace(wps[0][0], wps[0][1]).name : "punto");
        out.push({ name: nmW, lat: wps[0][0], lon: wps[0][1], wp: wps });
        continue;
      }
      if (Array.isArray(h)) { var nm = h[2] || (global.nearestPlace && global.nearestPlace(h[0], h[1]) ? global.nearestPlace(h[0], h[1]).name : "punto"); out.push({ name: nm, lat: h[0], lon: h[1] }); continue; } // [lat,lon] or [lat,lon,"Nome"] -> exact point, name kept as label
      // Match quality first, distance second. The old rule accepted ANY place whose name was a
      // substring of the hint, in either direction: a hamlet called "Ca" or "Col" (there are dozens
      // in the Dolomites) is a substring of "canazei" and, being closer to the summit, HIJACKED the
      // target - the BFS then hunted a hamlet up a track instead of the town. Same substring-direction
      // trap as the base_hints keys, one layer down.
      var tgt = deacc(h), best = null, bd = 60, bs = -1;
      var esc2 = function (x) { return x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); };
      for (var t of hintPlaces) {
        var sc2 = -1, nms = t.names || [t.name];
        for (var ni = 0; ni < nms.length; ni++) {
          var tn = deacc(nms[ni]); if (!tn) continue;
          if (tn === tgt) { sc2 = 3; break; }                                              // exact
          if (tgt.length >= 4 && tn.indexOf(tgt) >= 0) { if (sc2 < 2) sc2 = 2; continue; } // "Bormio" -> "Bormio 2000"
          // place name inside the hint ("Prato" <- "Prato allo Stelvio"): whole word only, >=4 chars
          if (tn.length >= 4 && new RegExp("(^|[^a-z0-9])" + esc2(tn) + "([^a-z0-9]|$)").test(tgt) && sc2 < 1) sc2 = 1;
        }
        if (sc2 < 0) continue;
        var dd = hav(sLat, sLon, t.lat, t.lon);
        if (dd > 60) continue;
        if (sc2 > bs || (sc2 === bs && dd < bd)) { bs = sc2; bd = dd; best = t; }
      }
      if (best) out.push({ name: h, lat: best.lat, lon: best.lon });
      else {
        // diagnostic: is there ANY node with this name (ignoring the 60km gate)? distinguishes
        // "nome OSM diverso" (no node at all) from "passo omonimo lontano" (node exists but far -> harmless noise)
        var nd = Infinity;
        for (var t2 of hintPlaces) { var nms2 = t2.names || [t2.name]; for (var nj = 0; nj < nms2.length; nj++) { var tn2 = deacc(nms2[nj]); if (tn2 === tgt || tn2.indexOf(tgt) >= 0 || tgt.indexOf(tn2) >= 0) { var dd2 = hav(sLat, sLon, t2.lat, t2.lon); if (dd2 < nd) nd = dd2; break; } } }
        console.log("    . hint town non trovato: " + h + (nd < Infinity ? " (omonimo a " + Math.round(nd) + "km -> passo errato, ignorato)" : " (nessun nodo con questo nome -> nome OSM diverso)"));
      }
    }
    return out;
  }
  const cellOf = (lat, lon) => Math.floor(lat / 0.05) + ":" + Math.floor(lon / 0.05);
  const pgrid = new Set(passes.map((p) => cellOf(p.lat, p.lon)));
  for (const x of extraClimbs) pgrid.add(cellOf(x.lat, x.lon)); // keep roads near extra climbs too
  function nearPass(lat, lon) {
    const ci = Math.floor(lat / 0.05), cj = Math.floor(lon / 0.05);
    for (let a = -6; a <= 6; a++) for (let b = -6; b <= 6; b++) if (pgrid.has((ci + a) + ":" + (cj + b))) return true;
    return false;
  }

  console.log("  stream 2/2: rideable ways near passes ...");
  const ways = [];
  let uid = 0;
  await streamSeq(seqFile, (f) => {
    if (!f.geometry || f.geometry.type !== "LineString" || !f.properties || !f.properties.highway) return;
    const c = f.geometry.coordinates;
    if (!c || c.length < 2) return;
    const mid = c[Math.floor(c.length / 2)];
    if (!nearPass(mid[1], mid[0]) && !nearPass(c[0][1], c[0][0]) && !nearPass(c[c.length - 1][1], c[c.length - 1][0])) return;
    if (!rideable(f.properties)) return;
    const t = f.properties, tags = { highway: t.highway, name: t.name, ref: t.ref, surface: t.surface, tracktype: t.tracktype, smoothness: t.smoothness, hgv: t.hgv, maxweight: t.maxweight };
    const g = new Float32Array(c.length * 2);
    for (let k = 0; k < c.length; k++) { g[k * 2] = c[k][1]; g[k * 2 + 1] = c[k][0]; }
    ways.push({ uid: uid++, tags, g });
  });
  console.log("  ways kept: " + ways.length);

  // vertex graph: index EVERY vertex but only for ways close to a pass (full continuity, bounded memory)
  function wayNearPass(w) {
    for (let i = 0; i < glen(w); i += 5) if (nearPass(gx(w,i), gy(w,i))) return true;
    return nearPass(gx(w, glen(w)-1), gy(w, glen(w)-1));
  }
  const vertexMap = new Map();
  for (const w of ways) for (let idx = 0; idx < glen(w); idx++) {
    const k = vkey(gx(w, idx), gy(w, idx));
    let a = vertexMap.get(k); if (!a) { a = []; vertexMap.set(k, a); }
    a.push({ w, idx });
  }
  const wgrid = new Map();
  for (const w of ways) for (let i = 0; i < glen(w); i += 10) {
    const k = cellOf(gx(w,i), gy(w,i));
    if (!wgrid.has(k)) wgrid.set(k, []);
    wgrid.get(k).push({ w, idx: i });
  }
  const CLS = { primary:6, primary_link:6, secondary:5, secondary_link:5, tertiary:4, tertiary_link:4, unclassified:3, residential:2, living_street:2, cycleway:2, track:1, service:0 };
  function snap(lat, lon, maxKm) {
    const ci = Math.floor(lat / 0.05), cj = Math.floor(lon / 0.05);
    let best = null, bs = -1;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const lst = wgrid.get((ci + a) + ":" + (cj + b)) || [];
      for (const c of lst) {
        const dd = hav(lat, lon, gx(c.w,c.idx), gy(c.w,c.idx));
        if (dd >= maxKm) continue;
        const cl = CLS[c.w.tags.highway] != null ? CLS[c.w.tags.highway] : 3;
        const score = cl * 10 - dd * 20; // class first, then proximity
        if (score > bs) { bs = score; best = c; }
      }
    }
    return best;
  }
  function candWays(lat, lon, radKm, maxN) {
    const ci = Math.floor(lat / 0.05), cj = Math.floor(lon / 0.05);
    const bestBy = new Map(); // uid -> {w,idx,dd}
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const lst = wgrid.get((ci + a) + ":" + (cj + b)) || [];
      for (const c of lst) {
        const dd = hav(lat, lon, gx(c.w,c.idx), gy(c.w,c.idx));
        if (dd >= radKm) continue;
        const cur = bestBy.get(c.w.uid);
        if (!cur || dd < cur.dd) bestBy.set(c.w.uid, { w: c.w, idx: c.idx, dd });
      }
    }
    return [...bestBy.values()].sort((x, y) => x.dd - y.dd).slice(0, maxN);
  }
  function bearing(la1, lo1, la2, lo2) { var p = Math.PI / 180; var y = Math.sin((lo2 - lo1) * p) * Math.cos(la2 * p); var x = Math.cos(la1 * p) * Math.sin(la2 * p) - Math.sin(la1 * p) * Math.cos(la2 * p) * Math.cos((lo2 - lo1) * p); return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360; }
  function resampleByDist(pts, stepKm) {
    if (pts.length < 3) return pts;
    var out = [pts[0]], acc = 0;
    for (var i = 1; i < pts.length - 1; i++) {
      acc += hav(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
      var b1 = bearing(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
      var b2 = bearing(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
      var db = Math.abs(b1 - b2); if (db > 180) db = 360 - db;
      if (db > 18 || acc >= stepKm) { out.push(pts[i]); acc = 0; } // keep corners (hairpins) + every stepKm on straights
    }
    out.push(pts[pts.length - 1]);
    if (out.length > 700) { var o = [], n = 700; for (var z = 0; z < n; z++) o.push(out[Math.round(z * (out.length - 1) / (n - 1))]); out = o; }
    return out;
  }
  function neighbors(key) {
    var out = [], lst = vertexMap.get(key);
    if (!lst) return out;
    for (var e of lst) {
      var w = e.w, i = e.idx, rf = (w.tags && (w.tags.ref || w.tags.name)) || "", hw = (w.tags && w.tags.highway) || "", sf = (w.tags && w.tags.surface) || "";
      [i - 1, i + 1].forEach(function (j) {
        if (j < 0 || j >= glen(w)) return;
        var k2 = vkey(gx(w, j), gy(w, j));
        out.push({ key: k2, seg: hav(gx(w, i), gy(w, i), gx(w, j), gy(w, j)), ref: rf, hw: hw, surf: sf });
      });
    }
    return out;
  }
  // BFS shortest road-paths from the summit over the buffer network (no branch guessing)
  async function buildVersanti(lat, lon, capKm, relax, anchor, targets) {
    var ch = snap(lat, lon, 0.8);
    if (!ch) return [];
    // The hint key is matched by substring, so a key can hit a DIFFERENT/far pass too. Keep only
    // targets within road range of THIS summit; if none remain, treat the pass as un-hinted (auto)
    // instead of pinning to far towns it can never reach (the old "town non trovato"/"non raggiunto"
    // noise on the wrong pass).
    if (targets && targets.length) {
      var near = targets.filter(function (t) { return hav(lat, lon, t.lat, t.lon) < capKm * 1.3; });
      targets = near.length ? near : null;
    }
    var startK = vkey(gx(ch.w, ch.idx), gy(ch.w, ch.idx));
    var startLat = gx(ch.w, ch.idx), startLon = gy(ch.w, ch.idx);
    var dist = new Map(), cost = new Map(), parent = new Map(), coord = new Map(), edgeRef = new Map();
    dist.set(startK, 0); cost.set(startK, 0); coord.set(startK, [startLat, startLon]);
    // Pinned hints: pre-snap each target town to the nearest KEPT road, then STOP as soon as every
    // target is reached. Min-cost Dijkstra (heap) where COST adds a road-class/surface penalty (see
    // edgeExtra) so the path follows the official CLASSIFIED paved road, while real km (dist) is kept
    // separately for the capKm bound -> penalty steers without ever length-capping a minor-road climb.
    var tgReach = (targets && targets.length) ? targets.map(function (tg) {
      var s = snap(tg.lat, tg.lon, 2.5);
      return { lat: s ? gx(s.w, s.idx) : tg.lat, lon: s ? gy(s.w, s.idx) : tg.lon, done: false };
    }) : null;
    var BFS_CAP = tgReach ? 3000000 : 200000;
    var heap = [[0, startK]];
    var settled = new Set();
    while (heap.length) {
      var top = hpop(heap), c = top[1];
      if (settled.has(c)) continue;
      settled.add(c);
      if (!tgReach && (dist.get(c) || 0) > capKm) break; // auto: pure-distance bound
      if (tgReach) {
        var cc = coord.get(c), allDone = true;
        for (var tr of tgReach) { if (!tr.done && hav(cc[0], cc[1], tr.lat, tr.lon) < 0.3) tr.done = true; if (!tr.done) allDone = false; }
        if (allDone) break;
      }
      var dc = dist.get(c), kc = cost.get(c);
      for (var nb of neighbors(c)) {
        if (settled.has(nb.key)) continue;
        var nreal = dc + nb.seg;
        if (nreal > capKm) continue;                                  // real-km cap (never inflated)
        var ncost = kc + nb.seg * (1 + edgeExtra(nb)); // class/surface steering on hinted AND auto -> follow paved SS/SP/SR approaches, not gravel shortcuts (real km stays in `dist`)
        if (!cost.has(nb.key) || ncost < cost.get(nb.key)) {
          dist.set(nb.key, nreal); cost.set(nb.key, ncost); parent.set(nb.key, c); edgeRef.set(nb.key, nb.ref);
          if (!coord.has(nb.key)) { var p2 = nb.key.split(","); coord.set(nb.key, [parseFloat(p2[0]), parseFloat(p2[1])]); }
          hpush(heap, ncost, nb.key);
        }
      }
      if (settled.size > BFS_CAP) break; // safety
    }
    // --- manual base override: pin each requested start town -------------------
    // For a hinted pass, build exactly the requested versanti: shortest road path summit -> town,
    // base pinned at the town (no auto base-finding -> no overrun, no missing sides).
    if (targets && targets.length) {
      var pinned = [];
      // Point-to-point min-cost route between two coords (same class/surface penalty as the main
      // search). Used to stitch a waypoint chain so a pinned versante follows an EXACT road the
      // shortest path would otherwise skip (e.g. the steeper "Dritta Contador", or a Grappa side
      // that must keep its own lower road instead of merging onto the neighbouring one).
      function dijkstraSeg(aLat, aLon, bLat, bLon, capSeg) {
        var sa = snap(aLat, aLon, 0.6); if (!sa) return null; // tight: a waypoint must sit ON its road, not a parallel one
        var startK = vkey(gx(sa.w, sa.idx), gy(sa.w, sa.idx));
        var distM = new Map([[startK, 0]]), costM = new Map([[startK, 0]]), par = new Map(), crd = new Map();
        crd.set(startK, [gx(sa.w, sa.idx), gy(sa.w, sa.idx)]);
        var h = [[0, startK]], seen = new Set(), goalK = null;
        while (h.length) {
          var t = hpop(h), c = t[1];
          if (seen.has(c)) continue; seen.add(c);
          var cc = crd.get(c);
          if (hav(cc[0], cc[1], bLat, bLon) < 0.12) { goalK = c; break; }
          var dc = distM.get(c), kc = costM.get(c);
          if (dc > capSeg) continue;
          for (var nb of neighbors(c)) {
            if (seen.has(nb.key)) continue;
            var nreal = dc + nb.seg; if (nreal > capSeg) continue;
            var ncost = kc + nb.seg * (1 + edgeExtra(nb));
            if (!costM.has(nb.key) || ncost < costM.get(nb.key)) {
              distM.set(nb.key, nreal); costM.set(nb.key, ncost); par.set(nb.key, c);
              if (!crd.has(nb.key)) { var p2 = nb.key.split(","); crd.set(nb.key, [parseFloat(p2[0]), parseFloat(p2[1])]); }
              hpush(h, ncost, nb.key);
            }
          }
          if (seen.size > 150000) break;
        }
        if (!goalK) return null;
        var path = [], k = goalK; while (k != null) { path.push(crd.get(k)); k = par.get(k); }
        return path.reverse(); // a -> b
      }
      function routeChain(wps) { // wps: [[lat,lon],...] base -> top; returns base -> summit, or null
        var full = [];
        for (var i = 0; i < wps.length - 1; i++) {
          var hop = hav(wps[i][0], wps[i][1], wps[i + 1][0], wps[i + 1][1]);
          var seg = dijkstraSeg(wps[i][0], wps[i][1], wps[i + 1][0], wps[i + 1][1], hop * 3 + 3);
          if (!seg || seg.length < 2) return null;
          full = full.length ? full.concat(seg.slice(1)) : seg;
        }
        var lw = wps[wps.length - 1];
        var toTop = dijkstraSeg(lw[0], lw[1], lat, lon, hav(lw[0], lw[1], lat, lon) * 3 + 5);
        if (toTop && toTop.length > 1) full = full.concat(toTop.slice(1));
        return full;
      }
      for (var ti2 = 0; ti2 < targets.length; ti2++) {
        var tg = targets[ti2], aim = tgReach[ti2], pth = null;
        if (tg.wp) { // forced waypoint chain
          var chain = routeChain(tg.wp);
          if (!chain || chain.length < 4) { console.log("    . hint " + tg.name + ": catena waypoint non instradabile"); continue; }
          pth = resampleByDist(chain.slice().reverse(), 0.05); // summit -> base
        } else {
          var bestK = null, bestD = 2.0, nearest = Infinity; // nearest reached vertex to the (snapped) town
          coord.forEach(function (ll, k) { var dd = hav(aim.lat, aim.lon, ll[0], ll[1]); if (dd < nearest) nearest = dd; if (dd < bestD) { bestD = dd; bestK = k; } });
          // Say WHAT actually failed: the old text ("non raggiunto entro NNkm") named the distance cap,
          // but the real test is "did the BFS come within 2 km of the town?". The gap below tells the
          // two apart: ~2-4 km = threshold too tight; tens of km = wrong town resolved / broken graph.
          if (bestK == null) { console.log("    . hint " + tg.name + " [" + aim.lat.toFixed(4) + "," + aim.lon.toFixed(4) + "]: nessun vertice entro 2 km (il piu vicino e a " + (nearest === Infinity ? "?" : nearest.toFixed(1)) + " km; BFS " + coord.size + " nodi, cap " + capKm + " km)"); continue; }
          var rp = [], kk = bestK, gd = 0;
          while (kk != null && gd++ < 8000) { rp.push(coord.get(kk)); kk = parent.get(kk); }
          if (rp.length < 4) continue;
          pth = resampleByDist(rp.slice().reverse(), 0.05); // summit -> town
        }
        var ev = await elevations(pth); if (!ev) continue;
        var pv = buildSide(pth, ev, lat, lon, true, true);     // 1st try: base pinned at the town
        if (!pv) pv = buildSide(pth, ev, lat, lon, true, false); // fallback: valley-trim finds the base near the town
        if (!pv) { console.log("    . hint " + tg.name + ": salita non valida"); continue; }
        pv.side = "Da " + tg.name;
        // dedup by ORIGIN, not by track overlap: drop a side only if it starts in (nearly) the same
        // place AND faces the same way as one already kept. A forced waypoint side (tg.wp) is NEVER
        // deduped - it was requested explicitly to coexist with the road it parallels.
        var dup = false;
        if (!tg.wp) for (var pq of pinned) {
          var dStart = hav(pv.startLat, pv.startLon, pq.startLat, pq.startLon);
          var bv = bearing(lat, lon, pv.startLat, pv.startLon), bu = bearing(lat, lon, pq.startLat, pq.startLon);
          var db = Math.abs(bv - bu); if (db > 180) db = 360 - db;
          if (dStart < 1.2 && db < 25) { dup = true; break; }
        }
        if (!dup) pinned.push(pv); else console.log("    . hint " + tg.name + ": stesso start/direzione di un altro versante, saltato");
      }
      return pinned;
    }
    // --- C: candidates = branch tips (graph leaves), not 1-per-octant -----------
    // The shortest-path tree's leaves are the natural ends of each road branch, so distinct
    // valleys in the same bearing (Castel del Piano vs Seggiano on Amiata; Piandelagotti on
    // Radici) each surface instead of collapsing into one octant. B trims any tip that ran
    // past the real base. An octant fallback keeps angular coverage on wide cones.
    var parents = new Set(parent.values());
    var leaves = [], perOct = new Map();
    dist.forEach(function (d, k) {
      if (d < 1.5) return;
      var ll = coord.get(k), oc = Math.floor(bearing(lat, lon, ll[0], ll[1]) / 45);
      var cur = perOct.get(oc); if (!cur || d > cur.d) perOct.set(oc, { k: k, d: d });
      if (!parents.has(k)) leaves.push({ k: k, d: d });           // branch tip
    });
    leaves.sort(function (a, b) { return b.d - a.d; });
    var candKeys = new Set(), cands = [];
    for (var lf of leaves.slice(0, 14)) if (!candKeys.has(lf.k)) { candKeys.add(lf.k); cands.push(lf); }
    for (var oe of perOct.values()) if (!candKeys.has(oe.k)) { candKeys.add(oe.k); cands.push(oe); } // fallback
    // reconstruct each path summit->base, sample DEM, trim
    var raw = [];
    for (var ent of cands) {
      var rawPath = [], rawRef = [], k = ent.k, guard = 0;
      while (k != null && guard++ < 5000) { rawPath.push(coord.get(k)); rawRef.push(edgeRef.get(k) || ""); k = parent.get(k); }
      if (rawPath.length < 4) continue;
      // --- ref-span trim: a named pass road (SS300 del Gavia, SS38 ...) spans town -> summit.
      // Keep only the contiguous summit-side stretch sharing the summit road's ref; cut where a
      // DIFFERENT ref takes over for > 0.4km (SS300 -> SS42 at Ponte di Legno). Empty refs (gaps,
      // links) never break continuity. No-op when the summit road is unnamed -> safe fallback,
      // and it can only RAISE the base (gradient/town/basin in buildSide refine further up).
      var isMajorRef = function (r) { return /^(SS|SP|SR)\s?\d/i.test(r || ""); }; // only state/regional/provincial numbered roads
      var rcum = [0]; for (var jr = 1; jr < rawPath.length; jr++) rcum.push(rcum[jr - 1] + hav(rawPath[jr - 1][0], rawPath[jr - 1][1], rawPath[jr][0], rawPath[jr][1]));
      var rlast = rawPath.length - 1, rcnt = {};
      for (var js = rlast - 1; js >= 0 && rcum[rlast] - rcum[js] < 1.5; js--) { if (isMajorRef(rawRef[js])) rcnt[rawRef[js]] = (rcnt[rawRef[js]] || 0) + 1; }
      var sumRef = "", bestc = 0; for (var rk in rcnt) if (rcnt[rk] > bestc) { bestc = rcnt[rk]; sumRef = rk; }
      if (sumRef) {
        var run = 0, runTop = -1, baseCut = 0;
        for (var jt = rlast - 1; jt >= 0; jt--) {
          if (isMajorRef(rawRef[jt]) && rawRef[jt] !== sumRef) { if (runTop < 0) runTop = jt + 1; run += rcum[jt + 1] - rcum[jt]; if (run > 0.4) { baseCut = runTop; break; } }
          else { run = 0; runTop = -1; }
        }
        // Apply ONLY if a substantial climb (>= 5km) remains, so a real climb whose summit ref
        // differs from its body (Grappa, Futa) is never orphaned into a short fragment. The
        // absolute floor (not a fraction of total) is what makes cutting a LONG valley safe.
        if (baseCut > 0 && (rcum[rlast] - rcum[baseCut]) >= 5) rawPath = rawPath.slice(baseCut);
      }
      var path = rawPath.slice().reverse(); // summit -> base
      if (path.length < 4) continue;
      path = resampleByDist(path, 0.05); // ~50m on straights, full resolution on hairpins (adaptive)
      var ev = await elevations(path); if (!ev) continue;
      var v = buildSide(path, ev, lat, lon, relax); // path is summit->base; buildSide reverses internally
      if (v) raw.push(v);
    }
    raw.sort(function (a, b) { return b.distance_km - a.distance_km; });
    function overlapFrac(a, b) { // fraction of a.track points that lie within 150m of any b.track point (sampled)
      if (!a.track || !b.track) return 0;
      var hit = 0, tot = 0;
      for (var i = 0; i < a.track.length; i += 3) {
        tot++; var pa = a.track[i], near = false;
        for (var j = 0; j < b.track.length; j += 3) { if (hav(pa[0], pa[1], b.track[j][0], b.track[j][1]) < 0.15) { near = true; break; } }
        if (near) hit++;
      }
      return tot ? hit / tot : 0;
    }
    var kept = [];
    for (var v2 of raw) {
      var dup = false;
      for (var u of kept) {
        var close = hav(v2.startLat, v2.startLon, u.startLat, u.startLon) < 2.0;
        var bv = bearing(lat, lon, v2.startLat, v2.startLon), bu = bearing(lat, lon, u.startLat, u.startLon);
        var db = Math.abs(bv - bu); if (db > 180) db = 360 - db;
        var ov = Math.max(overlapFrac(v2, u), overlapFrac(u, v2));
        if ((close && db < 45) || ov > 0.5) { dup = true; break; } // same base-direction OR >50% shared road
      }
      if (!dup) kept.push(v2);
      if (kept.length >= 7) break;
    }
    for (var v3 of kept) { var t = global.nearestPlace ? global.nearestPlace(v3.startLat, v3.startLon) : null; v3._town = t ? t.name : null; if (t) v3.side = "Da " + t.name; }
    var byTown = new Map(), finalv = [];
    for (var v4 of kept) {
      if (v4._town && byTown.has(v4._town)) { var u4 = byTown.get(v4._town); if (v4.distance_km > u4.distance_km) { finalv[finalv.indexOf(u4)] = v4; byTown.set(v4._town, v4); } continue; }
      if (v4._town) byTown.set(v4._town, v4);
      finalv.push(v4);
    }
    finalv.forEach(function (v) { delete v._town; });
    // Drop spurious short versanti: a side far shorter than the longest is usually a fragment
    // of a climb whose lower part is missing from the extract (e.g. Umbrail's Swiss base) or a
    // mid-climb stub. Keep it only if it is >=40% of the longest side OR >=8km in its own right.
    if (finalv.length > 1) {
      var lmax = 0; finalv.forEach(function (v) { if (v.distance_km > lmax) lmax = v.distance_km; });
      finalv = finalv.filter(function (v) { return v.distance_km >= lmax * 0.4 || v.distance_km >= 8; });
    }
    return finalv;
  }

  let existing = [];
  try { existing = JSON.parse(await readFile(OUT, "utf8")); } catch {}
  const byId = new Map(existing.map((p) => [p.id, p]));

  let kept = 0, skipped = 0, ok = 0, fail = 0, done = 0, pidx = 0;
  const POOL = 8; // concurrent enrichment workers (DEM fetches are network-bound; tile cache is shared)
  async function enrichWorker() {
    while (pidx < passes.length && done < MAX_ENRICH) {
      const el = passes[pidx++];
      const isCand = el.src === "saddle" || el.src === "peak";
      if (!isCand && (!el.ele || el.ele < MIN_ELE)) { skipped++; continue; }
      // Candidates snap tighter: a road 500 m from a peak passes BY it, it does not climb TO it.
      // Snap FIRST (grid lookup, free) so the DEM is only touched for nodes that reached a road.
      const ch = snap(el.lat, el.lon, isCand ? 0.3 : 0.5);
      if (!ch) { skipped++; continue; }
      const slat0 = gx(ch.w,ch.idx), slon0 = gy(ch.w,ch.idx);
      if (isCand) {
        if (!el.ele) { const de = await elevAt(el.lat, el.lon); if (de == null) { skipped++; continue; } el.ele = Math.round(de); } // saddles/peaks often carry no ele tag
        if (el.ele < MIN_ELE) { skipped++; continue; }
        // The decisive filter: the snapped road point must sit AT the saddle/summit height. A road
        // crossing 250 m below a peak is a road on its flank, not a climb to it.
        const re = await elevAt(slat0, slon0);
        if (re == null || Math.abs(re - el.ele) > 55) { skipped++; continue; }
      }
      kept++;
      const id = "osm-" + el.oid;
      const rawName = el.tags.name || "Passo";
      const name = NAME_ALIAS[rawName] || rawName; // RAW: escaping happens in the frontend (esc())
      const slat = slat0, slon = slon0;
      const rec = byId.get(id) || { id };
      rec.name = name; rec.lat = slat; rec.lon = slon; rec.elevation = el.ele; rec.snapped = true; rec.nodeId = el.oid;
      if (isCand || el.src === "roadcol") rec.src = el.src; // "saddle"/"peak": kept via toponym + road-reaches-summit, not mountain_pass=yes
      rec.surfaceLabel = surfaceLabel(ch.w.tags);
      const tr = computeTraffic(ch.w.tags, el.ele);
      rec.trafFeriale = tr.fer; rec.trafWeekend = tr.wkd; rec.trucks = tr.trucks;
      if (!(rec.versanti && rec.versanti.length) || rec.algo !== ALGO_VERSION || REENRICH || hintsFor(name)) {
        done++;
        if (REENRICH || rec.algo !== ALGO_VERSION) { rec.versanti = null; rec.cat = null; } // drop stale before rebuild
        try {
          const hl = hintsFor(name);
          const tgs = hl ? resolveTowns(hl, slat, slon) : null;
          const vs = await buildVersanti(slat, slon, tgs ? 38 : 30, false, nameTokens(name), tgs);
          if (vs.length) {
            rec.versanti = vs;
            rec.difficulty = Math.max(...rec.versanti.map((v) => estDiff(v.distance_km, v.endElevation - v.startElevation, v.endElevation)));
            rec.cat = rec.versanti.map((v) => v.cat).filter(Boolean).sort((a, b) => catRank(b) - catRank(a))[0] || null;
            rec.algo = ALGO_VERSION; // stamp only on success; no-climb passes stay retryable
            rec.updatedAt = BUILD_DATE;
            ok++;
          } else fail++;
        } catch (e) { fail++; if (fail <= 8) console.log("    ! enrich error (" + rec.name + "): " + e.message); }
        if (done % 250 === 0) console.log("  ... " + done + " (ok " + ok + ", no-climb " + fail + ", dem " + demCache.size + ")");
      }
      byId.set(id, rec);
    }
  }
  await Promise.all(Array.from({ length: POOL }, function () { return enrichWorker(); }));
  console.log("  kept " + kept + ", skipped " + skipped + "; enriched ok " + ok + ", no-climb " + fail);

  // extra curated climbs (no mountain_pass node): climbs_extra.json [{id,name,lat,lon,region?}]
  try {
    const extra = extraClimbs;
    console.log("  extra climbs: " + extra.length);
    for (const x of extra) {
      const ch = snap(x.lat, x.lon, 0.5);
      if (!ch) { console.log("    - " + x.name + ": no road"); continue; }
      const slat = gx(ch.w,ch.idx), slon = gy(ch.w,ch.idx);
      const xtg = x.from ? resolveTowns([].concat(x.from), slat, slon) : null; // pin the historic base(s) if given
      const vs = await buildVersanti(slat, slon, xtg ? 16 : 12, true, nameTokens(x.name), xtg);
      if (!vs.length) { console.log("    - " + x.name + ": no climb"); continue; }
      const id = "x-" + x.id;
      const rec = byId.get(id) || { id };
      rec.name = x.name; rec.lat = slat; rec.lon = slon;
      rec.elevation = Math.max(...vs.map((v) => v.endElevation));
      rec.snapped = true; rec.surfaceLabel = surfaceLabel(ch.w.tags);
      const tr = computeTraffic(ch.w.tags, rec.elevation);
      rec.trafFeriale = tr.fer; rec.trafWeekend = tr.wkd; rec.trucks = tr.trucks;
      rec.versanti = vs;
      rec.difficulty = Math.max(...vs.map((v) => estDiff(v.distance_km, v.endElevation - v.startElevation, v.endElevation)));
      rec.cat = vs.map((v) => v.cat).filter(Boolean).sort((a, b) => catRank(b) - catRank(a))[0] || null;
      rec.algo = ALGO_VERSION; rec.updatedAt = BUILD_DATE;
      byId.set(id, rec);
      console.log("    + " + x.name + ": " + vs.length + " versanti, cat " + (rec.cat || "-"));
    }
  } catch (e) { /* no extra file, fine */ }

  // --- prune stale OSM orphans (nodes no longer in the current extract) -----------
  const liveOsm = new Set(passes.map((p) => "osm-" + p.oid));
  let pruned = 0;
  for (const [id] of [...byId]) { if (id.indexOf("osm-") === 0 && !liveOsm.has(id)) { byId.delete(id); pruned++; } }
  if (pruned) console.log("  pruned stale OSM orphans: " + pruned);

  // --- D: cross-pass overlap dedup ------------------------------------------------
  // Two pass nodes on the SAME road (e.g. Passo delle Radici and the lesser-known Foce di
  // Terrarossa, both up Casoni di Profecchia) generate near-identical versanti. For each pair
  // of summits within 4 km, a versante of the weaker (lower) OSM pass that shares > 60% of its
  // track with a versante of the stronger one is removed; an OSM pass emptied this way is
  // absorbed. Curated/extra (x-) climbs are never stripped. Disable with --no-crossdedup.
  if (!NO_XDEDUP) {
    const isOsm = (id) => String(id).indexOf("osm-") === 0;
    const recs = [...byId.values()].filter((r) => r.versanti && r.versanti.length);
    const grid = new Map();
    for (const r of recs) { const k = Math.floor(r.lat / 0.05) + ":" + Math.floor(r.lon / 0.05); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(r); }
    const near = (r) => { const ci = Math.floor(r.lat / 0.05), cj = Math.floor(r.lon / 0.05), out = []; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const o of (grid.get((ci + a) + ":" + (cj + b)) || [])) if (o !== r) out.push(o); return out; };
    const trkOverlap = (va, vb) => { if (!va.track || !vb.track) return 0; let hit = 0, tot = 0; for (let i = 0; i < va.track.length; i += 4) { tot++; const pa = va.track[i]; for (let j = 0; j < vb.track.length; j += 4) if (hav(pa[0], pa[1], vb.track[j][0], vb.track[j][1]) < 0.15) { hit++; break; } } return tot ? hit / tot : 0; };
    const weakerOf = (r, o) => { if ((r.elevation || 0) !== (o.elevation || 0)) return (r.elevation || 0) < (o.elevation || 0) ? r : o; return (r.versanti.length <= o.versanti.length) ? r : o; };
    let removedV = 0, absorbed = 0;
    for (const r of recs) for (const o of near(r)) {
      if (hav(r.lat, r.lon, o.lat, o.lon) > 1.5) continue; // only truly adjacent summits (Radici/Foce di Terrarossa), not distinct climbs sharing a lower road
      const weak = weakerOf(r, o), strong = weak === r ? o : r;
      if (!isOsm(weak.id) || !weak.versanti.length) continue; // only strip OSM; never extra/curated
      weak.versanti = weak.versanti.filter((wv) => {
        for (const sv of strong.versanti) if (Math.max(trkOverlap(wv, sv), trkOverlap(sv, wv)) > 0.6) { removedV++; return false; }
        return true;
      });
    }
    for (const [id, r] of [...byId]) if (isOsm(id) && Array.isArray(r.versanti) && r.versanti.length === 0) { byId.delete(id); absorbed++; }
    if (removedV || absorbed) console.log("  cross-dedup: removed " + removedV + " overlapping versanti, absorbed " + absorbed + " passes");
  }

  // A saddle/peak candidate that yields no climb is noise: it would still get a marker (the purple
  // "no climb data" dot) for nothing. A mountain_pass=yes node stays even without a computed climb -
  // it is a real geographic pass. rec.src is only set on candidates, so this never touches the rest.
  {
    let dropped = 0;
    for (const [id, r] of [...byId]) {
      if (!r.src) continue;                                   // only ever prunes saddle/peak candidates
      const vs = r.versanti || [];
      let best = 0;
      for (const v of vs) { const g = (v.endElevation || 0) - (v.startElevation || 0); if (g > best) best = g; }
      if (!vs.length || best < CAND_MIN_GAIN) { byId.delete(id); dropped++; }
    }
    if (dropped) console.log("  dropped " + dropped + " candidate(s)" + (CAND_MIN_GAIN > 0 ? ": no climb or gain < " + CAND_MIN_GAIN + " m" : ": no climb computed"));
  }

  const result = [...byId.values()].sort((a, b) => (b.elevation || 0) - (a.elevation || 0));
  await writeFile(OUT, JSON.stringify(result, J5) + "\n", "utf8"); // compact + 5-decimal coords: same data, ~55% smaller download
  console.log("  wrote " + OUT + " (" + result.length + ")");

  if (!NO_CURATED) {
    try {
      const code = await readFile(dataPath("passes_data.js"), "utf8");
      const ctx = {}; vm.createContext(ctx); vm.runInContext(code, ctx);
      const overrides = {};
      const norm = (n) => (n || "").toLowerCase().replace(/passo |colle |col |della |dello |del |di |monte /g, "").trim();
      for (const p of (ctx.PASSES_DATA || [])) {
        let ch = snap(p.lat, p.lon, 1.2);
        // Verify the snap landed AT the pass: several curated coords are 0.5-3 km off (hand-placed),
        // and snapping them lands mid-climb. San Marco snapped 370 m BELOW the summit, so its versanti
        // were built to the wrong top AND the OSM twin fell outside the 2 km dedup radius -> the pass
        // showed up twice. The DEM is the arbiter, exactly as for the saddle/peak candidates.
        let landed = null;
        if (ch) { landed = await elevAt(gx(ch.w, ch.idx), gy(ch.w, ch.idx)); }
        const offPass = !ch || landed == null || !p.elevation || Math.abs(landed - p.elevation) > 60;
        if (offPass) {
          // Relocate onto the OSM mountain_pass node with the same name AND the same elevation.
          // Name alone is not enough: for "Passo della Presolana" the NEAREST namesake is
          // "Colle della Presolana" (1698 m), a different saddle; the real pass (1297 m) is 3.4 km away.
          const key = norm(p.name);
          const hit = key ? passes
            .filter((el) => el.src === "pass" && norm(el.tags.name).indexOf(key) >= 0
                         && Math.abs((el.ele || 0) - p.elevation) <= 40 && hav(p.lat, p.lon, el.lat, el.lon) < 8)
            .sort((a, b) => hav(p.lat, p.lon, a.lat, a.lon) - hav(p.lat, p.lon, b.lat, b.lon))[0] : null;
          const ch2 = hit ? snap(hit.lat, hit.lon, 0.5) : null;
          if (ch2) {
            console.log("    ~ " + p.name + ": snap a " + (landed == null ? "?" : Math.round(landed)) + " m invece di " + p.elevation
              + " m -> riposizionato sul nodo OSM (" + Math.round(hav(p.lat, p.lon, hit.lat, hit.lon) * 1000) + " m dalle coordinate curate)");
            ch = ch2;
          } else if (ch) {
            console.log("    ! " + p.name + ": snap a " + (landed == null ? "?" : Math.round(landed)) + " m invece di " + p.elevation + " m, nessun nodo OSM omonimo alla quota giusta - coordinate curate da correggere a mano");
          }
        }
        if (!ch) { console.log("    - " + p.name + ": no road"); continue; }
        const slat = gx(ch.w,ch.idx), slon = gy(ch.w,ch.idx);
        try {
          // Use base_hints here too: a pass in BOTH passes_data and base_hints (Mortirolo, Gavia...)
          // now gets its precise PINNED sides in the override the app actually shows, instead of the
          // imprecise auto valley-trim. Falls back to auto when no hint resolves.
          const chl = hintsFor(p.name);
          let ctgs = chl ? resolveTowns(chl, slat, slon) : null;
          if (chl && (!ctgs || !ctgs.length)) ctgs = null;
          const useH = ctgs && ctgs.length;
          const top = await buildVersanti(slat, slon, useH ? 38 : 32, true, nameTokens(p.name), useH ? ctgs : null);
          if (!top.length) { console.log("    - " + p.name + ": no climb"); continue; }
          overrides[p.id] = { lat: slat, lon: slon, versanti: top, difficulty: Math.max(...top.map((v) => estDiff(v.distance_km, v.endElevation - v.startElevation, v.endElevation))), cat: top.map((v) => v.cat).filter(Boolean).sort((a, b) => catRank(b) - catRank(a))[0] || null, algo: ALGO_VERSION, updatedAt: BUILD_DATE };
          console.log("    + " + p.name + ": " + top.length + " versanti" + (useH ? " (hint)" : "") + ", cat " + (overrides[p.id].cat || "-"));
        } catch (e) { console.log("    - " + p.name + ": " + e.message); }
      }
      await writeFile(dataPath("curated_overrides.json"), JSON.stringify(overrides, J5) + "\n", "utf8");
      console.log("  wrote curated_overrides.json (" + Object.keys(overrides).length + ")");
    } catch (e) { console.warn("  ! curated skipped: " + e.message); }
  }
  console.log("DONE");
}
main().catch((e) => { console.error("FATAL: " + e.stack); process.exit(1); });
