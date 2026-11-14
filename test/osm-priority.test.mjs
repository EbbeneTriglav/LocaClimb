import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pendingTargets, nextTarget } from "../scripts/osm_priority.mjs";

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

test("next target (Rick 14/11/2026: zones never built or months old): priority queue, then never built, then the stalest", () => {
  const T = ["spain-nord", "spain-sud", "france-alps", "slovenia", "iceland", "taiwan"];
  const m = { "a.json": { target: "spain-nord", builtAt: "2026-11-10" }, "b.json": { target: "spain-sud", builtAt: "2026-09-01" },
    "c.json": { target: "france-alps", builtAt: "2026-11-12" }, "d.json": { target: "slovenia", builtAt: "2026-08-23" } };
  const q = { since: "2026-11-11", targets: ["spain-nord", "france-alps"] };
  assert.equal(nextTarget(T, q, m, 0), "spain-nord", "the priority queue first");
  assert.equal(nextTarget(T, null, m, 0), "iceland", "then the zones never built, in menu order");
  assert.equal(nextTarget(T, null, m, 3), "taiwan", "one tick in 4 rotates among them: a zone that keeps failing cannot block the rest");
  const all = { ...m, "e.json": { target: "iceland", builtAt: "2026-11-01" }, "f.json": { target: "taiwan", builtAt: "2026-10-01" } };
  assert.equal(nextTarget(T, null, all, 0), "slovenia", "then the stalest build");
  assert.equal(nextTarget(T, null, all, 4), "slovenia");
  assert.notEqual(nextTarget(T, null, all, 7), "slovenia", "and one tick in 4 one of the next stalest");
  assert.equal(nextTarget([], null, all, 0), null);
});
