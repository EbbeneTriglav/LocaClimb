/*
 * Coverage for the data-load error surfacing in js/data.js (Slice 4). The old chains ended
 * in a bare .catch(function(){}), so a malformed core file or a total OSM-load failure left
 * a silently-degraded map. dataWarn() now routes UNEXPECTED failures to the #rs toast - but
 * expected-optional cases (regional-file 404s, the baked-routes perf cache) must stay quiet
 * so it never cries wolf. Both properties are asserted here.
 *
 * jsdom harness (fetch is stubbed to reject, which is exactly the failure being surfaced);
 * skips cleanly if jsdom is absent.
 */
import test from "node:test";
import assert from "node:assert/strict";

let renderApp;
try {
  ({ renderApp } = await import("./helpers/render-app.mjs"));
} catch {
  test("data-load error surfacing (jsdom)", { skip: "jsdom not installed - run `npm install jsdom --no-save`" }, () => {});
}

const tick = () => new Promise((r) => setTimeout(r, 5));

if (renderApp) {
  test("dataWarn logs and surfaces a warning to the #rs toast", async () => {
    const win = await renderApp();
    const logs = [];
    win.console = { warn: (m) => logs.push(m) };

    win.dataWarn("boom");

    const rs = win.document.getElementById("rs");
    assert.ok(rs.innerHTML.includes("boom"), "message shown in the toast");
    assert.ok(rs.classList.contains("show"), "toast made visible");
    assert.ok(logs.some((m) => /boom/.test(m)), "also console.warn'd");
  });

  test("a failed core fetch (loadCuratedOverrides) surfaces to the user", async () => {
    const win = await renderApp(); // harness fetch rejects -> the .catch path we care about
    win.console = { warn: () => {} };

    win.loadCuratedOverrides();
    await tick();

    const rs = win.document.getElementById("rs");
    assert.ok(rs.classList.contains("show"), "toast shown on core-data failure");
    assert.match(rs.innerHTML, /curated_overrides\.json/, "names the file that failed");
  });

  test("the baked-routes perf cache fails QUIETLY (no toast)", async () => {
    const win = await renderApp();
    const logs = [];
    win.console = { warn: (m) => logs.push(m) };

    win.loadBakedRoutes(); // fetch rejects
    await tick();

    const rs = win.document.getElementById("rs");
    assert.equal(rs.classList.contains("show"), false, "no toast - baked routes are optional");
    assert.equal(rs.innerHTML, "", "toast untouched");
    assert.ok(logs.some((m) => /routes_baked/.test(m)), "logged to console only");
  });
}
