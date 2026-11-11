// The pages for search engines (scripts/lib/seo.mjs + scripts/build_seo_pages.mjs): one static page per
// climb at /salite/<slug>/, because Google does not index the app's #/s/<id> addresses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { slugify, assignSlugs, esc, sideRows, climbPage, hubPage, letterPage, initialOf, sitemapXml, robotsTxt, nearest, profileSvg, SITE } from "../scripts/lib/seo.mjs";
import { wanted, STREET, build } from "../scripts/build_seo_pages.mjs";

const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const SIDE = { side: "Da Prato allo Stelvio", distance_km: 24.4, startElevation: 915, endElevation: 2757, avgGradient: 7.6, maxGradient: 12, elevationProfile: [915, 1300, 1800, 2300, 2757] };

test("slugify: accents, German letters, punctuation, empty names", () => {
  assert.equal(slugify("Passo dello Stelvio / Stilfser Joch"), "passo-dello-stelvio-stilfser-joch");
  assert.equal(slugify("Col de l'Iseran"), "col-de-l-iseran");
  assert.equal(slugify("Großglockner Hochalpenstraße"), "grossglockner-hochalpenstrasse");
  assert.equal(slugify("Ötztaler Höhe"), "otztaler-hohe");
  assert.equal(slugify("Vršič"), "vrsic");
  assert.equal(slugify("   "), "salita");
  assert.ok(slugify("a ".repeat(100)).length <= 80);
  assert.ok(!slugify("x".repeat(79) + " y").endsWith("-"));
});

test("assignSlugs: unique, the curated climb keeps the plain name, same name -> top height -> id", () => {
  const osm = { id: "osm-1", name: "Passo Gavia", elevation: 2621 };
  const cur = { id: "gavia", name: "Passo Gavia", elevation: 2621, curated: true };
  const other = { id: "osm-2", name: "Passo Gavia", elevation: 2621 };
  const s = assignSlugs([osm, other, cur]);
  assert.equal(s.get(cur), "passo-gavia");
  assert.equal(s.get(osm), "passo-gavia-2621");
  assert.equal(s.get(other), "passo-gavia-osm-2");
  assert.equal(new Set(s.values()).size, 3);
});

test("sideRows: only plausible sides, hardest first, no duplicate label", () => {
  const rows = sideRows([
    { side: "Da Bormio", distance_km: 21.5, startElevation: 1225, endElevation: 2757 },
    SIDE,
    { ...SIDE },                                                         // same side from a second file
    { side: "Rotto", distance_km: 5, startElevation: 2000, endElevation: 1900 },
    { side: "Corto", distance_km: 0.2, startElevation: 100, endElevation: 150 },
    { side: "Galleria", distance_km: 3, startElevation: 500, endElevation: 800, maxGradient: 34 }   // "Dati da verificare" in the app
  ]);
  assert.deepEqual(rows.map((r) => r.side), ["Da Prato allo Stelvio", "Da Bormio"]);
  assert.equal(rows[0].gain, 1842);
  assert.ok(Math.abs(rows[1].avg - 1532 / 215) < 1e-9, "average computed when the side has none");
  assert.equal(rows[1].max, null);
});

