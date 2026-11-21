// scripts/lib/download.mjs - OSM extract download with mirrors and retries (16/11/2026)
import { test } from "node:test";
import assert from "node:assert/strict";
import { mirrors, why, fetchWithRetry, UA, geofabrikFolder } from "../scripts/lib/download.mjs";

const GF = "https://download.geofabrik.de/north-america/us/maine-latest.osm.pbf";
const res = (status) => ({ status, ok: status >= 200 && status < 300 });
const fake = (plan) => { const calls = []; return { calls, fetchImpl: async (u, o) => { calls.push([u, o]); const x = plan(u, calls.length); if (x instanceof Error) throw x; return res(x); } }; };
const opts = (f) => ({ fetchImpl: f.fetchImpl, sleep: async () => {}, log: () => {} });

test("geofabrikFolder: <parent>/<id>/<id>-latest.osm.pbf (Geofabrik layout since 11/2026)", () => {
  assert.equal(geofabrikFolder("https://download.geofabrik.de/europe/france/alsace-latest.osm.pbf"), "https://download.geofabrik.de/europe/france/alsace/alsace-latest.osm.pbf");
  assert.equal(geofabrikFolder("https://download.geofabrik.de/north-america/us/idaho-latest.osm.pbf"), "https://download.geofabrik.de/north-america/us/idaho/idaho-latest.osm.pbf");
  assert.equal(geofabrikFolder("https://download.geofabrik.de/europe/italy-latest.osm.pbf"), "https://download.geofabrik.de/europe/italy/italy-latest.osm.pbf");
  assert.equal(geofabrikFolder("https://download.geofabrik.de/europe/france/alsace/alsace-latest.osm.pbf"), null, "already new");
  assert.equal(geofabrikFolder("https://example.org/x-latest.osm.pbf"), null);
});

test("mirrors: new Geofabrik layout first, then the URL as given, then the osm.fr paths; other URLs alone", () => {
  assert.deepEqual(mirrors("https://download.geofabrik.de/europe/france/rhone-alpes-latest.osm.pbf"), [
    "https://download.geofabrik.de/europe/france/rhone-alpes/rhone-alpes-latest.osm.pbf",
    "https://download.geofabrik.de/europe/france/rhone-alpes-latest.osm.pbf",
    "https://download.openstreetmap.fr/extracts/europe/france/rhone-alpes.osm.pbf",
    "https://download.openstreetmap.fr/extracts/europe/france/rhone_alpes.osm.pbf"]);
  assert.equal(mirrors(GF).length, 4, "new layout, as given, osm.fr dash and underscore paths");
  assert.deepEqual(mirrors("https://example.org/x.pbf"), ["https://example.org/x.pbf"]);
});

test("a mirror answering 404 is dropped; Geofabrik's transient failures are retried until it works", async () => {
  const net = Object.assign(new Error("fetch failed"), { cause: { code: "ECONNRESET" } });
  const f = fake((u, n) => (u.includes("openstreetmap.fr") ? 404 : n < 5 ? net : 200));
  let saved = 0;
  const used = await fetchWithRetry(GF, async () => { saved++; }, opts(f));
  assert.equal(used, "https://download.geofabrik.de/north-america/us/maine/maine-latest.osm.pbf", "new Geofabrik layout first"); assert.equal(saved, 1);
  const fr = f.calls.filter(([u]) => u.includes("openstreetmap.fr")).map(([u]) => u);
  assert.equal(fr.length, new Set(fr).size, "each osm.fr path asked once, then dropped");
  assert.equal(f.calls[0][1].headers["User-Agent"], UA);
});

test("gives up after the waits with the same error message as before", async () => {
  const f = fake(() => new Error("fetch failed"));
  await assert.rejects(fetchWithRetry(GF, async () => {}, { ...opts(f), waits: [1, 1, 1] }), /download exhausted: /);
  assert.equal(f.calls.length, 4, "first try + one per wait");
  const g = fake(() => 404);
  await assert.rejects(fetchWithRetry(GF, async () => {}, opts(g)), /download exhausted/, "every candidate 404: stop at once");
  assert.equal(g.calls.length, 4);
});

test("why() shows the network cause hidden behind \"fetch failed\"", () => {
  assert.equal(why(Object.assign(new Error("fetch failed"), { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } })), "fetch failed (UND_ERR_CONNECT_TIMEOUT)");
  assert.equal(why(new Error("HTTP 500")), "HTTP 500");
});
