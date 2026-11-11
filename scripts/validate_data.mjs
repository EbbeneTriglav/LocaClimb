#!/usr/bin/env node
/*
 * validate_data.mjs - schema/sanity check for the JSON data layer. The frontend's
 * fetch(...).catch(function(){}) chains silently no-op on a malformed file, so a
 * typo'd pass id or a corrupt override can sit unnoticed for months. This script
 * makes that fail loudly instead - run it after editing any data file, or wire it
 * into a pre-commit hook / CI step.
 *
 * Exports pure validation functions (no fs access) so they're unit-testable in
 * isolation - see test/validate-data.test.mjs. Only main() touches the filesystem.
 *
 * Usage: node scripts/validate_data.mjs
 * Exit code 0 = no errors (warnings are still printed). Exit code 1 = errors found.
 */
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { dataPath } from "./lib/paths.mjs";
const STATUS_VALUES = new Set(["open", "seasonal", "closed"]);
const CAT_VALUES = new Set(["HC", "1", "2", "3", "4"]);

function isFiniteNum(x) { return typeof x === "number" && Number.isFinite(x); }
function isLat(x) { return isFiniteNum(x) && x >= -90 && x <= 90; }
function isLon(x) { return isFiniteNum(x) && x >= -180 && x <= 180; }
function isNonEmptyString(x) { return typeof x === "string" && x.trim().length > 0; }

// Returns an array of error strings (empty = valid). `label` prefixes each message.
export function validateVersante(v, label) {
  const errs = [];
  if (!v || typeof v !== "object") return [`${label}: not an object`];
  if (!isNonEmptyString(v.side)) errs.push(`${label}: missing/empty "side"`);
  if (!isLat(v.startLat)) errs.push(`${label}: startLat is not a valid latitude (${v.startLat})`);
  if (!isLon(v.startLon)) errs.push(`${label}: startLon is not a valid longitude (${v.startLon})`);
  if (!isFiniteNum(v.startElevation)) errs.push(`${label}: startElevation is not a number (${v.startElevation})`);
  if (!isFiniteNum(v.endElevation)) errs.push(`${label}: endElevation is not a number (${v.endElevation})`);
  if (isFiniteNum(v.startElevation) && isFiniteNum(v.endElevation) && v.endElevation <= v.startElevation) {
    errs.push(`${label}: endElevation (${v.endElevation}) must be greater than startElevation (${v.startElevation})`);
  }
  if (!isFiniteNum(v.distance_km) || v.distance_km <= 0) errs.push(`${label}: distance_km must be a positive number (${v.distance_km})`);
  if (!isFiniteNum(v.avgGradient)) errs.push(`${label}: avgGradient is not a number (${v.avgGradient})`);
  if (!isFiniteNum(v.maxGradient)) errs.push(`${label}: maxGradient is not a number (${v.maxGradient})`);
  if (v.elevationProfile != null) {
    if (!Array.isArray(v.elevationProfile) || v.elevationProfile.length < 2) {
      errs.push(`${label}: elevationProfile must be an array of at least 2 points`);
    } else if (!v.elevationProfile.every(isFiniteNum)) {
      errs.push(`${label}: elevationProfile must contain only numbers`);
    } else {
      const first = v.elevationProfile[0], last = v.elevationProfile[v.elevationProfile.length - 1];
      const TOL = 60; // meters - real DEM samples don't land exactly on start/end
      if (isFiniteNum(v.startElevation) && Math.abs(first - v.startElevation) > TOL) {
        errs.push(`${label}: elevationProfile[0] (${first}) is far from startElevation (${v.startElevation})`);
      }
      if (isFiniteNum(v.endElevation) && Math.abs(last - v.endElevation) > TOL) {
        errs.push(`${label}: elevationProfile last point (${last}) is far from endElevation (${v.endElevation})`);
      }
    }
  }
  return errs;
}

