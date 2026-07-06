/*
 * load-app.mjs - loads passes_data.js + every js/*.js file (in the same order index.html
 * <script>-tags them) into a vm context so plain logic functions (esc, hav, estDiff,
 * climbCat, ...) can be unit-tested without a browser/bundler. Mirrors the vm.runInContext
 * trick already used by scripts/bake_routes.mjs to read passes_data.js from Node.
 *
 * Only the pure/data-logic functions are safe to call on the returned context -
 * anything touching the DOM, Leaflet (`L`), or network (`fetch`) is stubbed just
 * enough to let each file's top-level code run without throwing.
 */
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JS_FILES } from "./js-files.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function noop() {}

export async function loadApp() {
  const passesCode = await readFile(path.join(ROOT, "data", "passes_data.js"), "utf8");
  const jsCode = await Promise.all(JS_FILES.map((f) => readFile(path.join(ROOT, "js", f + ".js"), "utf8")));

  const sandbox = {
    console,
    window: {},
    navigator: { userAgent: "node-test" },
    document: {
      addEventListener: noop,
      getElementById: () => null,
      createElement: () => ({ style: {}, addEventListener: noop, appendChild: noop, classList: { add: noop, remove: noop, toggle: noop } }),
      querySelectorAll: () => []
    },
    fetch: () => Promise.reject(new Error("fetch is stubbed in tests")),
    L: new Proxy({}, { get: () => noop }),
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    // isAdmin() (js/editor.js) reads location.hash/search; tests can mutate these on the
    // returned sandbox to exercise the admin gate.
    location: { hash: "", search: "" },
    setTimeout,
    clearTimeout
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);

  vm.runInContext(passesCode, sandbox, { filename: "passes_data.js" });
  JS_FILES.forEach((f, i) => {
    vm.runInContext(jsCode[i], sandbox, { filename: "js/" + f + ".js" });
  });

  return sandbox;
}
