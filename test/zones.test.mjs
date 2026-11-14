// scripts/lib/zones.json: the single zone catalogue shared by osm-expand, osm-rotate and discover.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ZONES, zoneById } from "../scripts/lib/zones.mjs";
import { DISCOVER_REGIONS, ITALY_REGIONS } from "../scripts/lib/discover.mjs";

const BBOX = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/;

test("every zone is well formed and ids / output files are unique", () => {
  const ids = new Set(), outs = new Set();
  for (const z of ZONES) {
    assert.match(z.id, /^[a-z][a-z0-9-]+$/, z.id);
    assert.ok(!ids.has(z.id), "duplicate id " + z.id); ids.add(z.id);
    assert.match(z.out, /^osm_passes_[a-z0-9_]+\.json$/, z.id);
    assert.ok(!outs.has(z.out), "duplicate out " + z.out); outs.add(z.out);
    assert.ok(Array.isArray(z.pbf) && z.pbf.length > 0, z.id);
    for (const u of z.pbf) assert.match(u, /^https:\/\/download\.geofabrik\.de\/[a-z0-9/-]+-latest\.osm\.pbf$/, z.id + " " + u);
    for (const k of ["bbox", "discoverBbox"]) if (z[k] != null) {
      assert.match(z[k], BBOX, z.id + " " + k);
      const [a, b, c, d] = z[k].split(",").map(Number);
      assert.ok(a < c && b < d, z.id + " " + k + " min < max");
    }
    assert.ok(["alps", "hills", "flat", "border"].includes(z.terrain), z.id);
    assert.equal(typeof z.discover, "boolean", z.id);
    if (z.terrain === "flat" || z.terrain === "border") assert.equal(z.discover, false, z.id + ": flat/border zones are not searched");
  }
  assert.equal(zoneById("austria").out, "osm_passes_at.json");
  assert.equal(zoneById("nope"), null);
});

test("the osm-expand menu lists exactly the catalogue, in order (osm-rotate rotates over it)", async () => {
  const yml = await readFile(new URL("../.github/workflows/osm-expand.yml", import.meta.url), "utf8");
  const menu = [...yml.matchAll(/^ {10}- ([a-z][a-z0-9-]+)\s*$/gm)].map((m) => m[1]);
  assert.deepEqual(menu, ZONES.map((z) => z.id));
});

test("discover: the 11 Italian regions keep their hand-tuned parameters", () => {
  assert.deepEqual(ITALY_REGIONS, ["er", "toscana-nord", "toscana-sud", "marche-umbria", "liguria", "piemonte-sud",
    "piemonte-nord", "lombardia", "trentino-aa", "veneto-fvg", "colli-veneti"]);
  assert.equal(DISCOVER_REGIONS.er.bbox, "9.15,43.70,12.85,45.15");
  assert.equal(DISCOVER_REGIONS.er.minEle, 150);
  assert.ok(Array.isArray(DISCOVER_REGIONS.er.southOf));
  assert.equal(DISCOVER_REGIONS["piemonte-nord"].minEle, 400);
  assert.equal(DISCOVER_REGIONS["trentino-aa"].prom, 150);
  assert.equal(DISCOVER_REGIONS.er.zone, undefined);
});

test("discover: every catalogue zone with discover:true is a region, with thresholds by terrain", () => {
  for (const z of ZONES) {
    const r = DISCOVER_REGIONS[z.id];
    if (!z.discover) { assert.equal(r, undefined, z.id); continue; }
    assert.ok(r && r.zone, z.id);
    assert.deepEqual(r.pbf, z.pbf);
    assert.equal(r.bbox, z.discoverBbox || z.bbox || "");
    assert.equal(r.prom, z.terrain === "alps" ? 150 : 120, z.id);
    assert.equal(r.minEle, z.terrain === "alps" ? 300 : 150, z.id);
  }
  assert.equal(DISCOVER_REGIONS.poland.bbox, "14.1,49.0,24.2,51.0", "only the southern mountain band");
});

test("discover: a zone split in discoverParts is searched as its parts, never as a whole", () => {
  const zoneIds = new Set(ZONES.map((z) => z.id)), seen = new Set();
  for (const z of ZONES) {
    if (!z.discoverParts) continue;
    assert.equal(z.discover, false, z.id + ": a split zone is not searched as a whole");
    assert.ok(Array.isArray(z.discoverParts) && z.discoverParts.length >= 2, z.id);
    const [za, zb, zc, zd] = (z.discoverBbox || z.bbox).split(",").map(Number);
    for (const p of z.discoverParts) {
      assert.match(p.id, /^[a-z][a-z0-9-]+$/, p.id);
      assert.ok(!zoneIds.has(p.id) && !seen.has(p.id), "part id clashes: " + p.id); seen.add(p.id);
      assert.match(p.bbox, BBOX, p.id);
      const [a, b, c, d] = p.bbox.split(",").map(Number);
      assert.ok(a < c && b < d, p.id + " min < max");
      assert.ok(a >= za && b >= zb && c <= zc && d <= zd, p.id + " inside " + z.id);
      const r = DISCOVER_REGIONS[p.id];
      assert.ok(r && r.zone && r.partOf === z.id, p.id);
      assert.deepEqual(r.pbf, z.pbf);
      assert.equal(r.bbox, p.bbox);
      assert.equal(r.prom, z.terrain === "alps" ? 150 : 120, p.id);
    }
  }
  assert.equal(DISCOVER_REGIONS["turkey-est"], undefined, "25.3 MiB in one file: split");
  assert.ok(DISCOVER_REGIONS["turkey-centro"] && DISCOVER_REGIONS["turkey-oriente"]);
  assert.ok(!ITALY_REGIONS.includes("turkey-centro"));
});

test("Mexico is built in slices (the whole extract ran out of a 6 GB heap, 14/11/2026)", () => {
  assert.equal(zoneById("mexico"), null);
  const mx = ZONES.filter((z) => z.id.startsWith("mexico-"));
  assert.deepEqual(mx.map((z) => z.id), ["mexico-nord", "mexico-centro-ovest", "mexico-centro-est", "mexico-sud"]);
  for (const z of mx) {
    assert.ok(z.bbox, z.id + ": clipped");
    assert.match(z.out, /^osm_passes_mx_/, z.id + ": the file still reads as Mexico (countryOfFile)");
  }
  const box = (id) => zoneById(id).bbox.split(",").map(Number);
  assert.ok(box("mexico-centro-ovest")[2] > box("mexico-centro-est")[0], "the two centre slices overlap");
  assert.ok(box("mexico-sud")[3] > box("mexico-centro-est")[1], "south overlaps the centre");
  assert.ok(box("mexico-nord")[1] < box("mexico-centro-ovest")[3], "north overlaps the centre");
});
