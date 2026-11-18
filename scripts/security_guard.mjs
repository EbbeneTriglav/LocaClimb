#!/usr/bin/env node
/*
 * security_guard.mjs - weekly security check of the LIVE site (Rick 18/11/2026).
 * Run by .github/workflows/security-guard.yml on GitHub's runners, so it no longer needs Rick's PC.
 *
 *   node scripts/security_guard.mjs            HTTP checks: headers = _headers, Firebase API key locked to
 *                                              our referrer, Firestore refuses anonymous writes and reads
 *                                              without App Check, no e-mail enumeration, Worker endpoints
 *   node scripts/security_guard.mjs --browser  real Chromium (Playwright, installed ad hoc by the workflow):
 *                                              no CSP violation and no JS error on the main screens, a
 *                                              foreign script injected in the page IS blocked, App Check
 *
 * Read-only. The one write is an anonymous Firestore PATCH that MUST be refused (403).
 * The repo is public, so are the Actions logs: print only statuses and yes/no, never a response body.
 * FAIL checks make the run red (GitHub mails Rick); WARN checks are only reported (e.g. App Check from a
 * datacenter IP, which reCAPTCHA may score low). Results also go to $GITHUB_STEP_SUMMARY.
 * Pure helpers are tested in test/security-guard.test.mjs.
 */
/* global window, document -- used only inside page.evaluate() and addInitScript(), which run in the browser */
import { readFileSync, appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const SITE = process.env.GUARD_SITE || "https://locaride.app";
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

/* the public web config of Firebase (the same object the app ships), so the key is not copied here */
export function firebaseConfig(src = read("v2/lib/diary.mjs")) {
  const apiKey = (src.match(/apiKey:\s*"([^"]+)"/) || [])[1];
  const projectId = (src.match(/projectId:\s*"([^"]+)"/) || [])[1];
  if (!apiKey || !projectId) throw new Error("Firebase config not found in v2/lib/diary.mjs");
  return { apiKey, projectId };
}

/* _headers (Cloudflare) -> [{ pattern, headers: { lowercased name: value } }] in file order */
export function parseHeaders(text) {
  const rules = []; let cur = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) { cur = { pattern: line.trim(), headers: {} }; rules.push(cur); continue; }
    const i = line.indexOf(":");
    if (cur && i > 0) cur.headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return rules;
}

