// MapLibre rejects a layer whose paint/layout value uses ["zoom"] anywhere but in ONE top-level
// "interpolate"/"step" (01/11/2026: "sel-line" had two zoom curves inside a "case", MapLibre refused
// the layer and the other sides of a climb never showed). Checked on the source of v2/app.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../v2/app.mjs", import.meta.url), "utf8");
/* the bracketed JSON-like expression that starts at index i ("[" ... matching "]") */
function exprAt(s, i) { let d = 0; for (let j = i; j < s.length; j++) { if (s[j] === "[") d++; else if (s[j] === "]" && --d === 0) return s.slice(i, j + 1); } return s.slice(i); }

test("every zoom-dependent style value has its zoom curve at the top level", () => {
  const bad = [];
  for (const m of src.matchAll(/"([a-z-]+)":\s*\[/g)) {
    const e = exprAt(src, m.index + m[0].length - 1), n = (e.match(/\["zoom"\]/g) || []).length;
    if (!n) continue;
    const top = /^\["(interpolate|step)",[^[]*\[[^\]]*\],\s*\["zoom"\]/.test(e.replace(/\s+/g, " ").replace(/^\[\s*/, "["));
    if (n > 1 || !top) bad.push(m[1] + ": " + e.slice(0, 90));
  }
  assert.deepEqual(bad, []);
});
