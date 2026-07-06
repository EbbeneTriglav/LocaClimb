/*
 * Flat ESLint config. Dev-only, no package.json - install ad hoc like the rest of this
 * repo: `npm install eslint globals --no-save`, then `npx eslint js data scripts server test`.
 *
 * The frontend is ~200 plain globals shared across js/*.js with no import/export, so a naive
 * per-file no-undef would flag every cross-file reference. We instead DERIVE the project's own
 * globals from the vm loader (test/helpers/load-app.mjs) - Object.keys() of its sandbox is the
 * exact set the app defines - and register them, so no-undef flags only genuinely-undefined
 * names (typos). See docs/testing.md.
 */
import vm from "node:vm";
import globals from "globals";
import { loadApp } from "./test/helpers/load-app.mjs";

// High-signal, ~zero-false-positive correctness rules (the useful subset of ESLint's
// "recommended" set). Enumerated explicitly rather than pulling in @eslint/js, so the
// config stays a single self-contained file with no extra dependency. no-unused-vars and
// no-empty are handled per-section (they need architecture-specific tuning).
const CORRECTNESS_RULES = {
  "no-undef": "error",
  "no-dupe-keys": "error",
  "no-dupe-args": "error",
  "no-dupe-else-if": "error",
  "no-unreachable": "error",
  "no-func-assign": "error",
  "no-cond-assign": "error",
  "no-constant-condition": ["error", { checkLoops: false }],
  "no-self-assign": "error",
  "no-sparse-arrays": "error",
  "no-unsafe-negation": "error",
  "no-unexpected-multiline": "error",
  "no-fallthrough": "error",
  "no-irregular-whitespace": "error",
  "getter-return": "error",
  "no-obj-calls": "error",
  "valid-typeof": "error",
  "use-isnan": "error"
};

// The keys the harness injects as stubs (browser/CDN env), not app declarations - excluded
// from the derived set because the browser globals config already provides them.
const HARNESS_STUBS = new Set([
  "console", "window", "navigator", "document", "fetch", "L",
  "localStorage", "sessionStorage", "location", "setTimeout", "clearTimeout"
]);

// Enumerate globals from INSIDE the vm context: an uninitialized top-level `var map;` that's
// never assigned during load (map is set later by initMap) doesn't materialize on the sandbox
// object, but it IS a property of the context's globalThis. Subtract the standard built-ins
// (from a fresh empty context) and the harness stubs, leaving exactly the app's declarations.
const sandbox = await loadApp();
const BUILTINS = new Set(vm.runInContext("Object.getOwnPropertyNames(globalThis)", vm.createContext({})));
const appNames = vm.runInContext("Object.getOwnPropertyNames(globalThis)", sandbox);
const projectGlobals = {};
for (const name of appNames) {
  if (!BUILTINS.has(name) && !HARNESS_STUBS.has(name)) projectGlobals[name] = "writable"; // app reassigns many
}

// Rules that fight this codebase's legitimate idioms are turned off; the rest of ESLint's
// recommended set (no-undef, no-dupe-keys, no-unreachable, valid-typeof, use-isnan, ...) stays.
const sharedRuleOverrides = {
  // classic globals: a helper defined in one file and used in another looks unused per-file.
  "no-unused-vars": "off",
  // the intentional control-flow catch(e){} fallbacks are idiomatic here.
  "no-empty": ["error", { allowEmptyCatch: true }]
};

export default [
  { ignores: ["node_modules/**", "build_tmp/**", "data/**/*.json"] },

  // Frontend: classic <script> globals (browser + the CDN libs actually used + derived app globals)
  {
    files: ["js/**/*.js", "data/passes_data.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
        L: "readonly", SunCalc: "readonly", firebase: "readonly",
        ...projectGlobals
      }
    },
    rules: { ...CORRECTNESS_RULES, ...sharedRuleOverrides }
  },

  // Node-side: ESM scripts, server, tests, this config
  {
    files: ["scripts/**/*.mjs", "server/**/*.mjs", "test/**/*.mjs", "*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node }
    },
    rules: {
      ...CORRECTNESS_RULES,
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }]
    }
  }
];
