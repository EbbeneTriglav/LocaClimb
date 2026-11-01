// Security and privacy guards of the main page (01/11/2026 review).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");

test("no Google Fonts: the fonts are ours (an IP sent to Google without consent is a GDPR problem in the EU)", () => {
  assert.ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(page));
  const css = readFileSync(new URL("../v2/app.css", import.meta.url), "utf8");
  for (const m of css.matchAll(/url\("\.\.\/(fonts\/barlow\/[^"]+)"\)/g)) assert.ok(existsSync(new URL("../" + m[1], import.meta.url)), m[1]);
  assert.ok(existsSync(new URL("../fonts/barlow/OFL.txt", import.meta.url)), "font licence shipped");
});

test("every third-party script on the main page is pinned with Subresource Integrity", () => {
  for (const m of page.matchAll(/<script\b[^>]*\bsrc="(https?:[^"]+)"[^>]*>/g)) {
    assert.match(m[0], /integrity="sha384-[A-Za-z0-9+/=]{64}"/, m[1]);
    assert.match(m[0], /crossorigin="anonymous"/, m[1]);
  }
});

test("privacy notice exists and is reachable from the app", () => {
  assert.ok(existsSync(new URL("../privacy.html", import.meta.url)));
  const app = readFileSync(new URL("../v2/app.mjs", import.meta.url), "utf8");
  assert.match(app, /href="privacy\.html"/);
});

test("visit statistics: only Cloudflare Web Analytics (cookieless), declared in the privacy notice in both languages", () => {
  const priv = readFileSync(new URL("../privacy.html", import.meta.url), "utf8");
  const it = priv.slice(0, priv.indexOf("In English")), en = priv.slice(priv.indexOf("In English"));
  assert.match(it, /Cloudflare Web Analytics/); assert.match(it, /Non usa cookie/);
  assert.match(en, /Cloudflare Web Analytics \(no cookies/);
  for (const f of ["../index.html", "../classica/index.html"]) {
    const html = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.ok(!/googletagmanager|google-analytics|gtag\(|facebook\.net|hotjar|clarity\.ms/.test(html), f + ": an undeclared tracker");
  }
});

test("Firestore: the community sums can only follow one's own vote, never be rewritten or deleted", () => {
  const block = rules.slice(rules.indexOf("match /ratings/{passId}"), rules.indexOf("match /shared/"));
  assert.ok(!/allow write: if verified\(\);/.test(block), "blanket write on ratings is back");
  assert.match(block, /allow create, update: if verified\(\) && sumsFollowMyVote\(passId\);/);
  assert.ok(!/allow delete/.test(block.slice(0, block.indexOf("match /votes/"))), "the sums must not be deletable");
});
