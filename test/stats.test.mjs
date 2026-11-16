import { test } from "node:test";
import assert from "node:assert/strict";
import { normQuery, durBucket, allowed, createSession, addClimb, addSearch, shown, hidden, takeBatch, countsOf, MAX_CLIMBS, MAX_SEARCHES } from "../v2/lib/stats.mjs";
import { handleEvent, handleStats, sameToken, daysParam, summarize } from "../cf/stats.js";

test("searches are stored without accents, personal bits or extra length", () => {
  assert.equal(normQuery("  Passo dello STELVIO "), "passo dello stelvio");
  assert.equal(normQuery("Côte de la Redoute"), "cote de la redoute");
  assert.equal(normQuery("mario.rossi@gmail.com stelvio"), "stelvio");
  assert.equal(normQuery("@rick gavia"), "gavia");
  assert.equal(normQuery("chiamami 3331234567"), "chiamami");
  assert.equal(normQuery("via roma 12"), "via roma 12");          // short numbers stay (km, house numbers are 1-3 digits)
  assert.equal(normQuery("<script>alert(1)</script>"), "script alert 1 script");
  assert.equal(normQuery("a"), "");
  assert.equal(normQuery(null), "");
  assert.ok(normQuery("x".repeat(100)).length <= 40);
});

test("time on screen goes into four bands", () => {
  assert.equal(durBucket(5000), "0-30s");
  assert.equal(durBucket(30000), "30s-2m");
  assert.equal(durBucket(119999), "30s-2m");
  assert.equal(durBucket(300000), "2-10m");
  assert.equal(durBucket(3600000), "10m+");
});

test("Do Not Track and Global Privacy Control switch the counts off", () => {
  assert.equal(allowed({ doNotTrack: "1" }), false);
  assert.equal(allowed({ globalPrivacyControl: true }), false);
  assert.equal(allowed({ doNotTrack: "unspecified" }), true);
  assert.equal(allowed(null), false);
});

test("a session: first batch counts the visit, later ones only what is new", () => {
  const s = createSession(0);
  addClimb(s, "osm-123"); addClimb(s, "osm-123"); addClimb(s, "bad id with spaces");
  addSearch(s, "stel", true); addSearch(s, "Stelvio", false); addSearch(s, "zzz", true);
  hidden(s, 45000);
  const b1 = takeBatch(s, "en");
  assert.deepEqual(b1, { v: 1, first: true, lang: "en", dur: "30s-2m", climbs: ["osm-123"], searches: [{ q: "stelvio", zero: false }, { q: "zzz", zero: true }] });
  shown(s, 50000); hidden(s, 52000);
  assert.equal(takeBatch(s, "en"), null, "2 s in the foreground and nothing done: no request");
  shown(s, 60000); addClimb(s, "stelvio"); hidden(s, 61000);
  const b2 = takeBatch(s, "xx");
  assert.equal(b2.first, false);
  assert.equal(b2.lang, "it");
  assert.deepEqual(b2.climbs, ["stelvio"]);
});

test("a session never grows past its caps", () => {
  const s = createSession(0);
  for (let i = 0; i < 50; i++) { addClimb(s, "osm-" + i); addSearch(s, "salita " + "abcdefghijklmnopqrstuvwxyz"[i % 26] + i, false); }
  assert.equal(s.climbs.length, MAX_CLIMBS);
  assert.equal(s.searches.length, MAX_SEARCHES);
});

test("the Worker trusts nothing in a batch", () => {
  assert.deepEqual(countsOf(null, "IT"), []);
  assert.deepEqual(countsOf({ v: 2, first: true }, "IT"), []);
  const pairs = countsOf({ v: 1, first: true, lang: "fr", dur: "forever", climbs: ["osm-1", "osm-1", "x y", 7], searches: [{ q: "a@b.it Gavia", zero: true }, { q: "gavia" }, "junk"] }, "it");
  assert.deepEqual(pairs, [["visit", "all"], ["lang", "other"], ["country", "XX"], ["climb", "osm-1"], ["search0", "gavia"]]);
  assert.deepEqual(countsOf({ v: 1, first: false, dur: "2-10m", climbs: [], searches: [] }, "ES"), [["dur", "2-10m"]]);
});