export function validatePass(p, label) {
  const errs = [];
  if (!p || typeof p !== "object") return [`${label}: not an object`];
  if (!isNonEmptyString(p.id)) errs.push(`${label}: missing/empty "id"`);
  if (!isNonEmptyString(p.name)) errs.push(`${label}: missing/empty "name"`);
  if (!isLat(p.lat)) errs.push(`${label}: lat is not a valid latitude (${p.lat})`);
  if (!isLon(p.lon)) errs.push(`${label}: lon is not a valid longitude (${p.lon})`);
  if (!isFiniteNum(p.elevation) || p.elevation <= 0) errs.push(`${label}: elevation must be a positive number (${p.elevation})`);
  if (p.status != null && !STATUS_VALUES.has(p.status)) {
    errs.push(`${label}: status "${p.status}" is not one of ${[...STATUS_VALUES].join("/")} (sc()/sl() will silently treat it as "closed")`);
  }
  if (p.difficulty != null && (!isFiniteNum(p.difficulty) || p.difficulty < 1 || p.difficulty > 10)) {
    errs.push(`${label}: difficulty must be a number 1-10 (${p.difficulty})`);
  }
  if (p.cat != null && !CAT_VALUES.has(p.cat)) errs.push(`${label}: cat "${p.cat}" is not one of ${[...CAT_VALUES].join("/")}`);
  if (p.versanti != null) {
    if (!Array.isArray(p.versanti)) errs.push(`${label}: versanti must be an array`);
    else p.versanti.forEach((v, i) => errs.push(...validateVersante(v, `${label}.versanti[${i}]`)));
  }
  return errs;
}

// curated_overrides.json: { [passId]: {lat?,lon?,versanti?,difficulty?,cat?,updatedAt?,algo?} }
export function validateCuratedOverrides(obj, knownIds) {
  const errs = [];
  if (!obj || typeof obj !== "object") return ["curated_overrides.json: root must be an object"];
  for (const [id, ov] of Object.entries(obj)) {
    const label = `curated_overrides.json[${id}]`;
    if (knownIds && !knownIds.has(id)) errs.push(`${label}: id is not in passes_data.js - this override silently no-ops`);
    if (!ov || typeof ov !== "object") { errs.push(`${label}: not an object`); continue; }
    if (ov.lat != null && !isLat(ov.lat)) errs.push(`${label}: lat is not a valid latitude (${ov.lat})`);
    if (ov.lon != null && !isLon(ov.lon)) errs.push(`${label}: lon is not a valid longitude (${ov.lon})`);
    if (ov.difficulty != null && (!isFiniteNum(ov.difficulty) || ov.difficulty < 1 || ov.difficulty > 10)) errs.push(`${label}: difficulty must be 1-10 (${ov.difficulty})`);
    if (ov.cat != null && !CAT_VALUES.has(ov.cat)) errs.push(`${label}: cat "${ov.cat}" is not one of ${[...CAT_VALUES].join("/")}`);
    if (ov.versanti != null) {
      if (!Array.isArray(ov.versanti)) errs.push(`${label}: versanti must be an array`);
      else ov.versanti.forEach((v, i) => errs.push(...validateVersante(v, `${label}.versanti[${i}]`)));
    }
  }
  return errs;
}

// manual_overrides.json / manual_enriched.json: { [id]: {new?,name?,lat?,lon?,elevation?,region?,versanti,...} }
export function validateManualOverrides(obj, filename) {
  const errs = [];
  if (!obj || typeof obj !== "object") return [`${filename}: root must be an object`];
  for (const [id, entry] of Object.entries(obj)) {
    const label = `${filename}[${id}]`;
    if (!entry || typeof entry !== "object") { errs.push(`${label}: not an object`); continue; }
    if (entry.new === true) {
      if (!isNonEmptyString(entry.name)) errs.push(`${label}: new pass missing "name"`);
      if (!isLat(entry.lat)) errs.push(`${label}: new pass lat is not valid (${entry.lat})`);
      if (!isLon(entry.lon)) errs.push(`${label}: new pass lon is not valid (${entry.lon})`);
      if (!isFiniteNum(entry.elevation) || entry.elevation <= 0) errs.push(`${label}: new pass elevation must be a positive number (${entry.elevation})`);
    }
    if (!Array.isArray(entry.versanti) || entry.versanti.length === 0) {
      errs.push(`${label}: missing non-empty "versanti" array`);
    } else {
      entry.versanti.forEach((v, i) => errs.push(...validateVersante(v, `${label}.versanti[${i}]`)));
    }
    if (entry.updatedAt != null && !/^\d{4}-\d{2}-\d{2}/.test(entry.updatedAt)) {
      errs.push(`${label}: updatedAt "${entry.updatedAt}" is not a yyyy-mm-dd date`);
    }
  }
  return errs;
}

export function validateClimbsExtra(arr) {
  const errs = [];
  if (!Array.isArray(arr)) return ["climbs_extra.json: root must be an array"];
  arr.forEach((c, i) => {
    const label = `climbs_extra.json[${i}]`;
    if (!c || typeof c !== "object") { errs.push(`${label}: not an object`); return; }
    if (!isNonEmptyString(c.id)) errs.push(`${label}: missing/empty "id"`);
    if (!isNonEmptyString(c.name)) errs.push(`${label}: missing/empty "name"`);
    if (!isLat(c.lat)) errs.push(`${label}: lat is not a valid latitude (${c.lat})`);
    if (!isLon(c.lon)) errs.push(`${label}: lon is not a valid longitude (${c.lon})`);
    if (c.short !== undefined && typeof c.short !== "boolean") errs.push(`${label}: "short" must be true or false`);
  });
  return errs;
}