test("climb page: title, description, canonical, JSON-LD, link into the app", () => {
  const c = { id: "stelvio", name: "Passo dello Stelvio", lat: 46.5287, lon: 10.4531, elevation: 2757, difficulty: 10, cat: "HC", country: "Italia" };
  const html = climbPage(c, "passo-dello-stelvio", sideRows([SIDE]), [{ name: "Passo Gavia", slug: "passo-gavia", km: 25.2 }]);
  assert.match(html, /<title>Passo dello Stelvio in bici: da Prato allo Stelvio 24,4 km al 7,6% \| LocaRide<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/locaride\.app\/salite\/passo-dello-stelvio\/">/);
  assert.match(html, /<meta name="description" content="[^"]{60,300}">/);
  assert.match(html, /<html lang="it">/);
  assert.ok(html.includes('href="/#/s/stelvio"'), "the button opens the climb in the app");
  assert.ok(html.includes('href="/salite/passo-gavia/"'), "nearby climbs are linked");
  assert.ok(html.includes("+1842 m") && html.includes("12%"));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(ld["@type"], "TouristAttraction");
  assert.equal(ld.geo.elevation, 2757);
  assert.equal((html.match(/<script/g) || []).length, 1, "no script but the JSON-LD data block");
  assert.ok(!/ on\w+=/.test(html), "no inline handlers");
  assert.ok(html.includes("OpenStreetMap") && html.includes("ODbL"), "ODbL attribution");
});

test("climb page: names and sides from the data are escaped (also inside JSON-LD)", () => {
  const c = { id: "osm-<x>", name: '<img src=x onerror=alert(1)> "Col"', lat: 45, lon: 7 };
  const html = climbPage(c, "col", sideRows([{ ...SIDE, side: "</script><script>alert(2)</script>" }]));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(!html.includes("<script>alert(2)"));
  assert.equal((html.match(/<script/g) || []).length, 1);
  assert.ok(html.includes('href="/#/s/osm-%3Cx%3E"'));
  assert.equal(esc(`<a href="x">'&`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
  assert.match(profileSvg(sideRows([SIDE])[0]), /^<svg viewBox="0 0 640 160"/);
});

test("hub and letter pages, initials", () => {
  const e = [{ name: "Zoncolan", slug: "zoncolan", difficulty: 10, elevation: 1750, country: "Italia" }, { name: "Alpe d'Huez", slug: "alpe-d-huez", difficulty: 9, country: "Francia" }];
  const hub = hubPage(e, ["a", "z"]);
  assert.match(hub, /<link rel="canonical" href="https:\/\/locaride\.app\/salite\/">/);
  assert.ok(hub.includes('href="/salite/indice/z/"') && hub.indexOf("Zoncolan") < hub.indexOf("Alpe d&#39;Huez"), "hardest first");
  const z = letterPage("z", [e[0]]);
  assert.match(z, /<h1>Salite con la Z<\/h1>/);
  assert.ok(z.includes('href="/salite/zoncolan/"'));
  assert.equal(initialOf("Ötztaler"), "o");
  assert.equal(initialOf("1000 Miglia"), "0-9");
});

test("sitemap, robots and nearest", () => {
  const xml = sitemapXml([{ loc: `${SITE}/` }, { loc: `${SITE}/salite/a&b/`, lastmod: "2026-11-11" }]);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.ok(xml.includes("<loc>https://locaride.app/salite/a&amp;b/</loc><lastmod>2026-11-11</lastmod>"));
  const r = robotsTxt();
  assert.match(r, /^Sitemap: https:\/\/locaride\.app\/sitemap\.xml$/m);
  for (const p of ["/__/", "/api/"]) assert.ok(r.includes(`Disallow: ${p}`), p);
  assert.ok(!/^Disallow: \/$/m.test(r) && !r.includes("Disallow: /salite"), "the pages stay crawlable");
  const a = { name: "A", slug: "a", lat: 46, lon: 10 }, b = { name: "B", slug: "b", lat: 46.1, lon: 10 }, far = { name: "F", slug: "f", lat: 47, lon: 10 };
  const n = nearest(a, [a, b, far], 8, 40);
  assert.deepEqual(n.map((x) => x.slug), ["b"]);
  assert.ok(Math.abs(n[0].km - 11.06) < 0.1);
});

test("which climbs get a page: curated always; no gravel, flagged or street names; difficulty floors", () => {
  assert.equal(wanted({ curated: true, difficulty: 1 }), true);
  assert.equal(wanted({ cc: "IT", difficulty: 3, name: "Colle di Superga" }), true);
  assert.equal(wanted({ cc: "IT", difficulty: 2, name: "Colle" }), false);
  assert.equal(wanted({ cc: "FR", difficulty: 6, name: "Col" }), false);
  assert.equal(wanted({ cc: "FR", difficulty: 7, name: "Col" }), true);
  assert.equal(wanted({ cc: "IT", difficulty: 8, name: "Colle", q: 1 }), false);
  assert.equal(wanted({ cc: "IT", difficulty: 8, name: "Colle", surfaceLabel: "sterrato" }), false);
  assert.equal(wanted({ cc: "US", difficulty: 9, name: "Mount" }), false);
  for (const n of ["Via Roma", "Salita presso Bellagio", "SP 583", "Località Pian"]) assert.ok(STREET.test(n), n);
  assert.ok(!STREET.test("Passo Vivione"));
});

test("_headers: the climb pages have their own strict policy", () => {
  const h = read("_headers"), i = h.indexOf("\n/salite/*\n");
  assert.ok(i > 0, "a /salite/* block");
  const csp = h.slice(i).split("\n")[2].replace(/^\s*Content-Security-Policy:\s*/, "");
  const dir = (n) => (csp.split(";").map((d) => d.trim().split(/\s+/)).find((d) => d[0] === n) || []).slice(1);
  assert.deepEqual(dir("script-src"), ["https://static.cloudflareinsights.com"]);
  assert.deepEqual(dir("style-src"), ["'self'"]);
  assert.deepEqual(dir("object-src"), ["'none'"]);
  assert.ok(dir("frame-ancestors").length && dir("base-uri").length);
});

test("the real data: unique slugs, a sane number of pages, the famous climbs are there", () => {
  const entries = build();
  assert.ok(entries.length > 1000 && entries.length < 15000, `${entries.length} pages (Cloudflare: 20,000 files per deploy)`);
  assert.equal(new Set(entries.map((e) => e.slug)).size, entries.length);
  for (const e of entries) assert.match(e.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  for (const id of ["stelvio", "gavia", "mortirolo"]) {
    const e = entries.find((x) => x.id === id);
    assert.ok(e, id);
    assert.ok(e.rows.length >= 2, `${id}: ${e.rows.length} sides`);
  }
});

test("the published pages match the generator (when they have been written)", { skip: !existsSync(new URL("../salite/index.html", import.meta.url)) }, () => {
  const dirs = readdirSync(new URL("../salite/", import.meta.url), { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== "indice").length;
  const sm = read("sitemap.xml"), urls = (sm.match(/<loc>/g) || []).length;
  assert.ok(sm.includes(`<loc>${SITE}/salite/</loc>`));
  assert.ok(urls >= dirs + 2, `${urls} urls for ${dirs} pages`);
  assert.ok(read("robots.txt").includes("Sitemap:"));
});

test("the pages refresh themselves after every data build (.github/workflows/seo-pages.yml)", () => {
  const wf = read(".github/workflows/seo-pages.yml");
  const names = JSON.parse(wf.match(/workflows: (\[.*\])/)[1]);
  const dataWorkflows = ["osm-expand.yml", "osm-refresh.yml", "osm-discover.yml", "osm-border.yml"]
    .map((f) => read(".github/workflows/" + f).match(/^name: (.+)$/m)[1].trim());
  assert.deepEqual(names.slice().sort(), dataWorkflows.slice().sort(), "workflow_run must list the data builds by their exact names");
  assert.match(wf, /conclusion == 'success'/, "only after a build that succeeded");
  assert.match(wf, /group: seo-pages\n\s+cancel-in-progress: true/, "own queue: never a pending data build pushed out of osm-data");
  assert.ok(!/group: osm-data/.test(wf));
  for (const p of ["data/passes_data.js", "data/curated_overrides.json", "data/name_fixes.json", "scripts/lib/seo.mjs", "v2/lib/data.mjs"]) assert.ok(wf.includes(`"${p}"`), p);
  assert.match(wf, /node scripts\/build_seo_pages\.mjs/);
  assert.match(wf, /node --test test\/seo-pages\.test\.mjs \|\| \{/, "pages are tested before they are published");
  assert.match(wf, /git add -A salite sitemap\.xml robots\.txt/, "it commits only its own output");
  assert.match(wf, /for attempt in 1 2 3 4 5; do\n\s+git fetch origin main\n\s+git reset --hard origin\/main/, "conflict-proof commit loop");
});
