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
