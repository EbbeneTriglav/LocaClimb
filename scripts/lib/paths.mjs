/*
 * Single source of truth for where the data layer lives on disk.
 *
 * Every Node script/server that reads or writes a data file (passes_data.js,
 * *.json) resolves its path through dataPath() instead of hardcoding a bare
 * filename. The frontend has its own copy of this policy: DATA_DIR in js/state.js.
 * Moving the data directory (or pointing it at a volume/CDN on the VPS) is then a
 * one-line change here, not a sweep across ~30 call sites.
 *
 * dataPath("osm_passes.json")  -> <repo>/data/osm_passes.json   (bare name -> data/)
 * dataPath("/tmp/x.json")      -> /tmp/x.json                   (explicit path -> as-is)
 * dataPath("sub/y.json")       -> sub/y.json                    (has a separator -> as-is)
 *
 * The "bare name -> data/" rule is deliberate: CI/systemd keep passing
 * `--out osm_passes.json` (bare) and it lands in data/ automatically, so only the
 * git add/commit paths in the workflows need the data/ prefix, not the --out args.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DATA_DIR = path.join(ROOT, "data");

export function dataPath(name) {
  if (!name) return name;
  if (path.isAbsolute(name) || name.includes("/") || name.includes(path.sep)) return name;
  return path.join(DATA_DIR, name);
}