/* data/road_events.json (v2/lib/events.mjs): every event needs a known type, a yyyy-mm-dd date (end not before it),
   at least one climb id and a source; climb ids must exist when the caller passes the known ids */
export function validateRoadEvents(obj, knownIds) {
  const errs = [], TYPES = ["chiusura", "bikeday", "granfondo", "gara"], ISO = /^\d{4}-\d{2}-\d{2}$/, seen = new Set();
  if (!obj || typeof obj !== "object" || !Array.isArray(obj.events)) return ["road_events.json: root must be an object with an \"events\" array"];
  obj.events.forEach((e, i) => {
    const label = `road_events.json[${i}]`;
    if (!e || typeof e !== "object") { errs.push(`${label}: not an object`); return; }
    if (!isNonEmptyString(e.id)) errs.push(`${label}: missing/empty "id"`);
    else if (seen.has(e.id)) errs.push(`${label}: duplicate id "${e.id}"`); else seen.add(e.id);
    if (!TYPES.includes(e.type)) errs.push(`${label}: type must be one of ${TYPES.join(", ")}`);
    if (!isNonEmptyString(e.name)) errs.push(`${label}: missing/empty "name"`);
    if (!ISO.test(e.date || "")) errs.push(`${label}: date "${e.date}" is not yyyy-mm-dd`);
    if (e.end != null && (!ISO.test(e.end) || e.end < e.date)) errs.push(`${label}: end "${e.end}" is not a yyyy-mm-dd date on or after date`);
    if (!Array.isArray(e.climbs) || !e.climbs.length) errs.push(`${label}: "climbs" must list at least one climb id`);
    else if (knownIds) for (const c of e.climbs) if (!knownIds.has(String(c))) errs.push(`${label}: unknown climb id "${c}"`);
    if (!isNonEmptyString(e.url) || !/^https:\/\//.test(e.url)) errs.push(`${label}: "url" must be an https link to the source`);
    if (!isNonEmptyString(e.source)) errs.push(`${label}: missing/empty "source"`);
  });
  return errs;
}

/* data/winter_closures.json (v2/lib/closures.mjs): every pass needs a name, the top as lat/lon (it must match a
   climb we publish when the caller passes them), usual windows as two MM-DD, at least one https source; "now"
   (the checked state) needs closed true/false, a yyyy-mm-dd check day and its source */
export function validateWinterClosures(obj, climbs) {
  const errs = [], MD = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, ISO = /^\d{4}-\d{2}-\d{2}$/, seen = new Set();
  if (!obj || typeof obj !== "object" || !Array.isArray(obj.passes)) return ["winter_closures.json: root must be an object with a \"passes\" array"];
  obj.passes.forEach((p, i) => {
    const label = `winter_closures.json[${i}]` + (p && p.id ? ` (${p.id})` : "");
    if (!p || typeof p !== "object") { errs.push(`${label}: not an object`); return; }
    if (!isNonEmptyString(p.id)) errs.push(`${label}: missing/empty "id"`);
    else if (seen.has(p.id)) errs.push(`${label}: duplicate id`); else seen.add(p.id);
    if (!isNonEmptyString(p.name)) errs.push(`${label}: missing/empty "name"`);
    if (!isLat(p.lat) || !isLon(p.lon)) errs.push(`${label}: lat/lon not valid`);
    for (const k of ["closes", "opens"]) {
      const w = p[k];
      if (w !== null && w !== undefined && !(Array.isArray(w) && w.length === 2 && MD.test(w[0]) && MD.test(w[1]))) errs.push(`${label}: "${k}" must be null or two MM-DD dates`);
    }
    if (!Array.isArray(p.sources) || !p.sources.length || p.sources.some((u) => !/^https:\/\//.test(u))) errs.push(`${label}: "sources" must list https links`);
    if (p.now !== undefined) {
      const n = p.now;
      if (!n || typeof n.closed !== "boolean") errs.push(`${label}: now.closed must be true or false`);
      else {
        if (!ISO.test(n.checked || "")) errs.push(`${label}: now.checked must be yyyy-mm-dd`);
        if (!/^https:\/\//.test(n.source || "")) errs.push(`${label}: now.source must be an https link`);
        for (const k of ["since", "reopens"]) if (n[k] != null && !ISO.test(n[k])) errs.push(`${label}: now.${k} must be yyyy-mm-dd`);
        if (n.since && n.reopens && n.reopens <= n.since) errs.push(`${label}: now.reopens must come after now.since`);
      }
    }
    if (climbs && isLat(p.lat) && isLon(p.lon)) {
      const r = Math.PI / 180, near = climbs.some((c) => c && typeof c.lat === "number" && 6371 * Math.hypot((c.lat - p.lat) * r, (c.lon - p.lon) * r * Math.cos(p.lat * r)) <= 1.0);
      if (!near) errs.push(`${label}: no published climb within 1 km of ${p.lat},${p.lon}`);
    }
  });
  return errs;
}

export function validateOsmRegions(arr) {
  if (!Array.isArray(arr)) return ["osm_regions.json: root must be an array"];
  const errs = [];
  arr.forEach((f, i) => {
    if (!isNonEmptyString(f) || !f.endsWith(".json")) errs.push(`osm_regions.json[${i}]: "${f}" is not a .json filename`);
  });
  return errs;
}

// pass_news.json: { [passIdOrName]: [{date,title,url?,source?}, ...] } (keys starting with "_" are comments/metadata, skipped)
export function validatePassNews(obj, filename) {
  const errs = [];
  if (!obj || typeof obj !== "object") return [`${filename}: root must be an object`];
  for (const [key, items] of Object.entries(obj)) {
    if (key.startsWith("_")) continue;
    const label = `${filename}[${key}]`;
    if (!Array.isArray(items)) { errs.push(`${label}: value must be an array`); continue; }
    items.forEach((it, i) => {
      const itLabel = `${label}[${i}]`;
      if (!it || typeof it !== "object") { errs.push(`${itLabel}: not an object`); return; }
      if (!isNonEmptyString(it.title)) errs.push(`${itLabel}: missing/empty "title"`);
      if (it.date != null && !/^\d{4}-\d{2}-\d{2}/.test(it.date)) errs.push(`${itLabel}: date "${it.date}" is not a yyyy-mm-dd date`);
      if (it.url != null && !/^https?:\/\//.test(it.url)) errs.push(`${itLabel}: url "${it.url}" doesn't look like a URL`);
    });
  }
  return errs;
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(dataPath(file), "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return { __missing: true };
    throw new Error(`${file}: invalid JSON (${e.message})`);
  }
}

async function loadPassesData() {
  const code = await readFile(dataPath("passes_data.js"), "utf8");
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx.PASSES_DATA || [];
}

async function main() {
  const errors = [];
  const warnings = [];

  const passesData = await loadPassesData();
  passesData.forEach((p, i) => errors.push(...validatePass(p, `passes_data.js[${i}] (${p.id || "?"})`)));
  const knownIds = new Set(passesData.map((p) => p.id));

  const curated = await readJson("curated_overrides.json");
  if (!curated.__missing) errors.push(...validateCuratedOverrides(curated, knownIds));

  const manualEnriched = await readJson("manual_enriched.json");
  const manualOverrides = await readJson("manual_overrides.json");
  if (!manualEnriched.__missing) errors.push(...validateManualOverrides(manualEnriched, "manual_enriched.json"));
  if (!manualOverrides.__missing) errors.push(...validateManualOverrides(manualOverrides, "manual_overrides.json"));

  const roadEvents = await readJson("road_events.json");
  if (!roadEvents.__missing) {
    const osmIndex = await readJson("osm_index.json");
    const ids = new Set([...knownIds, ...(Array.isArray(osmIndex) ? osmIndex.map((c) => String(c.id)) : [])]);
    errors.push(...validateRoadEvents(roadEvents, ids));
  }

  const winter = await readJson("winter_closures.json");
  if (!winter.__missing) {
    const osmIndex = await readJson("osm_index.json");
    errors.push(...validateWinterClosures(winter, Array.isArray(osmIndex) ? osmIndex : null));
  }

  const climbsExtra = await readJson("climbs_extra.json");
  if (!climbsExtra.__missing) errors.push(...validateClimbsExtra(climbsExtra));

  const osmRegions = await readJson("osm_regions.json");
  if (!osmRegions.__missing) {
    errors.push(...validateOsmRegions(osmRegions));
    for (const f of osmRegions) {
      const data = await readJson(f);
      if (data.__missing) warnings.push(`osm_regions.json references "${f}" but it doesn't exist yet (frontend skips it silently - fine if not built yet)`);
    }
  }

  const passNews = await readJson("pass_news.json");
  if (!passNews.__missing) errors.push(...validatePassNews(passNews, "pass_news.json"));

  for (const w of warnings) console.warn("WARN  " + w);
  for (const e of errors) console.error("ERROR " + e);
  console.log(`\n${errors.length} error(s), ${warnings.length} warning(s).`);
  if (errors.length > 0) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
