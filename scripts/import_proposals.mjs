#!/usr/bin/env node
/*
 * import_proposals.mjs - travasa le proposte APPROVATE da Firestore nel repo.
 * ---------------------------------------------------------------------------
 * Le proposte approvate sono gia' visibili nell'app (js/contribute.js le legge
 * da Firestore). Questo script le rende DATO DEFINITIVO: le scrive in
 * data/osm_passes_user.json e registra "user" in data/osm_regions.json, cosi'
 * diventano una regione come le altre e passano da sole per build_shade,
 * build_sun_horizon e l'indice - senza una riga di plumbing in piu'.
 *
 * NIENTE CREDENZIALI: le approvate sono pubblicamente leggibili per regola, quindi
 * basta l'API key gia' presente nel client. Lo script la pesca da solo dal file
 * che contiene FIREBASE_CONFIG: nessun segreto nuovo, nessun service account.
 *
 *   node scripts/import_proposals.mjs            # scrive
 *   node scripts/import_proposals.mjs --dry      # mostra e basta
 *
 * Idempotente: rigenera il file da zero a ogni giro, quindi rimuovere una
 * proposta da Firestore (o cambiarne lo stato) la toglie anche dal repo. ASCII.
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import { dataPath } from "./lib/paths.mjs";

const DRY = process.argv.indexOf("--dry") >= 0;
const OUT = dataPath("osm_passes_user.json");
const MANIFEST = dataPath("osm_regions.json");

/* ------------------------------------------------ configurazione Firebase */
async function firebaseConfig() {
  const dirs = ["js", "."];
  for (const d of dirs) {
    let files = [];
    try { files = await readdir(d); } catch (e) { continue; }
    for (const f of files) {
      if (!f.endsWith(".js")) continue;
      let src = "";
      try { src = await readFile(d + "/" + f, "utf8"); } catch (e) { continue; }
      if (!/FIREBASE_CONFIG/.test(src)) continue;
      const pid = /projectId\s*:\s*["']([^"']+)["']/.exec(src);
      const key = /apiKey\s*:\s*["']([^"']+)["']/.exec(src);
      if (pid && key) return { projectId: pid[1], apiKey: key[1], from: d + "/" + f };
    }
  }
  return null;
}

/* ------------------------------------------------------- lettura Firestore */
/* REST runQuery: nessun SDK, nessun token. Funziona perche' le regole rendono
   leggibili a chiunque i documenti con status == "approved". */
async function fetchApproved(cfg) {
  const url = "https://firestore.googleapis.com/v1/projects/" + cfg.projectId
    + "/databases/(default)/documents:runQuery?key=" + cfg.apiKey;
  const body = {
    structuredQuery: {
      from: [{ collectionId: "proposals" }],
      where: { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "approved" } } },
      limit: 1000
    }
  };
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("Firestore HTTP " + r.status + ": " + (await r.text()).slice(0, 300));
  const rows = await r.json();
  const out = [];
  for (const row of rows) {
    if (!row.document) continue;
    const id = row.document.name.split("/").pop();
    out.push(Object.assign({ _id: id }, unwrap(row.document.fields || {})));
  }
  return out;
}
/* i valori Firestore REST arrivano incapsulati per tipo: li sbuccio */
function unwrap(f) {
  const o = {};
  for (const k of Object.keys(f)) {
    const v = f[k];
    if ("stringValue" in v) o[k] = v.stringValue;
    else if ("integerValue" in v) o[k] = +v.integerValue;
    else if ("doubleValue" in v) o[k] = v.doubleValue;
    else if ("booleanValue" in v) o[k] = v.booleanValue;
    else if ("nullValue" in v) o[k] = null;
    else if ("arrayValue" in v) o[k] = (v.arrayValue.values || []).map((x) => unwrap({ x }).x);
    else if ("mapValue" in v) o[k] = unwrap(v.mapValue.fields || {});
  }
  return o;
}

/* --------------------------------------------- forma di un passo esistente */
/* Invece di indovinare i campi, prendo un passo vero da una regione qualsiasi e
   lo uso come modello: se manca qualcosa lo segnalo invece di produrre dati
   silenziosamente incompleti. */
