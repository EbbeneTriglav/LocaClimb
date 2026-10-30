import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

// GitHub Pages caches every file for minutes: after a release, a NEW app.mjs with OLD lib/*.mjs
// breaks the page ("does not provide an export named ..."). So every relative import in v2 carries
// the same ?v= as app.mjs in index.html - bump them all together.
const root = new URL("../v2/", import.meta.url);
const v = /app\.mjs\?v=(\d+)/.exec(readFileSync(new URL("index.html", root), "utf8"))[1];
test("every v2 module import carries the release version of index.html", () => {
  const files = ["app.mjs", ...readdirSync(new URL("lib/", root)).filter((f) => f.endsWith(".mjs")).map((f) => "lib/" + f)];
  for (const f of files) {
    for (const m of readFileSync(new URL(f, root), "utf8").matchAll(/from "(\.[^"]+)"/g)) {
      assert.match(m[1], new RegExp(`\\?v=${v}$`), `${f}: ${m[1]} should end with ?v=${v}`);
    }
  }
});
