#!/usr/bin/env node
/*
 * winter_status.mjs - the "now" state of data/winter_closures.json from the sites that publish it in a
 * regular form (Rick 11/11/2026: a GitHub Action, no AI). Used by .github/workflows/winter-status.yml.
 *
 *   alpen-paesse.ch      one page per Swiss pass: status icons (icon-status-closed / -open) + headline
 *   meteomontagnavaltellina.it/passi_alpini_info.html   one row per pass: traffic light image
 *                        (SEMAFORO_ROSSO = closed, verde = open; ARANCIONE = snowy road: no update)
 *   cols-cyclisme.com/ouverture-cols.htm   one row per col: picto-ferme / picto-ouvert
 *
 * One source per pass (no conflicts). Only "now" changes: closed true/false, checked (today), source;
 * "since" is written only when we SEE the change (open -> closed or closed -> open), never guessed.
 * A source that answers but yields no rows, or a mapped pass that is missing from its page, is an
 * error: the action fails (red) instead of writing a wrong state. Pure parsers are exported for
 * test/winter-status.test.mjs.
 *
 *   node scripts/winter_status.mjs --fetch status.json     fetch every source, write what they say
 *   node scripts/winter_status.mjs --apply status.json     update data/winter_closures.json
 *   node scripts/winter_status.mjs --show status.json      print the comparison table
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dataPath } from "./lib/paths.mjs";

const UA = { "User-Agent": "LocaRide-status/1.0 (+https://locaride.app; privacy@locaride.app)" };
export const AP = "https://www.alpen-paesse.ch/en/alpenpaesse/";
export const MMV = "https://www.meteomontagnavaltellina.it/passi_alpini_info.html";
export const COLS = "https://www.cols-cyclisme.com/ouverture-cols.htm";

/* our id -> where to read it */
export const MAP = {
  ap: { umbrail: "umbrailpass", spluga: "spluegenpass", furka: "furkapass", grimsel: "grimselpass", susten: "sustenpass", nufenen: "nufenenpass",
    gotthard: "gotthardpass", klausen: "klausenpass", oberalp: "oberalppass", albula: "albulapass", sanbernardino: "san-bernardinopass",
    gsbernardo: "grosser-sankt-bernhard", forcola: "forcola-di-livigno" },
  mmv: { stelvio: "dello Stelvio", gavia: "Gavia", mortirolo: "Mortirolo", "san-marco": "San Marco", vivione: "Vivione", crocedomini: "Crocedomini" },
  cols: { bonette: "Cime de la Bonette", agnello: "Col Agnel", allos: "Col d'Allos", granon: "Col de Granon", echelle: "Col de l'Echelle",
    iseran: "Col de l'Iseran", izoard: "Col de l'Izoard", cayolle: "Col de la Cayolle", colombiere: "Col de la Colombière",
    croixdefer: "Col de la Croix de Fer", madeleine: "Col de la Madeleine", galibier: "Col du Galibier", glandon: "Col du Glandon",
    moncenisio: "Col du Mont Cenis", psbernardo: "Col du Petit Saint-Bernard", roselend: "Cormet de Roselend" }
};

const text = (s) => String(s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&#0?39;|&apos;/g, "'").replace(/&eacute;/g, "é").replace(/&egrave;/g, "è").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const norm = (s) => text(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’`]/g, "'").toLowerCase();

/* alpen-paesse.ch pass page -> { closed, note } | null */
export function parseAlpenPaesse(html) {
  const a = String(html).indexOf('class="status-update-status"');
  if (a < 0) return null;
  const blk = html.slice(a, a + 4000);
  const icons = new Set([...blk.matchAll(/icon-status-([a-z-]+)/g)].map((m) => m[1]));
  const h2 = text((/<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(blk) || [])[1]);
  if (icons.has("closed")) return { closed: true, note: h2 };
  if (icons.has("open")) return { closed: false, note: h2 };
  return null;
}

/* meteomontagnavaltellina table -> [{ name, light: "red" | "orange" | "green", note }] */
export function parseMmv(html) {
  const out = [];
  for (const row of String(html).split(/<tr[\s>]/i).slice(1)) {
    const img = (/src="[^"]*SEMAFORO_(ROSSO|ARANCIONE)[^"]*"/i.exec(row) || [])[1] || (/src="[^"]*semaforo_verde[^"]*"/i.test(row) ? "VERDE" : "");
    if (!img) continue;
    const t = text(row);
    const m = /^(?:passo|passi|tunnel)\s+(.+?)(?:\s*\(\s*s[sp][^)]*\))?(?:\s+(CHIUSURA INVERNALE.*|Chiusura invernale.*|possibile.*))?$/i.exec(t);
    if (!m) continue;
    out.push({ name: m[1].trim(), light: { ROSSO: "red", ARANCIONE: "orange", VERDE: "green" }[img.toUpperCase()], note: (m[2] || "").trim() });
  }
  return out;
}

