/*
 * v2.e2e.mjs - the v2 beta (/v2/) boots in BOTH languages: no uncaught error, the list of climbs
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
        await page.goto(BASE_URL + "v2/");
        await page.waitForSelector("#panel h2", { timeout: 45000 });
        const h2 = await page.locator("#panel h2").innerText();
        assert.match(h2, lang === "en" ? /climbs here|No climbs/i : /salite qui|Nessuna salita/i);
        await page.goto(BASE_URL + "v2/#/s/stelvio");
        await page.waitForSelector("#panel h1", { timeout: 30000 });
        assert.match(await page.locator("#panel h1").innerText(), /stelvio/i);
        assert.deepEqual(errors, []);
      } finally { await browser.close(); }
    });
  }
}
