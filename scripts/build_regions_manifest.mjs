#!/usr/bin/env node
/*
 * build_regions_manifest.mjs - writes data/osm_regions.json FROM DISK.
 *
 * The frontend merges every file listed there. The list is every data/osm_passes*.json:
 * osm_passes.json first, the rest sorted. Deterministic: two runs that see the same files write
 * identical bytes, so concurrent data workflows never conflict on it. Shared by osm-expand.yml and
 * osm-discover.yml (it used to be an inline `node -e` in osm-expand.yml - same output).
 *
 *   node scripts/build_regions_manifest.mjs
 */
import { readdir, writeFile } from "node:fs/promises";
import { DATA_DIR, dataPath } from "./lib/paths.mjs";

function regionsManifest(files) {
  const f = files.filter((x) => /^osm_passes.*\.json$/.test(x));
  return f.filter((x) => x === "osm_passes.json").concat(f.filter((x) => x !== "osm_passes.json").sort());
}

const list = regionsManifest(await readdir(DATA_DIR));
await writeFile(dataPath("osm_regions.json"), JSON.stringify(list) + "\n");
console.log("osm_regions.json: " + list.length + " file");
