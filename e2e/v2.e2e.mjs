/*
 * v2.e2e.mjs - v2 (the main page "/" since 31/10/2026) boots in BOTH languages: no uncaught error, the list of climbs
 * in view appears, a climb page opens. Added after a release where the Italian start crashed
 * ("Cannot access 'LOC' before initialization") while the English one worked.
 * Third-party network (basemap, weather, geocoding) is not asserted.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

let chromium;
try { ({ chromium } = await import("playwright")); } catch {}
const BASE_URL = (process.env.BASE_URL || "http://localhost:8000/").replace(/\/?$/, "/");

if (!chromium) {
  test("v2 smoke", { skip: "playwright not installed - `npm install playwright --no-save`" }, () => {});
} else {
  for (const lang of ["it", "en"]) {
    test(`v2 boots in ${lang}: list of climbs and a climb page`, { timeout: 90000 }, async () => {
      const browser = await chromium.launch();
      try {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        await ctx.addInitScript((l) => { try { localStorage.setItem("locaride_lang", l); } catch { /* ignore */ } }, lang);
        // third-party network is not under test and made this flaky in CI: basemap, DEM, weather, geocoding off.
        // The panel must still work without them (it renders from our data, not from the map).
        await ctx.route(/openfreemap\.org|amazonaws\.com|open-meteo\.com|nominatim\.openstreetmap\.org|brouter\.de/, (r) => r.abort());
        const page = await ctx.newPage(), errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(BASE_URL);
        await page.waitForSelector("#panel h2", { timeout: 45000 });
        const h2 = await page.locator("#panel h2").innerText();
        assert.match(h2, lang === "en" ? /climbs here|No climbs/i : /salite qui|Nessuna salita/i);
        await page.goto(BASE_URL + "#/s/stelvio");
        await page.waitForSelector("#panel h1", { timeout: 30000 });
        assert.match(await page.locator("#panel h1").innerText(), /stelvio/i);
        assert.deepEqual(errors, []);
      } finally { await browser.close(); }
    });
  }
}

/* Old addresses after the switch: /v2/ links (bookmarks, shared climbs) land on the main page with
   their hash; the classic app's shared-ride and discover links open /classica/. */
if (chromium) {
  test("old links: /v2/#/s/... and ?g= / ?discover= land in the right app", { timeout: 60000 }, async () => {
    const browser = await chromium.launch();
    try {
      const ctx = await browser.newContext();
      await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());   // only our own pages matter here
      const page = await ctx.newPage();
      await page.goto(BASE_URL + "v2/#/s/stelvio");
      await page.waitForURL((u) => !u.pathname.includes("/v2/"), { timeout: 15000 });
      assert.equal(new URL(page.url()).hash, "#/s/stelvio");
      await page.goto(BASE_URL + "?g=abc123");
      await page.waitForURL(/\/classica\/\?g=abc123/, { timeout: 15000 });
      await page.goto(BASE_URL + "?discover=lombardia");
      await page.waitForURL(/\/classica\/\?discover=lombardia/, { timeout: 15000 });
    } finally { await browser.close(); }
  });
}