/* the headers Cloudflare should send for a path: every matching rule, later rules win ("*" = any text) */
export function expectedHeaders(rules, path) {
  const out = {};
  for (const r of rules) {
    const re = new RegExp("^" + r.pattern.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$");
    if (re.test(path)) Object.assign(out, r.headers);
  }
  return out;
}

/* the pages whose live headers are compared with _headers */
export const PAGES = ["/", "/privacy", "/v2/", "/classica/", "/salite/"];

/* the ?v= the live page uses for the v2 modules (the road book import needs the same one) */
export function moduleVersion(html) { return (html.match(/v2\/app\.mjs\?v=(\d+)/) || [])[1] || null; }

const results = [];
export function record(level, name, ok, detail = "") { results.push({ level, name, ok: !!ok, detail: String(detail) }); }

async function status(url, opts = {}) {
  try { const r = await fetch(url, Object.assign({ redirect: "manual" }, opts)); return { status: r.status, res: r }; }
  catch (e) { return { status: 0, error: e.cause?.code || e.name }; }
}

async function httpChecks() {
  const rules = parseHeaders(read("_headers"));
  for (const p of PAGES) {
    const { status: st, res, error } = await status(SITE + p);
    if (!res) { record("FAIL", `header ${p}`, false, error); continue; }
    const want = expectedHeaders(rules, p), h = (n) => res.headers.get(n);
    const csp = h("content-security-policy"), ro = h("content-security-policy-report-only");
    const same = csp === (want["content-security-policy"] || null) && ro === (want["content-security-policy-report-only"] || null);
    record("FAIL", `header ${p}: CSP = _headers`, st === 200 && same, `HTTP ${st}${same ? "" : ", CSP diversa da _headers"}`);
    record("FAIL", `header ${p}: HSTS, nosniff, frame`, /max-age=\d{7,}/.test(h("strict-transport-security") || "") && h("x-content-type-options") === "nosniff" && !!h("x-frame-options"));
  }

  const { apiKey, projectId } = firebaseConfig();
  const authUri = async (referer) => {
    const headers = { "Content-Type": "application/json" }; if (referer) headers.Referer = referer;
    const { status: st, res } = await status(`https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${apiKey}`,
      { method: "POST", headers, body: JSON.stringify({ identifier: "nobody-lr-guard@example.com", continueUri: SITE + "/" }) });
    const text = res ? await res.text() : "";
    return { st, blocked: /API_KEY_HTTP_REFERRER_BLOCKED/.test(text), registered: /"registered"/.test(text) };
  };
  const none = await authUri(null), evil = await authUri("https://evil.example/"), ours = await authUri(SITE + "/");
  record("FAIL", "chiave API bloccata senza referrer", none.st === 403 && none.blocked, `HTTP ${none.st}`);
  record("FAIL", "chiave API bloccata da un sito estraneo", evil.st === 403 && evil.blocked, `HTTP ${evil.st}`);
  record("FAIL", "chiave API funziona da locaride.app", ours.st === 200, `HTTP ${ours.st}`);
  record("FAIL", "nessuna enumerazione delle e-mail", ours.st === 200 && !ours.registered);

  const fs = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const patch = await status(`${fs}/ratings/zz-guard-check?key=${apiKey}`, { method: "PATCH",
    headers: { "Content-Type": "application/json", Referer: SITE + "/" }, body: JSON.stringify({ fields: { sum: { integerValue: "999" } } }) });
  record("FAIL", "Firestore: scrittura anonima rifiutata", patch.status === 403, `HTTP ${patch.status}`);
  const get = await status(`${fs}/ratings?pageSize=1&key=${apiKey}`, { headers: { Referer: SITE + "/" } });
  record("FAIL", "Firestore: lettura senza App Check rifiutata (App Check obbligatorio)", get.status === 403, `HTTP ${get.status}`);

  const ev = async (origin) => (await status(SITE + "/api/ev", { method: "POST",
    headers: Object.assign({ "Content-Type": "text/plain" }, origin ? { Origin: origin } : {}), body: JSON.stringify({ v: 1, first: false, dur: "x" }) })).status;
  const evEvil = await ev("https://evil.example"), evNone = await ev(null);
  record("FAIL", "/api/ev rifiuta altre origini", evEvil === 403 && evNone === 403, `estranea ${evEvil}, nessuna ${evNone}`);
  const s1 = await status(SITE + "/api/stats"), s2 = await status(SITE + "/api/stats", { headers: { Authorization: "Bearer wrong" } });
  record("FAIL", "/api/stats chiuso senza token giusto", [401, 404].includes(s1.status) && [401, 404].includes(s2.status), `${s1.status} / ${s2.status}`);
}

async function browserChecks() {
  const { chromium } = await import("playwright");
  const home = await (await fetch(SITE + "/")).text();
  const v = moduleVersion(home);
  const browser = await chromium.launch(process.env.GUARD_CHANNEL ? { channel: process.env.GUARD_CHANNEL } : {});   // local run: GUARD_CHANNEL=msedge
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await ctx.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(e.violatedDirective + " | " + (e.blockedURI || "inline")));
    window.print = () => {};
    try { window.localStorage.setItem("lr_install", JSON.stringify({ snoozedUntil: 9e15 })); } catch { /* private mode */ }
  });
  const CONTROL = async (page) => page.evaluate(async () => {
    const s = document.createElement("script"); s.src = "https://unpkg.com/lr-csp-control.js"; document.head.appendChild(s);
    await new Promise((r) => setTimeout(r, 800));
    return (window.__csp || []).some((x) => /lr-csp-control/.test(x));
  });
  const ROADBOOK = `(async()=>{const m=await import('/v2/lib/rideout.mjs?v=${v}');const d={title:'Test',lang:'it',km:10,gain:100,side:{track:[[46,10],[46.01,10.01],[46.02,10.02]],elevationProfile:[100,150,200],distance_km:2},climbs:[],water:[],stops:[],weather:null,eta:null};location.href=URL.createObjectURL(new Blob([m.roadbookHtml(d)],{type:'text/html'}));})()`;
  const SESSIONS = [
    ["mappa", "/", []],
    ["salita", "/#/s/mortirolo", []],
    ["oggi", "/#/oggi", []],
    ["giro", "/#/giro?p=46.46690,10.37120;46.34430,10.48750;46.25880,10.50980", []],
    ["road book", "/", [ROADBOOK]],
    ["profilo", "/#/profilo", []],
    ["privacy", "/privacy", []],
    ["salite (SEO)", "/salite/", []],
    ["salita SEO", "/salite/passo-dello-stelvio/", []]
  ];
  for (const [name, path, steps] of SESSIONS) {
    const page = await ctx.newPage(), errors = [];
    page.on("pageerror", (e) => errors.push((e.message || String(e)).slice(0, 120)));
    try {
      await page.goto(SITE + path, { waitUntil: "load", timeout: 45000 });
      await page.waitForTimeout(8000);
      for (const s of steps) {   // a step may navigate (the road book opens a blob: page): that ends its context
        await page.evaluate(s).catch((e) => { if (!/context was destroyed|navigat/i.test(e.message || "")) throw e; });
        await page.waitForTimeout(4000);
      }
      const blocked = await CONTROL(page);
      const viol = (await page.evaluate(() => window.__csp)).filter((x) => !/lr-csp-control/.test(x));
      record("FAIL", `browser ${name}: nessuna violazione CSP`, viol.length === 0, viol.slice(0, 3).join("; "));
      record("FAIL", `browser ${name}: script estraneo bloccato`, blocked);
      record("FAIL", `browser ${name}: nessun errore JS`, errors.length === 0, errors.slice(0, 2).join("; "));
      if (name === "salita") {
        const ac = await page.evaluate(async () => {
          if (!window.firebase || !window.firebase.apps || !window.firebase.apps.length) return "firebase non inizializzato";
          try { await window.firebase.appCheck().getToken(); } catch (e) { return "token App Check: " + (e.code || "errore"); }
          try { await window.firebase.firestore().collection("ratings").limit(1).get(); return "ok"; } catch (e) { return "lettura ratings: " + (e.code || "errore"); }
        });
        record("WARN", "App Check: token e lettura Firestore dall'app", ac === "ok", ac === "ok" ? "" : ac);
      }
    } catch (e) {
      record("FAIL", `browser ${name}: pagina caricata`, false, (e.message || "").split("\n")[0].slice(0, 120));
    }
    await page.close();
  }
  await browser.close();
}

function report(title) {
  const mark = (r) => (r.ok ? "OK" : r.level === "WARN" ? "ATTENZIONE" : "PROBLEMA");
  for (const r of results) console.log(`${mark(r).padEnd(10)} ${r.name}${r.detail ? "  (" + r.detail + ")" : ""}`);
  const bad = results.filter((r) => !r.ok && r.level === "FAIL").length;
  console.log(`\n${results.length} controlli, ${bad} problemi`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const md = [`### ${title}`, "", "| Esito | Controllo | Dettaglio |", "|---|---|---|",
      ...results.map((r) => `| ${mark(r)} | ${r.name} | ${r.detail.replace(/\|/g, "/")} |`), ""].join("\n");
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
  }
  return bad;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const browser = process.argv.includes("--browser");
  try { await (browser ? browserChecks() : httpChecks()); }
  catch (e) { record("FAIL", "il controllo e' partito", false, (e.message || String(e)).slice(0, 120)); }
  process.exitCode = report(browser ? "Sicurezza: browser" : "Sicurezza: header e servizi") ? 1 : 0;
}
