// "LocaRide sul telefono": install path per browser (v2/lib/install.mjs), the manifest Chrome reads,
// and the service worker's freshness rule (sw.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";
import { installMode, shouldNudge, countVisit, snooze, SNOOZE_DAYS } from "../v2/lib/install.mjs";

const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const FIREFOX = "Mozilla/5.0 (Android 14; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0";

test("installMode: one tap when offered, Share sheet on iOS, browser menu otherwise, nothing when installed", () => {
  assert.equal(installMode({ prompt: true, ua: ANDROID }), "prompt");
  assert.equal(installMode({ ua: ANDROID }), "menu");                 // already installed, or not offered yet
  assert.equal(installMode({ ua: IPHONE }), "ios");
  assert.equal(installMode({ ua: IPAD_DESKTOP_UA }), "ios");          // iPadOS asks for the desktop site
  assert.equal(installMode({ ua: FIREFOX }), "none");
  assert.equal(installMode({ standalone: true, prompt: true, ua: ANDROID }), "none");
});

test("the card: never on a first look, yes when engaged or back on another day, quiet 30 days after Non ora", () => {
  const t0 = Date.UTC(2026, 9, 31, 10);
  let st = countVisit({}, t0);
  assert.equal(st.days, 1);
  assert.equal(countVisit(st, t0 + 3600e3).days, 1);                    // same day: still one visit
  assert.equal(shouldNudge("prompt", st, t0), false);
  assert.equal(shouldNudge("prompt", st, t0, true), true);              // reading a climb page
  st = countVisit(st, t0 + 864e5);
  assert.equal(shouldNudge("ios", st, t0 + 864e5), true);
  assert.equal(shouldNudge("menu", st, t0 + 864e5), false);             // no card where we can't help in one step
  const sn = snooze(st, t0);
  assert.equal(shouldNudge("prompt", sn, t0 + (SNOOZE_DAYS - 1) * 864e5, true), false);
  assert.equal(shouldNudge("prompt", sn, t0 + (SNOOZE_DAYS + 1) * 864e5, true), true);
});

test("manifest: what Chrome needs to offer the install, and the files it points to exist", () => {
  const m = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
  assert.equal(m.id, "/");
  assert.ok(m.name && m.short_name && m.short_name.length <= 12);
  assert.equal(m.display, "standalone");
  assert.ok(m.icons.some((i) => i.sizes === "192x192") && m.icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable"));
  for (const f of [...m.icons, ...(m.screenshots || []), ...m.shortcuts.flatMap((s) => s.icons || [])]) {
    assert.ok(existsSync(new URL("../" + f.src, import.meta.url)), f.src);
  }
  for (const s of m.screenshots || []) {
    const [w, h] = s.sizes.split("x").map(Number);
    assert.ok(Math.max(w, h) / Math.min(w, h) <= 2.3 && Math.min(w, h) >= 320, s.src + ": Chrome ignores screenshots outside 320 px / 2.3:1");
  }
  for (const s of m.shortcuts) assert.match(s.url, /^\.\/#\/(oggi|giro|profilo)$/);
});

test("sw.js: pages and unversioned code always fresh; versioned files and vendor/ from the HTTP cache", () => {
  const ctx = { self: { addEventListener() {}, location: { origin: "https://locaride.app" } }, caches: {}, URL };
  vm.runInNewContext(readFileSync(new URL("../sw.js", import.meta.url), "utf8"), ctx);
  const fresh = (u, mode = "no-cors") => ctx.mustBeFresh({ mode }, new URL(u, "https://locaride.app/"));
  assert.equal(fresh("/", "navigate"), true);
  assert.equal(fresh("/js/state.js"), true);
  assert.equal(fresh("/classica/index.html"), true);
  assert.equal(fresh("/v2/app.mjs?v=21"), false);
  assert.equal(fresh("/v2/vendor/maplibre-gl-5.24.0/maplibre-gl.js"), false);
  assert.equal(fresh("/data/osm_index.json"), false);
});
