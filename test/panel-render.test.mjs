/*
 * DOM/rendering coverage for js/panel.js's renderPassPanel() - the core detail panel and,
 * until now, the largest untested surface (the pure-function suites never touch the DOM).
 * Runs in jsdom via test/helpers/render-app.mjs (Leaflet + canvas stubbed - we assert
 * MARKUP, not tiles/pixels).
 *
 * The XSS-escape case is the anchor: it fails if the esc() calls in renderPassPanel are ever
 * dropped, which nothing else in the suite guards. Needs jsdom (`npm install jsdom --no-save`);
 * skips cleanly if it's absent so the rest of the suite still runs.
 */
import test from "node:test";
import assert from "node:assert/strict";

let renderApp;
try {
  ({ renderApp } = await import("./helpers/render-app.mjs"));
} catch {
  test("panel rendering (jsdom)", { skip: "jsdom not installed - run `npm install jsdom --no-save`" }, () => {});
}

if (renderApp) {
  test("renderPassPanel renders a curated pass into #dp", async () => {
    const win = await renderApp();
    const p = win.PASSES_DATA.find((x) => x.versanti && x.versanti.length);
    win.renderPassPanel(p, false);

    const dp = win.document.getElementById("dp");
    assert.ok(dp.classList.contains("open"), "panel marked open");
    assert.ok(dp.innerHTML.includes(p.name), "pass name rendered");

    // versanti comparison table: an empty corner <th> + one header cell per versante
    const ths = dp.querySelectorAll("table.vtable thead th");
    assert.equal(ths.length, p.versanti.length + 1, "one column per versante");

    // async sections leave their target nodes wired up for weather/news/ratings
    assert.ok(dp.querySelector("#wbox"), "weather box present");
    assert.ok(dp.querySelector("#newsbox"), "news box present");
    assert.ok(dp.querySelector("#ratebox"), "ratings box present");
  });

  test("renderPassPanel escapes HTML in pass fields (XSS guard)", async () => {
    const win = await renderApp();
    const base = win.PASSES_DATA.find((x) => x.versanti && x.versanti.length);
    const p = Object.assign({}, base, {
      name: '<img src=x onerror=alert(1)>',
      description: '</h2><script>alert(2)</scr' + 'ipt>'
    });
    win.renderPassPanel(p, false);

    const dp = win.document.getElementById("dp");
    assert.ok(dp.innerHTML.includes("&lt;img"), "name is present but escaped in the markup");
    assert.equal(dp.querySelector("img[onerror]"), null, "no live <img> element injected");
    assert.equal(dp.querySelector("script"), null, "no <script> element injected via description");
  });

  test("renderPassPanel renders the OSM (isOsm) branch without throwing", async () => {
    const win = await renderApp();
    const base = win.PASSES_DATA.find((x) => x.versanti && x.versanti.length);
    const op = Object.assign({}, base, { region: "" });
    assert.doesNotThrow(() => win.renderPassPanel(op, true));

    const dp = win.document.getElementById("dp");
    assert.ok(dp.querySelector(".osm-badge"), "OSM badge rendered in the isOsm branch");
  });

  // ---- unified panel: shared header + the un-enriched OSM stub (openD/openOsmD dedup) ----

  test("passHeader is the shared header; bare mode omits the difficulty line", async () => {
    const win = await renderApp();
    const p = win.PASSES_DATA.find((x) => x.versanti && x.versanti.length);
    const full = win.passHeader(p, true, false);
    const bare = win.passHeader(p, true, true);

    assert.ok(full.includes("osm-badge") && bare.includes("osm-badge"), "OSM badge in both");
    assert.ok(bare.includes(p.name), "name in header");
    assert.ok(/&#x260[56];/.test(full), "full header carries the difficulty stars");
    assert.ok(!/&#x260[56];/.test(bare), "bare header drops the status/difficulty line");
  });

  test("renderNews distinguishes 'no news' from 'news failed to load'", async () => {
    const win = await renderApp();
    const p = win.PASSES_DATA.find((x) => x.versanti && x.versanti.length);
    win.renderPassPanel(p, false); // creates #newsbox
    const box = win.document.getElementById("newsbox");

    // loaded fine, this pass simply has no news
    win.PASS_NEWS = {};
    win.newsFailed = false;
    win.renderNews(p);
    assert.match(box.innerHTML, /Nessuna novit/, "empty state when news loaded but none for this pass");

    // the fetch failed - must NOT read as 'no news'
    win.newsFailed = true;
    win.renderNews(p);
    assert.match(box.innerHTML, /non disponibili/i, "distinct message when news failed to load");
  });

  test("renderOsmStub renders the un-enriched notice, no versanti table", async () => {
    const win = await renderApp();
    win.map = { setView() {} }; // renderOsmStub calls map.setView; Leaflet isn't up in tests
    const base = win.PASSES_DATA.find((x) => x.versanti && x.versanti.length);
    const op = Object.assign({}, base, { versanti: [] });
    win.renderOsmStub(op);

    const dp = win.document.getElementById("dp");
    assert.ok(dp.classList.contains("open"), "panel open");
    assert.ok(dp.querySelector("#osm-enr"), "un-enriched notice present");
    assert.ok(dp.querySelector("#wbox"), "weather box present");
    assert.ok(dp.querySelector(".osm-badge"), "OSM badge via shared passHeader");
    assert.equal(dp.querySelector("table.vtable"), null, "no versanti comparison table in the stub");
  });
}
