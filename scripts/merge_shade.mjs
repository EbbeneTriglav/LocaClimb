#!/usr/bin/env node
/*
 * merge_shade.mjs <new shade.json> [--into data/shade.json]
 * Merges the shade keys computed by this run into the current data/shade.json (see osm-expand.yml:
 * the commit loop resets to origin/main, so the run's file is saved aside and merged back here).
 */
import { readFile, writeFile } from "node:fs/promises";
import { dataPath } from "./lib/paths.mjs";
import { mergeShade } from "./lib/shade.mjs";

const src = process.argv[2];
const i = process.argv.indexOf("--into"), into = dataPath(i >= 0 ? process.argv[i + 1] : "shade.json");
if (!src) { console.error("usage: merge_shade.mjs <new shade.json> [--into file]"); process.exit(2); }
let add, base = null;
try { add = JSON.parse(await readFile(src, "utf8")); } catch (e) { console.log("nothing to merge (" + e.message + ")"); process.exit(0); }
try { base = JSON.parse(await readFile(into, "utf8")); } catch { /* first time */ }
const { store, changed } = mergeShade(base, add);
await writeFile(into, JSON.stringify(store) + "\n", "utf8");
console.log("shade: " + changed + " keys new or changed, " + Object.keys(store.m).length + " in all");
