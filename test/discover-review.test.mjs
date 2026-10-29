// scripts/lib/discover_review.mjs: review decisions survive a new discover run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveReview, idPosition, DEFAULT_REVIEW } from "../scripts/lib/discover_review.mjs";

const climb = (lat, lon) => ({ id: "osm-rt" + Math.round(lat * 1e5) + "x" + Math.round(lon * 1e5), lat, lon });

test("idPosition decodes the summit position from a discover id", () => {
  assert.deepEqual(idPosition("osm-rt4379527x1230662"), { lat: 43.79527, lon: 12.30662 });
  assert.equal(idPosition("osm-3444480468"), null);
});

test("an id still present keeps its decision and gains a stored position", () => {
  const a = climb(44.1, 10.5);
  const r = resolveReview({ publish: ["nuova"], ok: [a.id], no: [] }, [a]);
  assert.ok(r.ok.has(a.id));
  assert.deepEqual(r.review.okAt, [{ id: a.id, lat: 44.1, lon: 10.5 }]);
  assert.deepEqual(r.moved, []);
});

test("a 'no' follows its climb when the summit moves by ~100 m and the id changes", () => {
  const old = climb(44.2, 10.6), now = climb(44.2009, 10.6);   // ~100 m north
  const r = resolveReview({ publish: ["nuova"], ok: [], no: [old.id] }, [now]);
  assert.ok(r.no.has(now.id));
  assert.deepEqual(r.review.no, [now.id]);
  assert.deepEqual(r.moved, [{ from: old.id, to: now.id, kind: "no" }]);
});

test("a decision is not re-attached to a climb farther than 300 m", () => {
  const old = climb(44.3, 10.7), far = climb(44.305, 10.7);    // ~550 m
  const r = resolveReview({ publish: ["nuova"], ok: [], no: [old.id] }, [far]);
  assert.ok(!r.no.has(far.id));
  assert.deepEqual(r.review.no, [old.id], "kept for a later run");
});

test("stored noAt position wins over the id when both exist", () => {
  const now = climb(45.0, 9.0);
  const r = resolveReview({ publish: [], ok: [], no: ["osm-rt1x1"], noAt: [{ id: "osm-rt1x1", lat: 45.001, lon: 9.0 }] }, [now]);
  assert.ok(r.no.has(now.id));
});

test("a proximity match never steals a climb that keeps its own id", () => {
  const a = climb(44.4, 10.8), b = climb(44.4015, 10.8);       // 170 m apart, both still there
  const r = resolveReview({ publish: [], ok: [a.id, b.id], no: [] }, [a, b]);
  assert.deepEqual([...r.ok].sort(), [a.id, b.id].sort());
});

test("'no' wins over 'ok' for the same climb", () => {
  const a = climb(44.5, 10.9);
  const r = resolveReview({ publish: [], ok: [a.id], no: [a.id] }, [a]);
  assert.ok(r.no.has(a.id));
  assert.ok(!r.ok.has(a.id));
  assert.deepEqual(r.review.ok, []);
});

test("other keys of the review file are kept; default publish groups", () => {
  const r = resolveReview({ _comment: "x", ok: [], no: [] }, []);
  assert.equal(r.review._comment, "x");
  assert.deepEqual(r.review.publish, DEFAULT_REVIEW.publish);
});
