// scripts/security_guard.mjs (weekly live security check, .github/workflows/security-guard.yml):
// the pure helpers, and the safety properties of the workflow itself (public repo, public logs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseHeaders, expectedHeaders, moduleVersion, firebaseConfig, PAGES } from "../scripts/security_guard.mjs";

const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const RULES = parseHeaders(read("_headers"));

test("parseHeaders: rules in order, names lowercased, comments and blank lines skipped", () => {
  const r = parseHeaders("# c\n/*\n  X-A: 1\n\n/a\n  Content-Security-Policy: x; y\n# z\n/b/*\n  X-B: 2\n");
  assert.deepEqual(r, [
    { pattern: "/*", headers: { "x-a": "1" } },
    { pattern: "/a", headers: { "content-security-policy": "x; y" } },
    { pattern: "/b/*", headers: { "x-b": "2" } }
  ]);
});

test("expectedHeaders: every matching rule applies, splat matches any text, exact paths stay exact", () => {
  const r = parseHeaders("/*\n  X-A: 1\n/a\n  X-C: a\n/b/*\n  X-C: b\n");
  assert.deepEqual(expectedHeaders(r, "/a"), { "x-a": "1", "x-c": "a" });
  assert.deepEqual(expectedHeaders(r, "/a/"), { "x-a": "1" });
  assert.deepEqual(expectedHeaders(r, "/b/x/y"), { "x-a": "1", "x-c": "b" });
  assert.deepEqual(expectedHeaders(parseHeaders("/a.b\n  X: 1\n"), "/aXb"), {}, "a dot is a dot");
});

test("the real _headers: enforced CSP on the app pages, strict one on /salite/, report-only on /classica/", () => {
  const app = expectedHeaders(RULES, "/")["content-security-policy"];
  assert.ok(app && /script-src 'self'/.test(app));
  assert.equal(expectedHeaders(RULES, "/privacy")["content-security-policy"], app);
  assert.equal(expectedHeaders(RULES, "/v2/")["content-security-policy"], app);
  assert.match(expectedHeaders(RULES, "/salite/")["content-security-policy"], /script-src https:\/\/static\.cloudflareinsights\.com;/);
  const cl = expectedHeaders(RULES, "/classica/");
  assert.ok(cl["content-security-policy-report-only"] && !cl["content-security-policy"]);
  for (const p of PAGES) assert.match(expectedHeaders(RULES, p)["strict-transport-security"] || "", /max-age=\d{7,}/, p);
});

test("moduleVersion reads the ?v= of v2/app.mjs from the page; firebaseConfig reads the shipped web config", () => {
  assert.equal(moduleVersion('<script type="module" src="v2/app.mjs?v=65"></script>'), "65");
  assert.equal(moduleVersion("<p>none</p>"), null);
  assert.equal(moduleVersion(read("index.html")), (read("index.html").match(/app\.mjs\?v=(\d+)/) || [])[1]);
  const c = firebaseConfig();
  assert.match(c.apiKey, /^AIza[\w-]{35}$/);
  assert.equal(c.projectId, "locaride-ce1ad");
  assert.throws(() => firebaseConfig("const x = 1;"));
});

test("the workflow is safe in a public repo: no PR triggers, read-only token, no secrets, pinned actions", () => {
  const wf = read(".github/workflows/security-guard.yml");
  const on = wf.slice(wf.indexOf("\non:"), wf.indexOf("\npermissions:"));
  assert.match(on, /schedule:/);
  assert.match(on, /workflow_dispatch:/);
  assert.doesNotMatch(on, /pull_request|push:|workflow_run|issue|pull_request_target/);
  assert.match(wf, /\npermissions:\n {2}contents: read\n/);
  assert.doesNotMatch(wf, /:\s*write\b/, "no write permission");
  assert.doesNotMatch(wf, /secrets\./);
  for (const m of wf.matchAll(/uses:\s*(\S+)/g)) assert.match(m[1], /@[0-9a-f]{40}$/, `${m[1]} pinned to a commit`);
  assert.match(wf, /persist-credentials: false/);
  assert.match(wf, /playwright@\d+\.\d+\.\d+ /, "Playwright at a fixed version");
});

test("the script never prints a response body (public logs)", () => {
  const src = read("scripts/security_guard.mjs");
  assert.doesNotMatch(src, /console\.log\([^)]*\btext\b/);
  assert.doesNotMatch(src, /console\.log\([^)]*apiKey/);
});
