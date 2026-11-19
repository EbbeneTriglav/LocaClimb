// scripts/validate_data.mjs --save / --baseline: the data pipelines fail only on NEW errors (19/11/2026)
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gateArgs, splitErrors } from "../scripts/validate_data.mjs";

test("gateArgs reads --save and --baseline, nothing else", () => {
  assert.deepEqual(gateArgs([]), { save: null, baseline: null });
  assert.deepEqual(gateArgs(["--save", "a.json"]), { save: "a.json", baseline: null });
  assert.deepEqual(gateArgs(["--baseline", "b.json"]), { save: null, baseline: "b.json" });
  assert.deepEqual(gateArgs(["--baseline"]), { save: null, baseline: null }, "flag without a file: strict");
});

test("splitErrors: an error already on main is old, any other is new; no baseline = all new", () => {
  const e = ["A", "B"];
  assert.deepEqual(splitErrors(e, ["A"]), { fresh: ["B"], old: ["A"] });
  assert.deepEqual(splitErrors(e, null), { fresh: ["A", "B"], old: [] });
  assert.deepEqual(splitErrors(e, ["A", "B", "C"]), { fresh: [], old: ["A", "B"] });
});

test("the real script: --save never fails, --baseline of the same data passes, a stricter baseline fails", () => {
  const d = mkdtempSync(join(tmpdir(), "vg-")), base = join(d, "base.json");
  execFileSync(process.execPath, ["scripts/validate_data.mjs", "--save", base], { stdio: "pipe" });
  const saved = JSON.parse(readFileSync(base, "utf8"));
  assert.ok(Array.isArray(saved));
  execFileSync(process.execPath, ["scripts/validate_data.mjs", "--baseline", base], { stdio: "pipe" });   // throws on exit 1
  if (saved.length) {
    const none = join(d, "none.json"); writeFileSync(none, "[]");
    assert.throws(() => execFileSync(process.execPath, ["scripts/validate_data.mjs", "--baseline", none], { stdio: "pipe" }), "an error not in the baseline fails");
  }
});