/* cols-cyclisme table -> [{ name, closed }] */
export function parseCols(html) {
  const out = [];
  for (const m of String(html).matchAll(/<tr[^>]*>\s*<td[^>]*>([^<]+)<\/td>[\s\S]*?alt="Col (ouvert|ferm)/gi)) out.push({ name: text(m[1]), closed: !/ouvert/i.test(m[2]) });
  return out;
}

/* what every mapped pass says now: { id: { closed, note, source } }, plus the problems */
export function collect({ ap = {}, mmv = "", cols = "" }) {
  const res = {}, errors = [];
  for (const [id, slug] of Object.entries(MAP.ap)) {
    const r = ap[slug] ? parseAlpenPaesse(ap[slug]) : null;
    if (r) res[id] = { ...r, source: AP + slug }; else errors.push(`alpen-paesse ${slug}: no status`);
  }
  const rows = parseMmv(mmv);
  if (!rows.length) errors.push("meteomontagnavaltellina: no rows");
  for (const [id, name] of Object.entries(MAP.mmv)) {
    const r = rows.find((x) => norm(x.name) === norm(name));
    // orange = "nevicate / strada innevata": open but not to be trusted as "open" (the Stelvio on 11/11/2026):
    // no update, the usual window keeps deciding
    if (r) { if (r.light !== "orange") res[id] = { closed: r.light === "red", note: r.note, source: MMV }; } else if (rows.length) errors.push(`meteomontagnavaltellina: ${name} missing`);
  }
  const cs = parseCols(cols);
  if (!cs.length) errors.push("cols-cyclisme: no rows");
  for (const [id, name] of Object.entries(MAP.cols)) {
    const r = cs.find((x) => norm(x.name) === norm(name));
    if (r) res[id] = { closed: r.closed, note: "", source: COLS }; else if (cs.length) errors.push(`cols-cyclisme: ${name} missing`);
  }
  return { res, errors };
}

/* new "now" from the previous one and today's reading (pure) */
export function nextNow(prev, r, today) {
  const p = prev && typeof prev === "object" ? prev : null;
  const n = { closed: r.closed };
  if (r.closed) {
    if (p && p.closed === true && p.since) n.since = p.since;
    else if (p && p.closed === false) n.since = today;           // we saw it close
  } else if (p && p.closed === false && p.since) n.since = p.since;
  else if (p && p.closed === true) n.since = today;              // we saw it reopen
  n.checked = today; n.source = r.source;
  return n;
}

export function applyStatus(doc, res, today) {
  let changed = 0;
  for (const p of doc.passes || []) {
    const r = res[p.id]; if (!r) continue;
    const n = nextNow(p.now, r, today);
    if (JSON.stringify(n) !== JSON.stringify(p.now)) { p.now = n; changed++; }
    if (!(p.sources || []).includes(r.source)) (p.sources = p.sources || []).push(r.source);
  }
  if (changed) doc.updated = today;
  return changed;
}

async function get(url) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(url + " -> " + r.status);
  return r.text();
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("winter_status.mjs")) {
  const [cmd, file] = process.argv.slice(2);
  if (cmd === "--fetch") {
    const ap = {};
    for (const slug of Object.values(MAP.ap)) { try { ap[slug] = await get(AP + slug); } catch (e) { console.error(String(e)); } await new Promise((r) => setTimeout(r, 700)); }
    let mmv = "", cols = "";
    try { mmv = await get(MMV); } catch (e) { console.error(String(e)); }
    try { cols = await get(COLS); } catch (e) { console.error(String(e)); }
    const { res, errors } = collect({ ap, mmv, cols });
    writeFileSync(file, JSON.stringify({ res, errors }, null, 1));
    for (const e of errors) console.error("ERROR " + e);
    console.log(Object.keys(res).length + " passes read, " + errors.length + " problems");
    process.exit(errors.length ? 2 : 0);
  } else if (cmd === "--apply" || cmd === "--show") {
    const { res } = JSON.parse(readFileSync(file, "utf8"));
    const p = dataPath("winter_closures.json"), doc = JSON.parse(readFileSync(p, "utf8"));
    if (cmd === "--show") {
      for (const x of doc.passes) if (res[x.id]) console.log(x.id.padEnd(14), res[x.id].closed ? "CHIUSO " : "aperto ", (res[x.id].note || "").slice(0, 60).padEnd(60), res[x.id].source.replace(/^https:\/\/(www\.)?/, "").slice(0, 45));
    } else {
      const today = new Date().toISOString().slice(0, 10), n = applyStatus(doc, res, today);
      if (n) writeFileSync(p, JSON.stringify(doc, null, 1) + "\n");
      console.log(n + " passes changed");
    }
  } else { console.error("usage: --fetch out.json | --apply in.json | --show in.json"); process.exit(1); }
}
