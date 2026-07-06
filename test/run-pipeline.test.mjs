import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Integration test for deploy/systemd/run-pipeline.sh: builds a throwaway bare "remote"
// + a cloned checkout, then runs the real script against them (no mocking - this is the
// exact git flow that will run on a VPS). Mirrors the manual verification done while
// writing the script; automated here so a future edit can't silently break it.

const SCRIPT = path.resolve(import.meta.dirname, "..", "deploy", "systemd", "run-pipeline.sh");
let root, remote, checkout;

function git(cwd, args) { execFileSync("git", args, { cwd, stdio: "pipe" }); }
function runPipeline(env) {
  return execSync(`bash "${SCRIPT}"`, { cwd: checkout, env: { ...process.env, ...env }, stdio: "pipe" }).toString();
}

before(() => {
  root = mkdtempSync(path.join(tmpdir(), "locaclimb-pipeline-test-"));
  remote = path.join(root, "remote");
  const seed = path.join(root, "seed");
  checkout = path.join(root, "checkout");

  git(root, ["init", "--bare", "-q", "-b", "main", remote]);
  git(root, ["clone", "-q", remote, seed]);
  writeFileSync(path.join(seed, "output.json"), "seed\n");
  git(seed, ["add", "output.json"]);
  git(seed, ["-c", "user.name=seed", "-c", "user.email=seed@x", "commit", "-q", "-m", "seed"]);
  git(seed, ["push", "-q", "origin", "main"]);
  git(root, ["clone", "-q", remote, checkout]);
});

after(() => { rmSync(root, { recursive: true, force: true }); });

test("run-pipeline.sh fails fast with a clear message when a required env var is missing", () => {
  assert.throws(() => runPipeline({ REPO_DIR: checkout }), /set PIPELINE_CMD|set COMMIT_PATHS|set COMMIT_MSG/);
});

test("run-pipeline.sh runs the command, commits, and pushes when content actually changes", () => {
  runPipeline({
    REPO_DIR: checkout,
    PIPELINE_CMD: 'echo "changed" > output.json',
    COMMIT_PATHS: "output.json",
    COMMIT_MSG: "test: real change"
  });
  const log = execFileSync("git", ["log", "--oneline", "-1"], { cwd: checkout }).toString();
  assert.match(log, /test: real change/);
  assert.equal(readFileSync(path.join(checkout, "output.json"), "utf8"), "changed\n");

  // pushed to the bare remote, not just committed locally
  const remoteLog = execFileSync("git", ["log", "--oneline", "-1", "main"], { cwd: remote }).toString();
  assert.match(remoteLog, /test: real change/);
});

test("run-pipeline.sh is a clean no-op (no empty commit) when the command produces no actual change", () => {
  const beforeSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: checkout }).toString().trim();
  const out = runPipeline({
    REPO_DIR: checkout,
    PIPELINE_CMD: "true", // does nothing to output.json
    COMMIT_PATHS: "output.json",
    COMMIT_MSG: "test: should not happen"
  });
  assert.match(out, /nothing to commit/);
  const afterSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: checkout }).toString().trim();
  assert.equal(afterSha, beforeSha, "HEAD must not move when nothing changed");
});

test("run-pipeline.sh resets a dirty/diverged checkout before running (matches a fresh CI checkout)", () => {
  writeFileSync(path.join(checkout, "output.json"), "locally-edited, should be discarded\n");
  runPipeline({
    REPO_DIR: checkout,
    PIPELINE_CMD: 'echo "from pipeline" > output.json',
    COMMIT_PATHS: "output.json",
    COMMIT_MSG: "test: after dirty reset"
  });
  assert.equal(readFileSync(path.join(checkout, "output.json"), "utf8"), "from pipeline\n");
});
