/*
 * Cloudflare Workers static assets reject any single file over 25 MiB - the deploy would
 * fail and the site would stay on the previous version. This guard fails CI at 24 MiB
 * (safety margin) and warns from 20 MiB, so a growing osm_passes*.json is split in time.
 * Largest file at migration time (Sep 2026): data/osm_passes.json, 14 MB.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MiB = 1024 * 1024;
const FAIL = 24 * MiB, WARN = 20 * MiB;
const PUBLISHED_DIRS = ["data", "js"];

async function files(dir) {
  const out = [];
  let entries = [];
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await files(p)); else out.push(p);
  }
  return out;
}

test("no published file is near the Cloudflare 25 MiB per-file limit", async () => {
  const all = [];
  for (const d of PUBLISHED_DIRS) all.push(...await files(path.join(ROOT, d)));
  const tooBig = [];
  for (const f of all) {
    const { size } = await stat(f);
    const rel = path.relative(ROOT, f), mb = (size / MiB).toFixed(1);
    if (size > FAIL) tooBig.push(`${rel}: ${mb} MiB`);
    else if (size > WARN) console.log(`  ⚠ ${rel}: ${mb} MiB - approaching the 25 MiB limit, plan a split`);
  }
  assert.deepEqual(tooBig, [], "split these files before deploying:\n" + tooBig.join("\n"));
});
