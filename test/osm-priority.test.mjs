import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pendingTargets } from "../scripts/osm_priority.mjs";

const meta = { "a.json": { target: "spain-nord", builtAt: "2026-10-31" }, "b.json": { target: "spain-sud", builtAt: "2026-11-04" }, "c.json": { target: "france-alps", builtAt: "2026-11-03" } };
test("a target is pending until it is rebuilt on or after 'since'", () => {
  assert.deepEqual(pendingTargets({ since: "2026-11-03", targets: ["spain-nord", "spain-sud", "france-alps", "slovenia"] }, meta), ["spain-nord", "slovenia"]);
});
test("unknown targets are skipped when the menu is given; no queue -> nothing", () => {
  assert.deepEqual(pendingTargets({ since: "2026-11-03", targets: ["spain-nord", "nowhere"] }, meta, ["spain-nord"]), ["spain-nord"]);
  assert.deepEqual(pendingTargets(null, meta), []);
  assert.deepEqual(pendingTargets({ since: "ieri", targets: ["spain-nord"] }, meta), []);
});
test("every target of data/osm_priority.json exists in the osm-expand menu", () => {
  const q = JSON.parse(readFileSync(new URL("../data/osm_priority.json", import.meta.url), "utf8"));
  const menu = [...readFileSync(new URL("../.github/workflows/osm-expand.yml", import.meta.url), "utf8").matchAll(/^ {10}- ([a-z][a-z0-9-]+)/gm)].map((m) => m[1]);
  for (const t of q.targets) assert.ok(menu.includes(t), t);
});
