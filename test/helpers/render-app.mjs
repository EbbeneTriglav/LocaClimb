/*
 * render-app.mjs - jsdom harness for DOM/rendering tests (a sibling to load-app.mjs,
 * which stays the fast vm path for pure-logic tests). Loads passes_data.js + every js/*.js
 * into a real jsdom window - exactly as index.html <script src>-tags them - so panel/DOM
 * builders like renderPassPanel() can be driven and their produced markup asserted.
 *
 * jsdom (like pngjs for the scripts) is a dev-only, ad-hoc dependency: install it with
 * `npm install jsdom --no-save` before running these tests - no package.json, consistent
 * with the rest of the repo. Tests that import this skip cleanly if it's absent (see
 * panel-render.test.mjs).
 *
 * Leaflet (L) and canvas are stubbed, so these assert MARKUP, not map tiles or chart
 * pixels. Network fetch is stubbed to reject (weather/news degrade gracefully).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { JS_FILES } from "./js-files.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// Minimal fake 2D context: jsdom has no canvas backend, so getContext("2d") returns null
// and the elevation chart's drawElev()/renderElev() would throw. We assert on the panel's
// HTML, not the chart pixels, so a no-op ctx is enough. measureText is the one call whose
// return value is read (.width).
function makeCtx() {
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return () => ({ width: 0 });
      if (prop in target) return target[prop];
      return () => {};
    },
    set(target, prop, val) { target[prop] = val; return true; }
  });
}

export async function renderApp() {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><body><div id="modal"></div><div id="dp"></div><div id="rs"></div></body></html>`,
    // A concrete origin (not the default opaque about:blank) so window.localStorage, which
    // js/data.js touches, is available instead of throwing a SecurityError.
    { runScripts: "outside-only", pretendToBeVisual: true, url: "http://localhost/" }
  );
  const win = dom.window;

  // Globals the classic scripts expect to already exist (index.html loads Leaflet/etc. from
  // CDNs; here they're stubbed just enough that the render path doesn't throw). SunCalc and
  // firebase are intentionally left undefined - calcSun() and fbReady() both self-guard.
  const noop = new Proxy(function () {}, { get: () => noop, apply: () => noop });
  win.L = noop; // Leaflet - not exercised by renderPassPanel()
  win.fetch = () => Promise.reject(new Error("fetch stubbed in render tests"));
  win.HTMLCanvasElement.prototype.getContext = () => makeCtx();
  if (!win.localStorage) win.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  if (!win.sessionStorage) win.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };

  // Load passes_data.js + every js/*.js in index.html's order. Indirect eval (win.eval) runs
  // in the window's global scope, so each file's top-level var/function become window globals
  // - the classic-script model reproduced exactly, no module system, no bundler.
  win.eval(await readFile(path.join(ROOT, "data", "passes_data.js"), "utf8"));
  for (const f of JS_FILES) {
    win.eval(await readFile(path.join(ROOT, "js", f + ".js"), "utf8"));
  }
  return win;
}