/* a tiny in-memory stand-in for D1: enough to check what the Worker writes and reads */
function fakeDb() {
  const rows = new Map(), log = [];
  const db = {
    rows, log,
    prepare(sql) {
      const st = { args: [], bind(...a) { st.args = a; return st; },
        async run() { log.push(sql); if (sql.startsWith("INSERT")) { const k = st.args.slice(0, 3).join("|"); rows.set(k, (rows.get(k) || 0) + 1); } return {}; },
        async all() { return { results: [...rows].map(([k, n]) => { const [day, kind, key] = k.split("|"); return { day, kind, key, n }; }).filter((r) => r.day >= st.args[0]) }; } };
      return st;
    },
    async batch(sts) { for (const st of sts) await st.run(); return []; }
  };
  return db;
}
const post = (body, origin = "https://locaride.app") => {
  const r = new Request("https://locaride.app/api/ev", { method: "POST", body, headers: origin ? { Origin: origin } : {} });
  Object.defineProperty(r, "cf", { value: { country: "IT" } });
  return r;
};

test("/api/ev: adds 1 per pair, refuses other sites, stores nothing without a database", async () => {
  const db = fakeDb(), env = { STATS_DB: db };
  const body = JSON.stringify({ v: 1, first: true, lang: "it", dur: "0-30s", climbs: ["osm-9"], searches: [] });
  assert.equal((await handleEvent(post(body), env)).status, 204);
  assert.equal((await handleEvent(post(body), env)).status, 204);
  const day = new Date().toISOString().slice(0, 10);
  assert.equal(db.rows.get(`${day}|climb|osm-9`), 2);
  assert.equal(db.rows.get(`${day}|country|IT`), 2);
  assert.ok(![...db.rows.keys()].some((k) => /\d+\.\d+\.\d+\.\d+/.test(k)), "no IP anywhere");
  assert.equal((await handleEvent(post(body, "https://evil.example"), env)).status, 403);
  assert.equal((await handleEvent(post(body, null), env)).status, 403);
  assert.equal((await handleEvent(post("x".repeat(5000)), env)).status, 413);
  assert.equal((await handleEvent(post("not json"), env)).status, 204);
  assert.equal((await handleEvent(post(body), {})).status, 204);
  assert.equal((await handleEvent(new Request("https://locaride.app/api/ev"), env)).status, 405);
});

test("/api/stats: hidden without the secret, needs the token, returns totals", async () => {
  const db = fakeDb(), env = { STATS_DB: db, STATS_TOKEN: "s3cret-token" };
  await handleEvent(post(JSON.stringify({ v: 1, first: true, lang: "es", dur: "2-10m", climbs: ["osm-9"], searches: [{ q: "angliru", zero: true }] })), env);
  const get = (auth) => new Request("https://locaride.app/api/stats?days=7", { headers: auth ? { Authorization: auth } : {} });
  assert.equal((await handleStats(get("Bearer s3cret-token"), { STATS_DB: db })).status, 404);
  assert.equal((await handleStats(get(null), env)).status, 401);
  assert.equal((await handleStats(get("Bearer wrong-token!"), env)).status, 401);
  const r = await handleStats(get("Bearer s3cret-token"), env);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.days, 7);
  assert.deepEqual(j.search0, [["angliru", 1]]);
  assert.deepEqual(j.lang, [["es", 1]]);
  assert.equal(Object.values(j.visitsByDay)[0], 1);
});

test("helpers: token compare, days clamp, summary order", () => {
  assert.equal(sameToken("abc", "abc"), true);
  assert.equal(sameToken("abc", "abd"), false);
  assert.equal(sameToken("", ""), false);
  assert.equal(daysParam("https://x/api/stats?days=500"), 90);
  assert.equal(daysParam("https://x/api/stats?days=abc"), 7);
  const s = summarize([{ day: "2026-11-16", kind: "climb", key: "b", n: 1 }, { day: "2026-11-17", kind: "climb", key: "a", n: 3 }, { day: "2026-11-16", kind: "climb", key: "b", n: 1 }]);
  assert.deepEqual(s.climb, [["a", 3], ["b", 2]]);
});
