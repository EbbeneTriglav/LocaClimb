// Content-Security-Policy of the main app (_headers, ENFORCED since 01/11/2026): the page must keep
// working under it. Inline scripts are allowed only by their sha256, inline handlers not at all.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { RB_SCRIPT } from "../v2/lib/rideout.mjs";

const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const sha = (s) => "'sha256-" + createHash("sha256").update(s, "utf8").digest("base64") + "'";
/* _headers -> { path: { header: value } } */
function headers() {
  const out = {}; let cur = null;
  for (const line of read("_headers").split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    if (!/^\s/.test(line)) { cur = out[line.trim()] = {}; continue; }
    const i = line.indexOf(":"); cur[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}
const H = headers();
const PAGES = ["/", "/index.html", "/v2/*", "/privacy.html"];
const csp = H["/"]["Content-Security-Policy"];
const dir = (name) => (csp.split(";").map((d) => d.trim().split(/\s+/)).find((d) => d[0] === name) || []).slice(1);

test("the policy is enforced, identical on every page of the main app, report-only only on /classica/", () => {
  assert.ok(csp, "enforced CSP on /");
  for (const p of PAGES) assert.equal(H[p]["Content-Security-Policy"], csp, p);
  assert.ok(!H["/*"]["Content-Security-Policy"] && !H["/*"]["Content-Security-Policy-Report-Only"], "no CSP on every file: the classic app would get two policies");
  assert.ok(H["/classica/*"]["Content-Security-Policy-Report-Only"]);
});
test("scripts: no 'unsafe-inline', no 'unsafe-eval', no blanket https:", () => {
  const s = dir("script-src");
  for (const bad of ["'unsafe-inline'", "'unsafe-eval'", "https:", "*"]) assert.ok(!s.includes(bad), bad);
  for (const d of ["object-src", "base-uri", "frame-ancestors"]) assert.ok(dir(d).length, d);
  assert.deepEqual(dir("object-src"), ["'none'"]);
});
test("every inline script of the pages (and the road book) is allowed by its hash", () => {
  const s = dir("script-src");
  for (const f of ["index.html", "privacy.html", "v2/index.html"])
    for (const m of read(f).matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) assert.ok(s.includes(sha(m[1])), f + ": inline script not in script-src " + sha(m[1]));
  assert.ok(s.includes(sha(RB_SCRIPT)), "road book print script");
});
test("every external script of the main page comes from an allowed host", () => {
  const s = dir("script-src");
  for (const m of read("index.html").matchAll(/<script\b[^>]*\bsrc="(https:\/\/[^/"]+)/g)) assert.ok(s.includes(m[1]), m[1]);
});
test("no inline event handlers in the main page or in what it loads (the CSP would block them)", () => {
  const files = ["index.html", "privacy.html", "v2/classic-bridge.js", "js/lrcact.js", "js/gpxclimbs.js", "js/myclimbs.js", "js/rideimport.js",
    ...["app.mjs"].map((f) => "v2/" + f)];
  for (const f of files) assert.ok(!/\son(click|change|input|load|error|submit|keydown|keyup)\s*=\s*["']/i.test(read(f)), f);
  for (const m of read("v2/app.mjs").matchAll(/from "\.\/lib\/([a-z]+\.mjs)/g)) assert.ok(!/\son(click|change|input|load|error|submit)=/.test(read("v2/lib/" + m[1])), m[1]);
});
test("data-lrc buttons only call functions on the allow-list of js/lrcact.js", () => {
  const allowed = new Set(Object.keys(JSON.parse(read("js/lrcact.js").match(/var LRC_ACTS = (\{[^}]+\})/)[1].replace(/(\w+):/g, '"$1":'))));
  for (const f of ["v2/classic-bridge.js", "js/gpxclimbs.js", "js/myclimbs.js", "js/rideimport.js"])
    for (const m of read(f).matchAll(/data-lrc="([\w ]+)"/g)) for (const n of m[1].split(" ")) assert.ok(allowed.has(n), f + ": " + n);
});
