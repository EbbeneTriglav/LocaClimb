/*
 * LocaRide - anonymous usage counts (Rick 16/11/2026). Called by cf/worker.js.
 *
 * POST /api/ev   one batch from the app (v2/lib/stats.mjs): +1 to daily totals in D1 (binding STATS_DB).
 *                Stored: day, kind, key, count. Never the IP, the user agent, a cookie or any id.
 *                The country comes from Cloudflare (request.cf.country) and is kept only as a total.
 * GET  /api/stats?days=7   the totals, for Rick and the weekly report. Needs "Authorization: Bearer <STATS_TOKEN>"
 *                (a Worker secret); without the secret the endpoint does not exist (404).
 * No STATS_DB binding yet -> /api/ev answers 204 and stores nothing, so deploying before the database exists is safe.
 */
import { countsOf, KINDS, MAX_BODY } from "../v2/lib/stats.mjs";

const ORIGINS = ["https://locaride.app"];
const SCHEMA = "CREATE TABLE IF NOT EXISTS counts (day TEXT NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, kind, key))";
const UPSERT = "INSERT INTO counts (day, kind, key, n) VALUES (?1, ?2, ?3, 1) ON CONFLICT (day, kind, key) DO UPDATE SET n = n + 1";
let schemaReady = false;

export function today(now = new Date()) { return now.toISOString().slice(0, 10); }

/* once per Worker instance: the table, and the 24-month retention promised on the privacy page */
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.prepare(SCHEMA).run();
  await db.prepare("DELETE FROM counts WHERE day < ?1").bind(today(new Date(Date.now() - 730 * 86400000))).run();
  schemaReady = true;
}

export async function handleEvent(request, env, ctx) {
  const none = new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  if (!ORIGINS.includes(request.headers.get("Origin") || "")) return new Response("Forbidden", { status: 403 });
  const text = await request.text();
  if (text.length > MAX_BODY) return new Response("Too large", { status: 413 });
  let batch; try { batch = JSON.parse(text); } catch { return none; }
  const pairs = countsOf(batch, request.cf && request.cf.country);
  const db = env.STATS_DB;
  if (!db || !pairs.length) return none;
  const day = today();
  const work = (async () => {
    try {
      await ensureSchema(db);
      await db.batch(pairs.map(([kind, key]) => db.prepare(UPSERT).bind(day, kind, key)));
    } catch { /* a lost count is fine; never break the app */ }
  })();
  if (ctx && ctx.waitUntil) ctx.waitUntil(work); else await work;
  return none;
}

/* constant-time string compare (the token) */
export function sameToken(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function daysParam(url) {
  const d = parseInt(new URL(url).searchParams.get("days") || "7", 10);
  return Number.isFinite(d) ? Math.min(90, Math.max(1, d)) : 7;
}

/* rows [{day, kind, key, n}] -> { visitsByDay, <kind>: [[key, n] ...] top 50 } */
export function summarize(rows) {
  const out = { visitsByDay: {} }, sums = Object.fromEntries(KINDS.map((k) => [k, new Map()]));
  for (const r of rows || []) {
    if (!sums[r.kind]) continue;
    sums[r.kind].set(r.key, (sums[r.kind].get(r.key) || 0) + (+r.n || 0));
    if (r.kind === "visit") out.visitsByDay[r.day] = (out.visitsByDay[r.day] || 0) + (+r.n || 0);
  }
  for (const k of KINDS) out[k] = [...sums[k]].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 50);
  return out;
}

export async function handleStats(request, env) {
  const json = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  if (!env.STATS_TOKEN) return new Response("Not found", { status: 404 });
  const auth = request.headers.get("Authorization") || "";
  if (!sameToken(auth.replace(/^Bearer\s+/i, ""), env.STATS_TOKEN)) return new Response("Unauthorized", { status: 401 });
  if (!env.STATS_DB) return new Response(JSON.stringify({ error: "no database" }), { status: 503, headers: json });
  const days = daysParam(request.url), from = today(new Date(Date.now() - (days - 1) * 86400000));
  await ensureSchema(env.STATS_DB);
  const { results } = await env.STATS_DB.prepare("SELECT day, kind, key, n FROM counts WHERE day >= ?1").bind(from).all();
  return new Response(JSON.stringify({ from, to: today(), days, ...summarize(results) }), { headers: json });
}
