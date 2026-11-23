/*
 * extraroads.mjs - the last kilometres of the forced climbs (data/climbs_extra.json), 22/11/2026.
 *
 * Grand Tour summit finishes often end on a road OSM tags highway=track or highway=service: the
 * Blockhaus (track, concrete), Alpe Motta (track), the Puy de Dome (service). Those classes are not
 * in the road graph (scripts/lib/highways.mjs: all the tracks of a country would not fit in memory),
 * so the builder logged "no road" and the climb never reached the app, run after run.
 * Now the builder takes track/service ONLY in a small box around each forced climb of the extract:
 * tags-filter on track/service, one `osmium extract` with a box per climb, merge into the graph.
 * The extras loop still snaps classified roads first; track/service only fill the "no road" gap.
 */
export const EXTRA_HW = ["track", "service"];
export const EXTRA_PAD = 0.03;          // degrees around a forced climb (~3 km N-S, 2-2.5 km E-W in Europe)
export const EXTRA_BOXES_PER_PASS = 200; // osmium extract keeps one id set per box: bounded passes

/* pure: forced climbs [{ lat, lon }] + the build's clip bbox ("minlon,minlat,maxlon,maxlat" or "")
   -> osmium extract boxes [minlon, minlat, maxlon, maxlat] for the climbs inside the clip,
   overlapping boxes merged (a dense area does not cost one box per climb) */
export function extraBoxes(extras, bbox = "", pad = EXTRA_PAD) {
  const clip = String(bbox || "").split(",").map(Number);
  const hasClip = clip.length === 4 && clip.every(Number.isFinite);
  let boxes = [];
  for (const x of extras || []) {
    if (!Number.isFinite(x.lat) || !Number.isFinite(x.lon)) continue;
    if (hasClip && !(x.lon >= clip[0] && x.lon <= clip[2] && x.lat >= clip[1] && x.lat <= clip[3])) continue;
    boxes.push([x.lon - pad, x.lat - pad, x.lon + pad, x.lat + pad]);
  }
  // merge overlaps until stable (few dozen boxes: quadratic is fine)
  for (let changed = true; changed;) {
    changed = false;
    const out = [];
    for (const b of boxes) {
      const o = out.find((a) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]);
      if (o) { o[0] = Math.min(o[0], b[0]); o[1] = Math.min(o[1], b[1]); o[2] = Math.max(o[2], b[2]); o[3] = Math.max(o[3], b[3]); changed = true; }
      else out.push(b.slice());
    }
    boxes = out;
  }
  return boxes.map((b) => b.map((v) => Math.round(v * 1e5) / 1e5));
}

/* pure: osmium extract config(s) for the boxes, at most `per` boxes per pass */
export function extractConfigs(boxes, dir, per = EXTRA_BOXES_PER_PASS) {
  const out = [];
  for (let i = 0; i < boxes.length; i += per) {
    out.push({ directory: dir, extracts: boxes.slice(i, i + per).map((b, k) => ({ output: "xbox" + (i + k) + ".osm.pbf", output_format: "pbf", bbox: b })) });
  }
  return out;
}
