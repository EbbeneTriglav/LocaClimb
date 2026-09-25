/*
 * golden.test.mjs - regression guard for the golden set (see scripts/lib/golden.mjs).
 *
 * Compares the CURRENT effective data for each pass in test/golden/golden.json against
 * that human-approved baseline. Fails if a versante disappears, a summit moves, or a
 * climb's km/gain/gradient drifts beyond tolerance. Runs in test.yml on every push/PR
 * and as a gate inside osm-refresh.yml BEFORE the bot commits a new build.
 *
 * Intended change (e.g. a real new versante, a corrected summit)? Re-approve with
 * `node scripts/golden_snapshot.mjs --only <id>` after checking the new values by hand.
 * Skips cleanly while no baseline exists yet (bootstrap).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadEffective, comparePass, datasetStats, compareStats, GOLDEN_FILE } from "../scripts/lib/golden.mjs";

let golden = null;
try { golden = JSON.parse(await readFile(GOLDEN_FILE, "utf8")); } catch {}

if (!golden || !Array.isArray(golden.passes) || !golden.passes.length) {
  test("golden set", { skip: "no test/golden/golden.json yet - run `node scripts/golden_snapshot.mjs` and review" }, () => {});
} else {
  const data = await loadEffective();
  const byId = new Map(data.all.map((p) => [String(p.id), p]));
  test("golden: dataset-wide counts (no mass loss)", () => {
    const { errors, warnings } = compareStats(golden.stats, datasetStats(data));
    warnings.forEach((w) => console.log("  ⚠ " + w));
    assert.deepEqual(errors, [], "\n" + errors.join("\n"));
  });
  for (const base of golden.passes) {
    test(`golden: ${base.name} [${base.id}]`, () => {
      const { errors, warnings } = comparePass(base, byId.get(base.id));
      warnings.forEach((w) => console.log("  ⚠ " + w));
      assert.deepEqual(errors, [], "\n" + errors.join("\n"));
    });
  }
}