async function template() {
  let files = [];
  try {
    const man = JSON.parse(await readFile(MANIFEST, "utf8"));
    const list = Array.isArray(man) ? man : (man.regions || man.files || []);
    files = list.map((r) => (typeof r === "string" ? r : (r.file || r.name || r.id)))
      .filter(Boolean).map((n) => (String(n).endsWith(".json") ? n : "osm_passes_" + n + ".json"));
  } catch (e) { /* nessun manifest: pazienza */ }
  for (const fn of files) {
    if (fn.indexOf("user") >= 0) continue;
    try {
      const j = JSON.parse(await readFile(dataPath(fn), "utf8"));
      const arr = Array.isArray(j) ? j : (j.passes || []);
      for (const p of arr) if (p && p.versanti && p.versanti.length) return { pass: p, wrapped: !Array.isArray(j), file: fn };
    } catch (e) { /* prova il prossimo */ }
  }
  return null;
}

function toPass(r) {
  const track = [];
  const flat = r.flat || [];
  for (let i = 0; i + 2 < flat.length; i += 3) track.push([flat[i], flat[i + 1], flat[i + 2]]);
  if (track.length < 4) return null;
  return {
    id: "usr-" + r._id,
    name: r.name,
    lat: r.lat, lon: r.lon,
    elevation: r.elevation != null ? r.elevation : (r.endElevation || null),
    source: "user",
    author: r.author || null,
    submittedAt: r.createdAt || null,
    versanti: [{
      side: r.side || "Versante unico",
      startLat: r.startLat, startLon: r.startLon,
      startElevation: r.startElevation, endElevation: r.endElevation,
      distance_km: r.km, avgGradient: r.avgGradient,
      maxGradient: r.maxGradient != null ? r.maxGradient : null,
      track: track,
      elevSource: "user"
    }]
  };
}

async function main() {
  const cfg = await firebaseConfig();
  if (!cfg) { console.error("FATAL: non trovo FIREBASE_CONFIG (projectId + apiKey) nei file js/."); process.exit(2); }
  console.log("progetto " + cfg.projectId + " (letto da " + cfg.from + ")");

  const raw = await fetchApproved(cfg);
  console.log("proposte approvate su Firestore: " + raw.length);
  const passes = raw.map(toPass).filter(Boolean);
  const scarti = raw.length - passes.length;
  if (scarti) console.warn("  ! " + scarti + " senza tracciato utilizzabile, saltate");
  if (!passes.length) { console.log("niente da importare."); return; }

  const tpl = await template();
  if (tpl) {
    const miss = Object.keys(tpl.pass).filter((k) => !(k in passes[0]));
    const missV = Object.keys(tpl.pass.versanti[0]).filter((k) => !(k in passes[0].versanti[0]));
    if (miss.length) console.warn("  campi del passo che la pipeline riempira' dopo: " + miss.join(", "));
    if (missV.length) console.warn("  campi del versante idem: " + missV.join(", "));
  } else {
    console.warn("  ! nessun passo di riferimento trovato: non posso confrontare i campi");
  }

  passes.forEach((p) => console.log("  - " + p.name + " (" + p.versanti[0].side + ", "
    + p.versanti[0].distance_km + " km) di " + (p.author || "?")));

  if (DRY) { console.log("\n(--dry) Niente scritto."); return; }

  await writeFile(OUT, JSON.stringify(tpl && tpl.wrapped ? { passes } : passes) + "\n", "utf8");
  console.log("scritto " + OUT);

  /* registra la regione "user" nel manifest, se non c'e' gia' */
  try {
    const man = JSON.parse(await readFile(MANIFEST, "utf8"));
    const list = Array.isArray(man) ? man : (man.regions || man.files || null);
    if (list) {
      const has = list.some((r) => String(typeof r === "string" ? r : (r.file || r.name || r.id)).indexOf("user") >= 0);
      if (!has) {
        const sample = list[0];
        list.push(typeof sample === "string"
          ? (String(sample).endsWith(".json") ? "osm_passes_user.json" : "user")
          : { file: "osm_passes_user.json", name: "user", id: "user" });
        await writeFile(MANIFEST, JSON.stringify(man) + "\n", "utf8");
        console.log("manifest aggiornato: regione 'user' registrata");
      } else {
        console.log("manifest gia' a posto");
      }
    }
  } catch (e) { console.warn("  ! manifest non aggiornato: " + e.message); }

  console.log("\nOra: node scripts/build_osm_index.mjs   (per rigenerare l'indice)");
}
main().catch((e) => { console.error("FATAL: " + e.stack); process.exit(1); });
