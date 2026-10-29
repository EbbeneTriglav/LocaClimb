/*
 * discover_review.mjs - apply Rick's review decisions to a fresh discover run.
 *
 * A discover id is built from the summit coordinates (osm-rt<lat*1e5>x<lon*1e5>), so when an
 * algorithm change moves a summit by a few metres the id changes and an "ok" / "no" decision
 * would silently stop applying. Each decision is therefore also stored with its summit position
 * (okAt / noAt: [{ id, lat, lon }]) and re-attached by proximity when the exact id is gone.
 *
 * Pure functions only (no IO). Used by scripts/promote_discover.mjs, covered by
 * test/discover-review.test.mjs.
 */

export const DEFAULT_REVIEW = Object.freeze({ publish: ["nuova", "doppione"], ok: [], no: [] });
export const MATCH_KM = 0.3;

const km = (a, b) => Math.hypot((a.lat - b.lat) * 111.2, (a.lon - b.lon) * 111.2 * Math.cos(a.lat * Math.PI / 180));
const r5 = (x) => Math.round(x * 1e5) / 1e5;

/* Lat/lon encoded in a discover id, or null for ids of another shape. */
export function idPosition(id) {
  const m = /^osm-rt(-?\d+)x(-?\d+)$/.exec(String(id || ""));
  return m ? { lat: Number(m[1]) / 1e5, lon: Number(m[2]) / 1e5 } : null;
}

/* Nearest climb of `disc` whose summit is within MATCH_KM of pos, or null. */
function nearest(pos, disc, taken) {
  let best = null, bd = MATCH_KM;
  for (const p of disc) {
    if (taken.has(p.id) || p.lat == null || p.lon == null) continue;
    const d = km(pos, p);
    if (d <= bd) { bd = d; best = p; }
  }
  return best;
}

/*
 * review: { publish, ok, no, okAt?, noAt?, ... } as stored on disk (other keys are kept).
 * disc:   the climbs of the new discover run.
 * Returns { ok: Set<id>, no: Set<id>, review, moved: [{ from, to, kind }] } where `review` is the
 * file to write back: ids updated to the current run, every decision with its position.
 * A "no" wins over an "ok" for the same climb.
 */
export function resolveReview(review, disc) {
  const byId = new Map(disc.map((p) => [p.id, p]));
  const out = { ...review };
  const moved = [];
  const sets = {};
  for (const kind of ["no", "ok"]) {
    const at = new Map((review[kind + "At"] || []).map((x) => [x.id, x]));
    const ids = new Set([...(review[kind] || []), ...at.keys()]);
    const res = new Map();   // current id -> { id, lat, lon }
    const taken = new Set();
    // exact ids first, so a proximity match never steals a climb that is still there by id
    for (const id of ids) {
      const p = byId.get(id);
      if (p) { res.set(id, { id, lat: r5(p.lat), lon: r5(p.lon) }); taken.add(id); }
    }
    for (const id of ids) {
      if (byId.has(id)) continue;
      const pos = at.get(id) || idPosition(id);
      const p = pos && nearest(pos, disc, taken);
      if (p) {
        res.set(p.id, { id: p.id, lat: r5(p.lat), lon: r5(p.lon) }); taken.add(p.id);
        moved.push({ from: id, to: p.id, kind });
      } else {
        // not in this run: keep the decision, a later run may find the climb again
        res.set(id, { id, lat: pos ? r5(pos.lat) : null, lon: pos ? r5(pos.lon) : null });
      }
    }
    const list = [...res.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    out[kind] = list.map((x) => x.id);
    out[kind + "At"] = list;
    sets[kind] = new Set(out[kind]);
  }
  for (const id of sets.no) sets.ok.delete(id);
  out.ok = out.ok.filter((id) => !sets.no.has(id));
  out.okAt = out.okAt.filter((x) => !sets.no.has(x.id));
  if (!out.publish) out.publish = DEFAULT_REVIEW.publish.slice();
  return { ok: sets.ok, no: sets.no, review: out, moved };
}
