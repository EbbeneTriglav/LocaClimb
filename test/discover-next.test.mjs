// scripts/discover_next.mjs: the rotation picks never-run regions first, then the oldest.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickNext, failedRecently, busyRegions } from "../scripts/discover_next.mjs";

test("never-run regions first (catalogue order), then the oldest", () => {
  const regions = ["er", "liguria", "austria", "slovenia", "norway"];
  const last = { er: 300, liguria: 100, austria: 200, slovenia: 0 };
  assert.deepEqual(pickNext(regions, last, 2), ["slovenia", "norway"]);
  assert.deepEqual(pickNext(regions, { ...last, slovenia: 50, norway: 400 }, 2), ["slovenia", "liguria"]);
  assert.deepEqual(pickNext(regions, {}, 3), ["er", "liguria", "austria"]);
});

// 21/11/2026: usa-kentucky + usa-maine failed at every turn and blocked the whole rotation.
test("a region that failed in the last 3 days goes to the back; a later success clears it", () => {
  const now = Date.parse("2026-11-21T12:00:00Z"), h = (x) => new Date(now - x * 3600e3).toISOString();
  const jobs = [
    { name: "plan", conclusion: "success", completed_at: h(1) },
    { name: "discover (usa-kentucky)", conclusion: "failure", completed_at: h(4) },
    { name: "discover (usa-maine)", conclusion: "failure", completed_at: h(30) },
    { name: "discover (usa-maine)", conclusion: "success", completed_at: h(2) },
    { name: "discover (sweden)", conclusion: "failure", completed_at: h(100) },     // older than 3 days
    { name: "discover (peru)", conclusion: "cancelled", completed_at: h(1) }
  ];
  const failed = failedRecently(jobs, now);
  assert.deepEqual([...failed], ["usa-kentucky"]);
  const regions = ["usa-kentucky", "usa-maine", "sweden", "peru"];
  assert.deepEqual(pickNext(regions, {}, 2, failed), ["usa-maine", "sweden"]);
  assert.deepEqual(pickNext(["usa-kentucky"], {}, 2, failed), ["usa-kentucky"], "alone, a failed region still runs");
});

test("regions of a queued or running osm-discover are not picked again", () => {
  const runs = [
    { status: "in_progress", display_title: "osm-discover usa-kentucky,usa-maine" },
    { status: "queued", display_title: "osm-discover sweden" },
    { status: "completed", display_title: "osm-discover peru,chile" },
    { status: "in_progress", display_title: "OSM discover (salite senza passo)" }
  ];
  const busy = busyRegions(runs);
  assert.deepEqual([...busy].sort(), ["sweden", "usa-kentucky", "usa-maine"]);
  assert.deepEqual(pickNext(["usa-kentucky", "usa-maine", "sweden", "peru", "chile"], {}, 2, new Set(), busy), ["peru", "chile"]);
});
