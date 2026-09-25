/*
 * smoke.e2e.mjs - automated subset of docs/browser-smoke.md, in a real Chromium.
 *
 * Covers the wiring jsdom can't: Leaflet boots, the data layer loads from data/ with no
 * silent failures, OSM passes merge in, search -> detail panel works for a curated pass.
 * Deliberately NOT asserted: weather/news/tiles/routing (third-party network, flaky in CI).
 *
 *   npm install playwright --no-save && npx playwright install --with-deps chromium
 *   node scripts/serve.mjs &            # http://localhost:8000/
 *   node --test "e2e/*.e2e.mjs"         # BASE_URL=... to target another deployment
 *
 * Lives outside test/ on purpose: the fast suite (test/*.test.mjs) must not need a browser.
 * Uses the same node:test runner + ad-hoc --no-save dependency pattern as the rest of the repo.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

let chromium;
try { ({ chromium } = await import("playwright")); } catch {}

const BASE_URL = process.env.BASE_URL || "http://localhost:8000/";
const PASS_QUERY = process.env.E2E_PASS || "Stelvio";            // a curated pass with >1 versante
const CORE_DATA = ["curated_overrides.json", "osm_regions.json"]; // must load; regional osm_*.json 404s are expected
const MOBILE = process.env.E2E_VIEWPORT === "mobile";                 // CI matrix runs both
const SHOT_DIR = process.env.E2E_SHOTS || "e2e-shots";

if (!chromium) {
  test("browser smoke", { skip: "playwright not installed - `npm install playwright --no-save`" }, () => {});
} else {
  let browser, page;
  const pageErrors = [], dataWarns = [], badData = [];

  before(async () => {
    browser = await chromium.launch();
    page = await browser.newPage(MOBILE
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, locale: "it-IT" }
      : { viewport: { width: 1280, height: 800 }, locale: "it-IT" });
    page.on("pageerror", (e) => pageErrors.push(e.message));
    page.on("console", (m) => { if (m.type() === "warning" && m.text().startsWith("[locaClimb]")) dataWarns.push(m.text()); }); // dataWarn()
    page.on("response", (r) => {
      const u = r.url();
      if (CORE_DATA.some((f) => u.includes("/data/" + f)) && r.status() >= 400) badData.push(`${r.status()} ${u}`);
    });
    await page.goto(BASE_URL, { waitUntil: "load" });
  });
  after(async () => {
    // Always leave a screenshot behind: CI uploads it when the job fails.
    try { await mkdir(SHOT_DIR, { recursive: true }); await page.screenshot({ path: `${SHOT_DIR}/${MOBILE ? "mobile" : "desktop"}.png`, fullPage: true }); } catch {}
    if (browser) await browser.close();
  });

  test("map boots with curated markers", async () => {
    await page.waitForSelector("#map.leaflet-container", { timeout: 15000 });
    await page.waitForFunction(() => typeof PASSES_DATA !== "undefined" && PASSES_DATA.length > 0, null, { timeout: 15000 });
    const n = await page.locator("#map .leaflet-marker-icon, #map path.leaflet-interactive").count();
    assert.ok(n > 0, "no markers or clusters rendered on the map");
  });

  test("OSM passes load and merge", async () => {
    await page.waitForFunction(() => typeof osmPasses !== "undefined" && osmPasses.length > 0, null, { timeout: 30000 });
  });

  test("data files come from data/ with no silent failures", async () => {
    await page.waitForTimeout(1500); // let late fetches settle
    assert.deepEqual(badData, [], "core data file failed to load");
    assert.deepEqual(dataWarns, [], "dataWarn() fired - a data file is malformed or missing");
  });

  test(`search "${PASS_QUERY}" -> detail panel with versanti`, async (t) => {
    if (MOBILE && !(await page.locator("#search").isVisible())) { t.skip("search box hidden on mobile layout"); return; }
    await page.fill("#search", PASS_QUERY);
    await page.waitForSelector("#sresults.open .sr-item", { timeout: 5000 });
    await page.press("#search", "Enter");
    await page.waitForSelector("#dp.open", { timeout: 10000 });
    const title = await page.locator("#dp h2").first().innerText();
    assert.match(title, new RegExp(PASS_QUERY, "i"));
    const toggles = await page.locator('#elev-tog [data-act="setElev"]').count();
    assert.ok(toggles >= 2, `expected >=2 versanti toggles, got ${toggles}`);
  });

  test("close button closes the panel (capture-phase delegation)", async (t) => {
    if (!(await page.locator("#dp.open").count())) { t.skip("panel not open (search skipped)"); return; }
    await page.locator('#dp [data-act="closeD"]').first().click();
    await page.waitForFunction(() => !document.getElementById("dp").classList.contains("open"), null, { timeout: 5000 });
  });

  test("no uncaught JS errors during the whole session", () => {
    assert.deepEqual(pageErrors, []);
  });
}
