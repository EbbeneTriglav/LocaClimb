#!/usr/bin/env node
/*
 * diag_corridor.mjs - perche' il BFS non arriva la'?
 * ---------------------------------------------------------------------------
 * Interroga Overpass sul corridoio fra due punti e stampa OGNI strada, dicendo se il
 * builder la tiene o la butta, e per quale regola (HW_KEEP oppure rideable()). Le due
 * funzioni qui sotto sono copiate identiche dal builder: se una strada risulta scartata,
 * quello e' il motivo per cui il grafo si spezza.
 *
 *   node scripts/diag_corridor.mjs 46.4875 11.8122 46.4766 11.7706     # Pordoi -> Canazei
 *   node scripts/diag_corridor.mjs 46.5283 10.4527 46.4620 10.3699     # Stelvio -> Bormio
 */
const HW_KEEP = ["primary","primary_link","secondary","secondary_link","tertiary","tertiary_link","unclassified","unclassified_link"];
const BAD_SURF = { sand:1, mud:1, rock:1, pebblestone:1, grass:1, woodchips:1, salt:1 };
function rideable(t) {
  if (!t || !t.highway) return "no highway";
  if (t.motorroad === "yes") return "motorroad=yes";
  if (t.bicycle === "no" || t.bicycle === "dismount") return "bicycle=" + t.bicycle;
  if (t.access === "private" || t.access === "no") return "access=" + t.access;
  if (t["mtb:scale"]) return "mtb:scale";
  if (t.surface && BAD_SURF[t.surface]) return "surface=" + t.surface;
  if (t.tracktype === "grade4" || t.tracktype === "grade5") return "tracktype=" + t.tracktype;
  if (t.smoothness && { very_bad:1, horrible:1, very_horrible:1, impassable:1 }[t.smoothness]) return "smoothness=" + t.smoothness;
  return null; // ok
}

const a = process.argv.slice(2).map(Number);
if (a.length < 4 || a.some(isNaN)) { console.error("uso: node scripts/diag_corridor.mjs lat1 lon1 lat2 lon2"); process.exit(1); }
const [la1, lo1, la2, lo2] = a;
const pad = 0.02;
const bbox = [Math.min(la1,la2)-pad, Math.min(lo1,lo2)-pad, Math.max(la1,la2)+pad, Math.max(lo1,lo2)+pad].map(x=>x.toFixed(4)).join(",");

const q = `[out:json][timeout:60];way["highway"](${bbox});out tags;`;
const eps = ["https://overpass-api.de/api/interpreter","https://overpass.private.coffee/api/interpreter","https://maps.mail.ru/osm/tools/overpass/api/interpreter"];

let data = null;
for (const ep of eps) {
  try {
    const r = await fetch(ep + "?data=" + encodeURIComponent(q));
    if (!r.ok) continue;
    data = await r.json(); break;
  } catch { /* prossimo endpoint */ }
}
if (!data) { console.error("Overpass non raggiungibile"); process.exit(1); }

const rows = new Map(); // firma -> conteggio
for (const el of (data.elements || [])) {
  const t = el.tags || {};
  const inKeep = HW_KEEP.includes(t.highway);
  const why = rideable(t);
  let verdict;
  if (!inKeep) verdict = "SCARTATA (highway=" + t.highway + " non in HW_KEEP)";
  else if (why) verdict = "SCARTATA (" + why + ")";
  else verdict = "tenuta";
  const key = verdict + "  |  " + (t.ref || t.name || "-");
  rows.set(key, (rows.get(key) || 0) + 1);
}
const sorted = [...rows].sort((x, y) => y[1] - x[1]);
console.log("bbox " + bbox + " - " + (data.elements || []).length + " strade\n");
for (const [k, n] of sorted) if (k.startsWith("SCARTATA")) console.log(String(n).padStart(4) + "x  " + k);
console.log();
for (const [k, n] of sorted) if (!k.startsWith("SCARTATA")) console.log(String(n).padStart(4) + "x  " + k);
